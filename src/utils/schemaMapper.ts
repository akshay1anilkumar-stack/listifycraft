import { ShopifyMetafield, ValidationError, MasterSchemaOutput } from '../types';

// Standard list of allowed subcategories per garment type
export const GARMENT_SUBCATEGORIES: Record<string, string[]> = {
  "Hoodies & Sweatshirts": ["Zip-Up Hoodie", "Pullover Hoodie", "Crewneck Sweatshirt", "Quarter Zip", "Track Jacket", "Sweatshirt"],
  "Sweatshirts": ["Zip-Up Hoodie", "Pullover Hoodie", "Crewneck Sweatshirt", "Quarter Zip", "Track Jacket", "Sweatshirt"],
  "Knitwear & Sweaters": ["Crewneck Knit", "Cardigan", "Cable Knit", "Quarter Zip Knit", "Turtleneck", "Knitted Vest"],
  "Jerseys": ["Football", "Basketball", "Baseball", "Rugby", "Goalkeeper", "Training"],
  "T-Shirts": ["Graphic Tee", "Band Tee", "Vintage Tee", "Sports Tee", "Movie Tee", "Pocket Tee", "Single Stitch"],
  "Pants": ["Cargo", "Chino", "Jogger", "Track Pants", "Straight Leg", "Wide Leg"],
  "Jeans": ["Cargo", "Chino", "Jogger", "Track Pants", "Straight Leg", "Wide Leg", "Jeans"],
  "Shirts": ["Flannel", "Oxford", "Denim Shirt", "Hawaiian", "Work Shirt", "Long Sleeve", "Short Sleeve"],
  "Shorts": ["Cargo Shorts", "Denim Shorts", "Athletic Shorts", "Basketball Shorts", "Board Shorts"],
  "Jackets": ["Denim Jacket", "Windbreaker", "Bomber Jacket", "Track Jacket", "Leather Jacket", "Puffer Jacket", "Harrington Jacket"]
};

function checkLogicalRelationship(garmentType: string, subcategory: string): boolean {
  const gt = garmentType.toLowerCase();
  const sub = subcategory.toLowerCase();

  const categoriesMap: Record<string, string[]> = {
    "jackets": ["jacket", "coat", "outerwear", "windbreaker", "parka", "blazer", "bomber", "fleece", "puffer"],
    "pants": ["pants", "trousers", "chinos", "cargo", "jogger", "sweatpants", "leggings"],
    "jeans": ["jeans", "denim"],
    "shorts": ["shorts"],
    "t-shirts": ["t-shirt", "tee", "tshirt"],
    "shirts": ["shirt", "button", "flannel", "polo", "oxford"],
    "jerseys": ["jersey"],
    "hoodies & sweatshirts": ["hoodie", "sweatshirt", "crewneck", "pullover", "fleece"],
    "sweatshirts": ["sweatshirt", "crewneck", "pullover", "fleece"],
    "knitwear & sweaters": ["sweater", "cardigan", "knitwear", "knit", "jumper", "turtleneck"],
    "dresses": ["dress", "gown"],
    "skirts": ["skirt"],
    "blouses & tops": ["blouse", "top", "cami", "tank", "crop"],
    "vests": ["vest", "waistcoat", "gilet"],
    "caps": ["cap", "hat", "snapback"],
    "hats": ["hat", "cap", "beanie", "bucket"]
  };

  let subMatchesCategory: string | null = null;
  for (const [cat, keywords] of Object.entries(categoriesMap)) {
    for (const kw of keywords) {
      if (sub.includes(kw)) {
        subMatchesCategory = cat;
        break;
      }
    }
    if (subMatchesCategory) break;
  }

  if (subMatchesCategory) {
    const upperLowerExclusion: Record<string, string[]> = {
      "jackets": ["pants", "jeans", "shorts", "dresses", "skirts", "caps", "hats"],
      "pants": ["jackets", "t-shirts", "shirts", "jerseys", "hoodies & sweatshirts", "sweatshirts", "knitwear & sweaters", "dresses", "skirts", "blouses & tops", "vests", "caps", "hats"],
      "jeans": ["jackets", "t-shirts", "shirts", "jerseys", "hoodies & sweatshirts", "sweatshirts", "knitwear & sweaters", "dresses", "skirts", "blouses & tops", "vests", "caps", "hats"],
      "shorts": ["jackets", "t-shirts", "shirts", "jerseys", "hoodies & sweatshirts", "sweatshirts", "knitwear & sweaters", "dresses", "skirts", "blouses & tops", "vests", "caps", "hats"],
      "t-shirts": ["pants", "jeans", "shorts", "dresses", "skirts", "caps", "hats"],
      "shirts": ["pants", "jeans", "shorts", "dresses", "skirts", "caps", "hats"],
      "jerseys": ["pants", "jeans", "shorts", "dresses", "skirts", "caps", "hats"],
      "hoodies & sweatshirts": ["pants", "jeans", "shorts", "dresses", "skirts", "caps", "hats"],
      "sweatshirts": ["pants", "jeans", "shorts", "dresses", "skirts", "caps", "hats"],
      "dresses": ["pants", "jeans", "shorts", "jackets", "caps", "hats"],
      "skirts": ["pants", "jeans", "shorts", "jackets", "caps", "hats"]
    };

    const exclusions = upperLowerExclusion[subMatchesCategory] || [];
    if (exclusions.some(exc => gt.includes(exc))) {
      return false; 
    }
    return true;
  }

  let singularGt = gt;
  if (gt.endsWith("s")) singularGt = gt.slice(0, -1);
  if (gt.includes("&")) {
    const parts = gt.split("&").map(p => p.trim());
    return parts.some(p => {
      let sing = p;
      if (p.endsWith("s")) sing = p.slice(0, -1);
      return sub.includes(sing);
    }) || sub.includes(singularGt);
  }

  return sub.includes(singularGt);
}

