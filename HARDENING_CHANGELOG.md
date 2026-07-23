# Application A Hardening Changelog

Date: 22 July 2026

## Primary-codebase decision

Application A is now the maintained source of truth. Application B was not merged wholesale.

## Security

- Disabled public self-registration.
- Added centralized role and tenant authorization.
- Restricted configuration, users, audit logs, batches, images, and publishing routes.
- Bound AI credit/licence checks to the signed session identity.
- Removed the known default administrator password and random session-secret fallback.
- Added strict production startup checks for secrets.
- Added secure headers, request limits, login throttling, and safer error responses.
- Added signed expiring image URLs and tenant ownership checks.
- Added HTTPS-only remote image allowlisting, DNS/private-network blocking, timeouts, and byte limits.
- Added Shopify webhook HMAC verification and event deduplication.

## Shopify integration

- Kept Admin GraphQL API 2026-07 as the default.
- Added timeout, retry, jitter, 429/5xx handling, and GraphQL throttle-cost awareness.
- Added live Shopify preflight for scopes, locations, publications, and configuration.
- Added explicit `publishablePublish` support for selected publications.
- Added persistent idempotency records for product publish requests.
- Added live SKU lookup and explicit update-existing protection.
- Added product update support for reviewed existing records.
- Added SEO input support.
- Added manual collection joins.
- Added tracked inventory setting with `inventorySetQuantities` and idempotent activation.
- Added product and inventory webhook registration/processing.
- Added a controlled durable SQLite publish queue and batch draft endpoint.

## Product and image workflow

- Added hash-based image-content deduplication.
- Preserved ordered multi-image Shopify uploads and alt text.
- Added stricter image MIME, size, access, and lifecycle handling.
- Fixed empty HTML-description generation.
- Replaced fake throttle telemetry with real Shopify response data.

## Frontend and administration

- Removed public registration UI.
- Added administrator-created users.
- Added Shopify preflight/publication controls.
- Added explicit update-existing and operator-publish controls.
- Updated application types and API wiring for hardened endpoints.

## Packaging and validation

- Added `validate:security` and combined `validate` scripts.
- Added a dedicated production server build using esbuild.
- Updated `.env.example` and README with secure deployment steps.
- Removed temporary hardening backup files from the delivery archive.

## Remaining limitations

- The user interface still primarily targets one default variant; complex option/variant editing needs a dedicated feature.
- The queue is single-process SQLite and is not intended for horizontal scaling.
- Full Shopify Bulk Operations JSONL orchestration remains a future high-volume enhancement; the current queue is bounded to controlled batches.
- A real end-to-end live Shopify draft test must be run with the deployment token before enabling live publishing.
