import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name) || entry.name.includes('pre-hardening') || entry.name.endsWith('.bak') || entry.name === 'security-audit.mjs') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|json|md|example)$/.test(entry.name)) files.push(full);
  }
};
walk(root);
const checks = [
  { label: 'Known insecure default password', pattern: /FashionRerun@2026!/ },
  { label: 'Random fallback session secret', pattern: /SESSION_SECRET\s*=.*crypto\.randomBytes/ },
  { label: 'Public registration path in auth allowlist', pattern: /publicPaths[^\n]*auth\/register/ },
  { label: 'Fake Shopify throttle count', pattern: /throttlesRemaining\s*:\s*48/ },
  { label: 'Body-supplied AI identity', pattern: /const\s*\{[^}]*clientId[^}]*username[^}]*\}\s*=\s*req\.body/ },
];
let failed = false;
for (const check of checks) {
  const matches = files.filter((file) => check.pattern.test(fs.readFileSync(file, 'utf8')));
  if (matches.length) {
    failed = true;
    console.error(`FAIL: ${check.label}: ${matches.map((file) => path.relative(root, file)).join(', ')}`);
  } else console.log(`PASS: ${check.label}`);
}
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
for (const required of ['publishablePublish', 'idempotency_requests', 'verifyShopifyWebhook', 'getShopifyPreflight', 'inventorySetQuantities']) {
  if (!server.includes(required)) { failed = true; console.error(`FAIL: required hardening marker missing: ${required}`); }
  else console.log(`PASS: ${required}`);
}
if (failed) process.exit(1);