/**
 * Generates verified Fashion Rerun Metafields according to strict business rules.
 * Namespace/key/type must match standard schema, and values must be strings.
 * Never outputs null, empty, or unknown metafields.
 */
export function generateFashionRerunMetafields(sourceData: any): any[] {
  const metafields: any[] = [];
  const addMeta = (namespace: string, key: string, value: any, type: string = "single_line_text_field") => {
    if (value !== undefined && value !== null && String(value).trim() !== "" && String(value).trim() !== "0" && String(value).trim() !== "0.0") {
      const exists = metafields.some((m: any) => m.namespace === namespace && m.key === key);
      if (exists) return;
      metafields.push({
        namespace,
        key,
        type,
        value: String(value).trim()
      });
    }
  };

  if (!sourceData) return metafields;

  const isZero = (val: any) => !val || val === 0 || val === '0' || val === '0.0' || val === 0.0 || val === '0.00' || String(val).trim() === '';

  addMeta("magento", "brand_new", sourceData.brand, "single_line_text_field");
  addMeta("magento", "brand_size", sourceData.taggedSize, "single_line_text_field");
  addMeta("magento", "size", sourceData.recommendedSize, "single_line_text_field");
  addMeta("magento", "condition", sourceData.condition, "single_line_text_field");
  addMeta("magento", "color1", sourceData.primaryColor, "single_line_text_field");
  addMeta("magento", "ebay_outer_shell_material", sourceData.material, "single_line_text_field");

  if (sourceData.visibleFlaws && sourceData.visibleFlaws.length > 0) {
    addMeta("magento", "short_description", sourceData.visibleFlaws.join(", "), "multi_line_text_field");
  }

  const rawGender = sourceData.gender ? String(sourceData.gender).toUpperCase() : "MEN";
  let genderTitle = "Men";
  let fbGender = "Unisex";
  let dept = "Unisex Adults";

  if (rawGender === "MEN") {
    genderTitle = "Men";
    fbGender = "Male";
    dept = "Men";
  } else if (rawGender === "WOMEN") {
    genderTitle = "Women";
    fbGender = "Female";
    dept = "Women";
  }

  addMeta("custom", "gender", genderTitle, "single_line_text_field");
  addMeta("magento", "ebay_department", dept, "single_line_text_field");
  addMeta("magento", "fb_product_gender", fbGender, "string");

  const era = sourceData.era || "";
  const brand = sourceData.brand || "";
  const features = (sourceData.features && sourceData.features.length > 0) ? sourceData.features[0] : "";
  const gt = sourceData.garmentType || "";
  const sz = sourceData.recommendedSize || "";
  const generatedTitle = `${era} ${brand} ${features} ${gt} ${sz}`.replace(/\s+/g, " ").trim().substring(0, 60);
  
  addMeta("global", "title_tag", generatedTitle || "Vintage Item", "string");
  addMeta("global", "description_tag", sourceData.descriptionHtml || generatedTitle || "Vintage Item", "string");
  
  addMeta("magento", "ebay_size_type", "Regular", "single_line_text_field");

  const marketVal = sourceData.market ? sourceData.market.toUpperCase() : "Y2K";
  addMeta("magento", "report_cat1", marketVal, "string");
  addMeta("magento", "report_cat2", rawGender === "WOMEN" ? "WOMEN" : "MEN", "string");
  addMeta("magento", "report_cat3", sourceData.garmentType || "Jackets", "string");

  let productLabel = marketVal === "Y2K" ? "Y2K" : (marketVal === "VINTAGE" ? "Vintage" : (marketVal === "RETRO" ? "Retro" : "Thrift"));
  addMeta("magento", "product_label", productLabel, "string");
  addMeta("magento", "fb_product_brand", sourceData.brand || "Others", "string");
  addMeta("magento", "google_product_category", "1604", "string");

  const catPos = `Default Category/${marketVal}=0,Default Category/${marketVal}/${rawGender}=0,Default Category/${marketVal}/${rawGender}/${sourceData.garmentType || "Jackets"}=0`;
  addMeta("magento", "categories_position", catPos, "string");

  addMeta("magento", "in_html_sitemap", "Yes", "string");
  addMeta("magento", "in_xml_sitemap", "Yes", "string");
  addMeta("magento", "is_facebook_product", "Yes", "string");
  addMeta("magento", "is_recurring", "Yes", "string");
  addMeta("magento", "product_condition", "New", "string");
  addMeta("magento", "redirect_to_product", "Yes", "string");
  addMeta("magento", "use_in_crosslinking", "Yes", "string");
  addMeta("magento", "product_type", "simple", "string");
  addMeta("magento", "product_online", "1", "string");
  addMeta("magento", "sm_featured", "No", "string");
  addMeta("magento", "tag", "No", "string");
  addMeta("magento", "mst_search_weight", "0", "string");

  addMeta("magento", "ebay_style", sourceData.subcategory || sourceData.garmentType, "single_line_text_field");
  
  addMeta("magento", "ebay_brand", sourceData.brand || "Vintage", "single_line_text_field");
  const pType = sourceData.productType || ("Migration_" + (sourceData.garmentType || "Jackets"));
  if (pType === "Migration_Jackets") addMeta("magento", "ebay_type", "Jacket", "single_line_text_field");
  else if (pType === "Migration_Hoodies") addMeta("magento", "ebay_type", "Hoodie", "single_line_text_field");
  else if (pType === "Migration_Sweatshirts") addMeta("magento", "ebay_type", "Sweaters", "single_line_text_field");
  else if (pType === "Migration_Shirts") addMeta("magento", "ebay_type", "Shirt", "single_line_text_field");

  if (sourceData.measurements) {
    const m = sourceData.measurements;
    if(!isZero(m.length)) addMeta("magento", "length", m.length, "single_line_text_field");
    let chestVal = m.chest || null;
    if (isZero(chestVal) && !isZero(m.pitToPit)) {
      const p2pVal = parseFloat(String(m.pitToPit));
      if (!isNaN(p2pVal)) chestVal = String(p2pVal * 2);
    }
    if(!isZero(chestVal)) addMeta("magento", "chest", chestVal, "single_line_text_field");
    if(!isZero(m.pitToPit)) addMeta("magento", "pit_to_pit", m.pitToPit, "single_line_text_field");
    if(!isZero(m.sleeve)) addMeta("magento", "sleeve", m.sleeve, "single_line_text_field");
    if(!isZero(m.waist)) addMeta("magento", "waist", m.waist, "single_line_text_field");
    if(!isZero(m.shoulder)) addMeta("magento", "shoulder", m.shoulder, "single_line_text_field");
    if(!isZero(m.inseam)) addMeta("magento", "inseam", m.inseam, "single_line_text_field");
    if(!isZero(m.rise)) addMeta("magento", "rise", m.rise, "single_line_text_field");
  }

  return metafields;}

