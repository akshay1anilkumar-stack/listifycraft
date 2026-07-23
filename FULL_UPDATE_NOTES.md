# Fashion Rerun Listing Studio — Full Update

## Implemented in this release

- Preserves the full v3 AI master schema through review and publishing.
- Editable review fields: title, description, price, compare-at price, SKU, barcode, quantity, status, vendor, product type, Shopify taxonomy category GID, market, gender, garment type, brand, tagged/recommended size, color, material, condition, measurements, tags and metafields.
- Multi-image Shopify publishing for approved original, edited and AI-model images (up to 20).
- AI try-on is approval-only; it never replaces the original product image automatically.
- Stable publish idempotency based on product identity to prevent duplicate products after retries.
- Shopify category verification/resolution and cached taxonomy lookups.
- Cached Shopify metafield definitions, collections and locations.
- Live `/api/shopify/collections` and `/api/shopify/locations` reference endpoints.
- Variant price, compare-at price, barcode and tracked SKU publishing.
- Configurable inventory quantity and location activation.
- Role-gated publishing, authenticated APIs, session expiry and request-rate guardrails.
- SQLite WAL persistence and legacy JSON migration.
- AI model credit accounting respects `AI_MODEL_CREDIT_COST`.
- Production build and startup smoke tested.

## Deployment requirements

- Node.js 22.5+
- A persistent `DATABASE_PATH` outside the source folder on the office server
- Strong `SESSION_SECRET` and `INITIAL_ADMIN_PASSWORD_HASH`
- Shopify token scopes: read/write products, read/write inventory, read locations, plus any metafield/file scopes your store workflow requires
- Gemini API key and a supported image-capable model configured in `.env`
- Reverse proxy with HTTPS for network use
- Back up the SQLite database file regularly

## Important operating rule

AI model images must be visually reviewed. Generative image models cannot guarantee pixel-perfect preservation of small logos, text or vintage graphics. Keep the original product images in the Shopify gallery.
