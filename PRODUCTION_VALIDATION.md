# Production validation

- TypeScript/TSX source syntax checked across the server and frontend.
- JSON configuration and lock files validated.
- Shopify `productCreate` with media validated against the current Admin GraphQL schema.
- Shopify `stagedUploadsCreate` validated against the current Admin GraphQL schema.
- Shopify taxonomy search and taxonomy category node verification validated against the current Admin GraphQL schema.
- Shopify `inventoryActivate` with the required `@idempotent` directive validated against the current Admin GraphQL schema.
- A live Shopify publish requires the merchant's store domain, token, scopes, and inventory location.
- Live Gemini analysis/model generation requires at least one configured Gemini API key.
