# Fashion Rerun AI Listing Studio — Shopify Rebuild Report

## Result

The uploaded source was re-audited and patched against the connected Fashion Rerun Shopify store and the current Shopify Admin GraphQL schema.

## Implemented changes

- Replaced forgeable role/client request headers with signed Bearer sessions.
- Added scrypt password hashing, password-length enforcement, session expiry and protected API middleware.
- Removed the default plaintext password and cleared stored Shopify secrets from the bundled JSON database.
- Redacted access tokens from configuration responses and prevented browser configuration from overwriting environment-managed tokens.
- Fixed destructive database reads that erased products, batches and audit logs.
- Added environment-based Shopify domain, token, API version, inventory location and default vendor configuration.
- Set the default supported Shopify API version to `2025-10`; it remains configurable.
- Updated product creation to `productCreate(product: ProductCreateInput!)`.
- Replaced removed `productVariantUpdate` with `productVariantsBulkUpdate`.
- Replaced automatic `locations(first: 1)` inventory behavior with an explicitly configured location GID.
- Updated inventory setup to `inventoryActivate` for the newly created inventory item.
- Validated all three Shopify mutations against the current Admin GraphQL schema.
- Expanded product-type compatibility for the existing Fashion Rerun `Migration_*` values.
- Updated taxonomy validation to support current Shopify taxonomy category GIDs instead of only obsolete `aa-*` identifiers.
- Changed the standard vendor to `Fashion Rerun Vintage` and removed Listify branding.
- Preserved Fashion Rerun smart-collection routing tags rather than confusing them with Shopify taxonomy.
- Removed unsafe HTML injection from product description previews.
- Disabled fabricated eBay publishing and fake listing IDs with an explicit `501 Not Implemented` response.
- Disabled simulated image-processing claims and telemetry until a real image processor is connected.
- Added `.env.example`, password-hash utility, package lockfile and health endpoint.
- Removed temporary patch/fix scripts from the distributed project.
- Made the server port configurable.

## Verification completed

- `npm install`: passed
- `npm run lint`: passed
- `npm run build`: passed
- Server health smoke test: passed
- Unauthenticated protected API test: correctly returned HTTP 401
- Shopify GraphQL product-create validation: passed
- Shopify GraphQL variant-update validation: passed
- Shopify GraphQL inventory-activation validation: passed

## Required setup before Shopify writes

Copy `.env.example` to `.env` and provide real values for:

- `SESSION_SECRET`
- `INITIAL_ADMIN_PASSWORD_HASH`
- `SHOPIFY_SHOP_DOMAIN`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_API_VERSION`
- `SHOPIFY_INVENTORY_LOCATION_ID`
- `SHOPIFY_DEFAULT_VENDOR`

The configured Shopify app/token needs at least product and inventory read/write scopes used by the validated mutations.

## Deliberately not faked

The following features remain disabled until real integrations are supplied:

- eBay OAuth and listing creation
- Production background removal/image rendering
- Automatic exchange-rate service
- Automatic publication to selected Shopify sales channels

Products can be created with status, but explicit channel publication should be implemented with selected publication GIDs and `publishablePublish` before relying on automatic storefront visibility.

## Remaining engineering recommendation

The frontend bundle is approximately 629 KB and builds with a chunk-size warning. This does not block operation, but route/component code splitting is recommended.