/**
 * Main Validation Engine checks for all required Shopify traits and metadata.
 * Returns standard ValidationErrors array.
 */
export function runValidationEngine(
  sourceData: any,
  shopifyProduct: any,
  verifiedMappings: Record<string, any> = {}
): any[] {
  const items: any[] = [];

  // RULE-01: IMAGE REQUIRED
  if (!shopifyProduct.imageUrl || String(shopifyProduct.imageUrl).trim() === "" || String(shopifyProduct.imageUrl).includes("unsplash.com")) {
    items.push({
      code: "MISSING_IMAGE",
      path: "shopifyProduct.imageUrl",
      message: "Product image URL is required and cannot be unsplash placeholder.",
      blocking: true
    });
  }

  // RULE-02: TAXONOMY CATEGORY REQUIRED
  if (!shopifyProduct.category || !String(shopifyProduct.category).startsWith("gid://shopify/TaxonomyCategory/")) {
    items.push({
      code: "MISSING_TAXONOMY_CATEGORY",
      path: "shopifyProduct.category",
      message: "Verified Shopify taxonomy category GID required (gid://shopify/TaxonomyCategory/<taxonomy-id>).",
      blocking: true
    });
  }

  // RULE-03: VENDOR LOCKED
  if (shopifyProduct.vendor !== "Fashion Rerun Vintage") {
    items.push({
      code: "INVALID_VENDOR",
      path: "shopifyProduct.vendor",
      message: "Vendor must be exactly 'Fashion Rerun Vintage'.",
      blocking: true
    });
  }

  // RULE-10: PRODUCT TYPE REGISTRY
  const knownTypes = Array.from(new Set([
    ...Object.values(verifiedMappings || {}).map((v: any) => typeof v === "string" ? v : v?.productType).filter(Boolean),
    "Migration_Accessories", "Migration_Active Wears", "Migration_Blouses & Tops", "Migration_Caps",
    "Migration_Cargo & Track Pants", "Migration_Co-ord", "Migration_Dresses", "Migration_Fleece", "Migration_Fur",
    "Migration_Hats", "Migration_Hoodies", "Migration_Hoodies & Sweatshirts", "Migration_Jackets", "Migration_Jeans",
    "Migration_Jeans & Pants", "Migration_Jerseys", "Migration_Jorts & Shorts", "Migration_Jumper & Knitwear",
    "Migration_Jumpsuits & Rompers", "Migration_Knitwear & Sweaters", "Migration_Nightwear and Lingerie",
    "Migration_Pants", "Migration_Shirts", "Migration_Shorts", "Migration_Skirts", "Migration_Sweaters",
    "Migration_Sweatshirts", "Migration_Swimwear", "Migration_T-Shirts", "Migration_Tops", "Migration_Tracksuits",
    "Migration_Vests", "Migration_Y2K T-Shirts", "Migration_Y2K Tops", "POPUP", "Popup"
  ]));
  if (!knownTypes.includes(shopifyProduct.productType)) {
    items.push({
      code: "UNKNOWN_PRODUCT_TYPE",
      path: "shopifyProduct.productType",
      message: `Product type ${shopifyProduct.productType} is not registered in the pipeline.`,
      blocking: true
    });
  }

  if (!shopifyProduct.title || String(shopifyProduct.title).trim() === "") {
    items.push({ code: "MISSING_TITLE", path: "shopifyProduct.title", message: "Product title is required.", blocking: true });
  }

  if (!shopifyProduct.sku || String(shopifyProduct.sku).trim() === "") {
    items.push({ code: "MISSING_SKU", path: "shopifyProduct.sku", message: "SKU is required.", blocking: true });
  }

  const priceNum = Number(shopifyProduct.price);
  if (!shopifyProduct.price || isNaN(priceNum) || priceNum <= 0) {
    items.push({ code: "INVALID_PRICE", path: "shopifyProduct.price", message: "Price is required and must be positive.", blocking: true });
  }

  const metafields = shopifyProduct.metafields || [];
  const seenMetafields = new Set<string>();
  metafields.forEach((m: any) => {
    const compoundKey = `${m.namespace}.${m.key}`;
    if (seenMetafields.has(compoundKey)) {
      items.push({ code: "DUPLICATE_METAFIELD", path: `shopifyProduct.metafields[${compoundKey}]`, message: `Duplicate metafield detected for key "${compoundKey}".`, blocking: true });
    } else {
      seenMetafields.add(compoundKey);
    }
  });

  metafields.forEach((m: any, idx: number) => {
    if (m.value === undefined || m.value === null || String(m.value).trim() === "") {
      items.push({ code: "EMPTY_METAFIELD_VALUE", path: `shopifyProduct.metafields[${idx}]`, message: `Metafield "${m.namespace}.${m.key}" has an empty value.`, blocking: true });
    }
  });

  metafields.forEach((m: any) => {
    if (m.value && String(m.value).startsWith("gid://shopify/Metaobject/")) {
      const parts = m.value.split("/");
      const lastPart = parts[parts.length - 1];
      if (!/^\d+$/.test(lastPart)) {
        items.push({ code: "INVALID_METAOBJECT_GID", path: `shopifyProduct.metafields[${m.namespace}.${m.key}]`, message: `Invalid Metaobject GID format.`, blocking: true });
      }
    }
  });

  return items;}


