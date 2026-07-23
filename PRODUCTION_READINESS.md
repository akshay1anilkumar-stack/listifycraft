# Production readiness changes

This build validates Shopify taxonomy categories against the connected shop before product creation. It no longer trusts hardcoded category or taxonomy-value IDs.

## Publishing safeguards

- Uses Shopify API `2026-07` by default.
- Resolves or verifies the product category using Shopify taxonomy.
- Blocks ambiguous category matches rather than publishing into the wrong category.
- Reads existing product metafield definitions and uses their actual types.
- Converts legacy `string` metafield types to `single_line_text_field`.
- Removes duplicate and empty metafields before submission.
- Uses the submitted inventory quantity instead of always forcing quantity 1.
- Records the Shopify product ID immediately after creation.
- Prevents duplicate products when a later variant or inventory step fails.
- Keeps edited-image uploads on Shopify's staged-upload flow.

## Required scopes

`read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_locations`.

Image attachment through product media uses `write_products`. Add `write_files` only if the app is later changed to keep images in Shopify Files independently of products.

## Live-store validation

A real end-to-end publish still requires valid store credentials, an active location GID, and metafield definitions compatible with the intended store setup. Publish the first test item as `DRAFT`, inspect its category, media, variant, SKU, price, and inventory in Shopify Admin, then enable normal operator use.
