import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const shopName = process.env.SHOPIFY_SHOP_DOMAIN || "";
const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "";
const locationId = process.env.SHOPIFY_INVENTORY_LOCATION_ID || "";
const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-07";

async function shopifyGraphQL(query: string, variables: any) {
  let domain = shopName.trim();
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  if (!domain.startsWith("https://")) domain = `https://${domain}`;

  const url = `${domain}/admin/api/${apiVersion}/graphql.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error (HTTP ${response.status}): ${text}`);
  }

  const json: any = await response.json();
  if (json.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

async function runDiagnostics() {
  console.log("==================================================");
  console.log("   SHOPIFY END-TO-END DIAGNOSTIC CHECKER          ");
  console.log("==================================================");
  console.log(`Shop Domain:   ${shopName || "(Not Configured)"}`);
  console.log(`Access Token:  ${accessToken ? "PRESENT (Redacted)" : "MISSING"}`);
  console.log(`Location GID:  ${locationId || "(Not Configured)"}`);
  console.log(`API Version:   ${apiVersion}`);
  console.log("==================================================\n");

  if (!shopName || !accessToken) {
    console.error("ERROR: SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN are required in .env file.");
    process.exit(1);
  }

  let success = true;

  // 1. Authenticated Connection Check
  console.log("[1/5] Testing Authenticated Connection...");
  try {
    const shopQuery = `
      query {
        shop {
          name
          primaryDomain {
            url
          }
        }
      }
    `;
    const shopData = await shopifyGraphQL(shopQuery, {});
    console.log(`✅ Connection Successful!`);
    console.log(`   Connected Store Name: ${shopData.shop?.name}`);
    console.log(`   Primary Domain URL:   ${shopData.shop?.primaryDomain?.url}\n`);
  } catch (error: any) {
    console.error(`❌ Connection Test Failed: ${error.message}\n`);
    success = false;
  }

  // 2. Fetch/List Products Check
  console.log("[2/5] Checking Product Read Access & Listing...");
  try {
    const productsQuery = `
      query {
        products(first: 5) {
          nodes {
            id
            title
            handle
            status
          }
        }
      }
    `;
    const productsData = await shopifyGraphQL(productsQuery, {});
    const products = productsData.products?.nodes || [];
    console.log(`✅ Product Listing Successful! Retrieved ${products.length} product(s).`);
    products.forEach((p: any, idx: number) => {
      console.log(`   ${idx + 1}. [${p.status}] ${p.title} (GID: ${p.id})`);
    });
    console.log();
  } catch (error: any) {
    console.error(`❌ Product Listing Check Failed: ${error.message}\n`);
    success = false;
  }

  // 3. Location Verification Check
  console.log("[3/5] Checking Inventory Location...");
  try {
    const locationQuery = `
      query {
        locations(first: 50) {
          nodes {
            id
            name
            isActive
          }
        }
      }
    `;
    const locationData = await shopifyGraphQL(locationQuery, {});
    const locations = locationData.locations?.nodes || [];
    console.log(`✅ Found ${locations.length} active location(s) in store.`);
    
    let locationMatched = false;
    locations.forEach((loc: any) => {
      const isTarget = loc.id === locationId || loc.id.endsWith(locationId);
      if (isTarget) {
        locationMatched = true;
        console.log(`   👉 MATCHED: "${loc.name}" (ID: ${loc.id}) [Active: ${loc.isActive}]`);
      } else {
        console.log(`      Location: "${loc.name}" (ID: ${loc.id}) [Active: ${loc.isActive}]`);
      }
    });

    if (!locationId) {
      console.warn("⚠️ Warning: No SHOPIFY_INVENTORY_LOCATION_ID was configured in .env.");
    } else if (!locationMatched) {
      console.error(`❌ Configured location GID "${locationId}" was NOT found or is inactive in the store.`);
      success = false;
    } else {
      console.log(`✅ Configured Location GID is valid and active!\n`);
    }
  } catch (error: any) {
    console.error(`❌ Location Check Failed: ${error.message}\n`);
    success = false;
  }

  // 4. Standard Product Taxonomy API check
  console.log("[4/5] Testing Shopify Standard Taxonomy Category Search...");
  try {
    const taxonomyQuery = `
      query ResolveTaxonomy($search: String!) {
        taxonomy {
          categories(first: 5, search: $search) {
            nodes {
              id
              name
              fullName
            }
          }
        }
      }
    `;
    const taxData = await shopifyGraphQL(taxonomyQuery, { search: "Apparel" });
    const nodes = taxData.taxonomy?.categories?.nodes || [];
    console.log(`✅ Taxonomy Query Successful! Found ${nodes.length} categories for search term "Apparel".`);
    nodes.forEach((n: any) => {
      console.log(`   Category GID: ${n.id} (${n.fullName})`);
    });
    console.log();
  } catch (error: any) {
    console.error(`❌ Taxonomy Category Search Failed: ${error.message}\n`);
    success = false;
  }

  // 5. Metafield Definitions Audit
  console.log("[5/5] Auditing Store Product Metafield Definitions...");
  try {
    const metafieldsQuery = `
      query {
        metafieldDefinitions(first: 250, ownerType: PRODUCT) {
          nodes {
            namespace
            key
            type {
              name
            }
          }
        }
      }
    `;
    const metafieldsData = await shopifyGraphQL(metafieldsQuery, {});
    const existingDefs = metafieldsData.metafieldDefinitions?.nodes || [];
    const existingMap = new Map<string, string>();
    existingDefs.forEach((def: any) => {
      existingMap.set(`${def.namespace}.${def.key}`, def.type?.name || "");
    });

    console.log(`✅ Retrieved ${existingDefs.length} product metafield definitions.`);

    const requiredMetafields = [
      { namespace: "magento", key: "brand_new", type: "single_line_text_field" },
      { namespace: "magento", key: "size", type: "single_line_text_field" },
      { namespace: "magento", key: "brand_size", type: "single_line_text_field" },
      { namespace: "magento", key: "color1", type: "single_line_text_field" },
      { namespace: "magento", key: "condition", type: "single_line_text_field" },
      { namespace: "custom", key: "gender", type: "single_line_text_field" },
      { namespace: "magento", key: "length", type: "single_line_text_field" },
      { namespace: "magento", key: "chest", type: "single_line_text_field" },
      { namespace: "magento", key: "pit_to_pit", type: "single_line_text_field" },
      { namespace: "magento", key: "sleeve", type: "single_line_text_field" },
      { namespace: "magento", key: "waist", type: "single_line_text_field" },
      { namespace: "magento", key: "inseam", type: "single_line_text_field" },
      { namespace: "magento", key: "rise", type: "single_line_text_field" },
      { namespace: "magento", key: "shoulder", type: "single_line_text_field" },
      { namespace: "custom", key: "condition_info", type: "json" },
      { namespace: "magento", key: "short_description", type: "multi_line_text_field" }
    ];

    let missingCount = 0;
    let typeMismatchCount = 0;

    requiredMetafields.forEach((req) => {
      const compoundKey = `${req.namespace}.${req.key}`;
      const existingType = existingMap.get(compoundKey);

      if (!existingType) {
        console.warn(`   ⚠️ MISSING DEFINITION: "${compoundKey}" (Expected Type: ${req.type})`);
        missingCount++;
      } else if (existingType !== req.type) {
        console.error(`   ❌ TYPE MISMATCH: "${compoundKey}" (Store Type: ${existingType}, Expected: ${req.type})`);
        typeMismatchCount++;
        success = false;
      } else {
        console.log(`   ✅ VALID: "${compoundKey}" matches type ${req.type}`);
      }
    });

    console.log();
    if (missingCount > 0) {
      console.warn(`⚠️ Warning: ${missingCount} required metafield definition(s) are missing in Shopify Admin.`);
      console.warn("   While the API may still allow publishing them, they will not be usable as storefront filters");
      console.warn("   in the Shopify Search & Discovery app until definitions are created.\n");
    }
    if (typeMismatchCount > 0) {
      console.error(`❌ Error: ${typeMismatchCount} metafield definition(s) have type mismatches.`);
      console.error("   Shopify will REJECT publishing products if the submitted metafield values do not match the store's definition type.\n");
    }
  } catch (error: any) {
    console.error(`❌ Metafield Definitions Audit Failed: ${error.message}\n`);
    success = false;
  }

  console.log("==================================================");
  if (success) {
    console.log("🎉 DIAGNOSTIC COMPLETED: ALL SYSTEM CHECKS PASSED!");
  } else {
    console.log("⚠️ DIAGNOSTIC COMPLETED: SOME CHECKS FAILED OR NEED ATTENTION.");
  }
  console.log("==================================================");
}

runDiagnostics().catch((err) => {
  console.error("Unhandled diagnostic crash:", err);
  process.exit(1);
});