/**
 * Convert old/raw results into standard schema version 3.0.0
 */
export function convertToNewSchema(oldResult: any, verifiedMappings: Record<string, any> = {}): MasterSchemaOutput {
  if (!oldResult) return {} as any;

  // If already matches Version 3.0.0, return directly
  if (oldResult.schemaVersion === "3.0.0") {
    return oldResult;
  }

  const classification = oldResult.classification || {};
  const observations = oldResult.observations || {};
  const measurements = oldResult.measurements || {};
  const shopify = oldResult.shopify || {};
  const confidence = oldResult.confidence || {};
  const processing = oldResult.processing || {};

  const market = String(classification.market || "Y2K").toUpperCase();
  const gender = String(classification.gender || "WOMEN").toUpperCase();
  const garmentType = classification.garment_type || "Pants";
  const brand = classification.brand || "Nike";
  const era = classification.era_estimate || "Y2K";
  const taggedSize = classification.tagged_size || "M";
  const recommendedSize = classification.recommended_size || taggedSize || "M";
  
  const primaryColor = classification.primary_color || observations.colors?.[0] || "Blue";
  const condition = classification.condition || "Very Good";
  const subcategory = classification.subtype || "Track Pants";
  const material = classification.material || "";
  const secondaryColors = observations.colors?.filter((c: string) => c !== primaryColor) || [];
  
  const features = observations.features || [];
  const visibleFlaws = observations.visible_flaws || [];

  const waist = measurements.waist || null;
  const inseam = measurements.inseam || null;
  const rise = measurements.rise || null;
  const length = measurements.length || null;
  const pitToPit = measurements.pit_to_pit || null;
  let chest = measurements.chest || null;
  if (pitToPit) {
    const p2pVal = parseFloat(String(pitToPit));
    if (!isNaN(p2pVal)) {
      chest = String(p2pVal * 2);
    }
  }
  const sleeve = measurements.sleeve || null;
  const shoulder = measurements.shoulder || null;

  // Dynamic Shopify category taxonomy GID determination from verifiedMappings
  let categoryGid = "";
  if (garmentType) {
    const mappingKey = Object.keys(verifiedMappings).find(k => k.toLowerCase() === String(garmentType).toLowerCase());
    if (mappingKey && verifiedMappings[mappingKey]?.gid) {
      categoryGid = verifiedMappings[mappingKey].gid;
    }
  }

  const sku = shopify.variants?.[0]?.sku || oldResult.sku || "";
  const price = shopify.variants?.[0]?.price || shopify.price || "125.00";
  const title = shopify.title || "";
  const descriptionHtml = "";
  const imageUrl = oldResult.imageUrl || shopify.imageUrl || "";

  // Prepare source data structure
  const sourceData = {
    market,
    gender,
    garmentType,
    subcategory,
    brand,
    era,
    taggedSize,
    recommendedSize,
    primaryColor,
    secondaryColors,
    condition,
    material,
    features,
    visibleFlaws,
    measurements: {
      pitToPit,
      length,
      shoulder,
      sleeve,
      waist,
      chest,
      inseam,
      rise
    }
  };

  // Generate Shopify fields and metafields
  const metafields = generateFashionRerunMetafields(sourceData);

  
  // Taxonomy values are resolved and validated live by the Shopify publish service.
  // Do not send guessed static taxonomy value IDs.
  const taxonomyAttributes: any[] = [];
  
  // Also fix productType to use exact Migration_* format if mapped
  const mappedProductType = shopify?.product_type || shopify?.productType || ("Migration_" + (garmentType || "Jackets"));

  const shopifyProduct = {
    title,
    descriptionHtml,
    vendor: "Fashion Rerun Vintage",
    productType: mappedProductType,
    price,
    sku,
    category: categoryGid,
    tags: shopify.tags || [],
    status: (shopify.status || "DRAFT") as 'DRAFT' | 'ACTIVE',
    imageUrl,
    metafields,
    taxonomyAttributes
  };

  // Run full validation engine
  const validationItems = runValidationEngine(sourceData, shopifyProduct, verifiedMappings);
  const isBlocked = validationItems.some(v => v.blocking);
  const isWarning = validationItems.some(v => !v.blocking);

  let status: "BLOCKED" | "WARNING" | "READY" | "PENDING_REVIEW" = isBlocked ? "BLOCKED" : (isWarning ? "WARNING" : "READY");
  if (status === "READY" && processing?.requiresHumanReview) {
    status = "PENDING_REVIEW";
  }

  // Unresolved taxonomy mappings extractor
  const unresolvedMappings = validationItems.filter(v => v.code === "MISSING_TAXONOMY_MAPPING");

  return {
    schemaVersion: "3.0.0",
    sourceData,
    shopifyProduct,
    collectionRouting: {
      market,
      gender,
      category: garmentType,
      additionalCollectionIds: shopify.additionalCollectionIds || []
    },
    unresolvedMappings,
    validation: {
      status,
      items: validationItems
    },
    processing: {
      modelUsed: processing.modelUsed || "gemini-3.6-flash",
      failoverActive: processing.failoverActive || false,
      requiresHumanReview: true,
      modelImageUrl: oldResult.modelImageUrl,
      modelPromptDescription: oldResult.modelPromptDescription,
      imageUrl: oldResult.imageUrl,
      updatedCreditBalance: oldResult.updatedCreditBalance
    }
  };
}

