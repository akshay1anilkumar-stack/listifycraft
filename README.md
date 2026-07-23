# Fashion Rerun Listing Studio

Production source package preserving the original application workflow while adding persistent image storage, SKU image grouping, Gemini key rotation, Shopify taxonomy validation, and complete Shopify media publishing.

## Requirements

- Node.js 22.5 or newer
- A Google Gemini API key (up to three keys supported)
- A Shopify custom app Admin API token

## Install

```bash
cp .env.example .env
npm ci
npm run build
npm start
```

Development mode:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Initial administrator

The default values in `.env.example` are:

- Username: `master_admin`
- Password: `FashionRerun@2026!`

Change the password and `SESSION_SECRET` before production use. You can use `INITIAL_ADMIN_PASSWORD_HASH` instead of a plain initial password.

## Gemini configuration

```env
GEMINI_API_KEY_1=
GEMINI_API_KEY_2=
GEMINI_API_KEY_3=
```

The app rotates keys only for retryable quota, timeout, and service errors. Listing analysis is cached by image content and prompt configuration, so reopening or reprocessing the same unchanged product does not consume another analysis call. AI model generation remains an explicit user action.

## SKU image grouping

Files such as:

```text
A0188889a.jpg
A0188889b.jpg
A0188889c.jpg
```

are grouped under SKU `A0188889` and ordered by the final letter. The common `.jog` filename typo is accepted and normalized to JPEG.

Original, processed, and approved AI model images are stored in SQLite before they are used for model generation or Shopify publishing.

## Shopify configuration

```env
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_API_VERSION=2026-07
SHOPIFY_INVENTORY_LOCATION_ID=gid://shopify/Location/...
SHOPIFY_DEFAULT_VENDOR=Fashion Rerun Vintage
```

Required scopes:

```text
read_products
write_products
read_inventory
write_inventory
read_locations
```

Publishing performs these steps:

1. Validate or resolve the Shopify Standard Product Taxonomy category.
2. Prepare every approved original, processed, and model image in gallery order.
3. Upload local database-backed images through Shopify staged uploads.
4. Create the product with all media and listing details.
5. Update variant price, compare-at price, SKU, and barcode.
6. Activate inventory at the configured location using an idempotency key.
7. Save Shopify product and media IDs back to SQLite for retry safety.

## Database

The default database is:

```text
src/data/listing-studio.sqlite
```

For an office server, set a persistent absolute path:

```env
DATABASE_PATH=/var/lib/listing-studio/listing-studio.sqlite
```

The database uses WAL mode and stores application data, image records/BLOBs, AI cache entries, API usage, audit records, and Shopify upload tracking.

## Production

Run the compiled server with a process manager such as PM2 and place it behind Nginx or Caddy with HTTPS. Keep `.env` and the SQLite database outside public repositories and back them up regularly.