/**
 * Converts 3.0.0 MasterSchemaOutput back to the internal legacy AIResult format
 * to prevent breaking the extensive UI components of BatchStudio.tsx
 */
export function convertToOldSchema(newResult: any): any {
  if (!newResult) return null;

  // Handle case where we already have the legacy schema format
  if (newResult.classification && newResult.shopify) {
    return newResult;
  }

  const sourceData = newResult.sourceData || {};
  const shopifyProduct = newResult.shopifyProduct || {};
  const collectionRouting = newResult.collectionRouting || {};
  const validation = newResult.validation || {};
  const processing = newResult.processing || {};
  const measurements = sourceData.measurements || {};

  const colors = [];
  if (sourceData.primaryColor) colors.push(sourceData.primaryColor);
  if (sourceData.secondaryColors) {
    colors.push(...sourceData.secondaryColors);
  }

  const oldResult: any = {
    classification: {
      market: sourceData.market || "Y2K",
      gender: sourceData.gender || "WOMEN",
      garment_type: sourceData.garmentType || "Pants",
      brand: sourceData.brand || "Nike",
      era_estimate: sourceData.era || "Y2K",
      tagged_size: sourceData.taggedSize || "M",
      recommended_size: sourceData.recommendedSize || sourceData.taggedSize || "M",
      primary_color: sourceData.primaryColor || "Blue",
      condition: sourceData.condition || "Very Good",
      subtype: sourceData.subcategory || "Track Pants",
      material: sourceData.material || ""
    },
    observations: {
      colors,
      features: sourceData.features || [],
      visible_flaws: sourceData.visibleFlaws || []
    },
    measurements: {
      unit: "cm",
      waist: measurements.waist || "",
      inseam: measurements.inseam || "",
      rise: measurements.rise || "",
      length: measurements.length || "",
      pit_to_pit: measurements.pitToPit || "",
      shoulder: measurements.shoulder || "",
      sleeve: measurements.sleeve || "",
      chest: measurements.chest || "",
      bust: ""
    },
    shopify: {
      title: shopifyProduct.title || "",
      descriptionHtml: shopifyProduct.descriptionHtml || "",
      description_html: shopifyProduct.descriptionHtml || "",
      price: shopifyProduct.price || "125.00",
      vendor: shopifyProduct.vendor || "Fashion Rerun Vintage",
      productType: shopifyProduct.productType || "",
      product_type: shopifyProduct.productType || "",
      tags: shopifyProduct.tags || [],
      metafields: shopifyProduct.metafields || [],
      files: [],
      productOptions: [
        {
          name: "Title",
          position: 1,
          values: [{ name: "Default Title" }]
        }
      ],
      variants: [
        {
          optionValues: [{ optionName: "Title", name: "Default Title" }],
          price: shopifyProduct.price || "125.00",
          sku: shopifyProduct.sku || "",
          barcode: "",
          inventoryPolicy: "DENY",
          taxable: true,
          inventoryItem: {
            sku: shopifyProduct.sku || "",
            tracked: true,
            requiresShipping: true
          }
        }
      ],
      additionalCollectionIds: collectionRouting.additionalCollectionIds || []
    },
    confidence: {
      brand: 0.95,
      market: 0.90,
      garment_type: 0.95,
      gender: 0.95,
      subtype: 0.90,
      tagged_size: 0.95,
      condition: 0.90
    },
    warnings: validation.items?.filter((v: any) => !v.blocking).map((v: any) => v.message) || [],
    processing: {
      modelUsed: processing.modelUsed || "gemini-3.6-flash",
      failoverActive: processing.failoverActive || false,
      requiresHumanReview: processing.requiresHumanReview !== false
    }
  };

  if (processing.modelImageUrl) oldResult.modelImageUrl = processing.modelImageUrl;
  if (processing.modelPromptDescription) oldResult.modelPromptDescription = processing.modelPromptDescription;
  if (processing.imageUrl) oldResult.imageUrl = processing.imageUrl;
  if (processing.updatedCreditBalance !== undefined) oldResult.updatedCreditBalance = processing.updatedCreditBalance;

  return oldResult;
}
