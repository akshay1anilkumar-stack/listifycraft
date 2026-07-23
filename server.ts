import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { GARMENT_SUBCATEGORIES } from "./src/utils/schemaMapper";
import dotenv from "dotenv";
import crypto from "crypto";
import { DatabaseSync } from "node:sqlite";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 3000);
const APP_DOMAIN = process.env.APP_DOMAIN || "https://www.listifystudio.com";

app.use(express.json({ limit: "50mb" }));

// Security & CORS middleware for custom domain hosting (e.g. www.listify-ai.com)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-user-username, x-user-role, x-user-client-id");
  }
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Lightweight production guardrails. Use Redis-backed limits when deploying multiple server instances.
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
app.use("/api", (req, res, next) => {
  const key = `${req.ip}:${req.path.startsWith('/auth/') ? 'auth' : 'api'}`;
  const now = Date.now();
  const windowMs = req.path.startsWith('/auth/') ? 15 * 60_000 : 60_000;
  const max = req.path.startsWith('/auth/') ? 20 : 180;
  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
  else {
    bucket.count += 1;
    if (bucket.count > max) return res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
const STORE_VENDOR = process.env.SHOPIFY_DEFAULT_VENDOR || "ListifyCraft";


// SQLite persistence. Existing src/data/db.json is imported once automatically.
const DB_DIR = path.join(process.cwd(), "src", "data");
const DB_FILE = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(DB_DIR, "listing-studio.sqlite");
const LEGACY_DB_FILE = path.join(DB_DIR, "db.json");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

interface LocalDB {
  mappings: { garmentPlural: string; productType: string }[];
  config: {
    titleMaxLength: number; vintageEraMigrationEnabled: boolean; colorTolerance: number;
    shopName: string; accessToken: string; apiVersion?: string; inventoryLocationId?: string;
    defaultVendor?: string; ebayConnected?: boolean; ebayAccount?: string | null;
    ebayAutomationEnabled?: boolean; geminiModel?: string; costListingCredit?: number; costModelCredit?: number;
  };
  auditLogs: any[]; shopifyProducts: any[]; batches?: any[]; users?: any[]; clients?: any[];
  creditTransactions?: any[]; validationRules?: any[]; metafieldsConfig?: any[];
}

const DEFAULT_DB: LocalDB = {
  mappings: [
    { garmentPlural: 'T-Shirts', productType: 'Migration_T-Shirts' },
    { garmentPlural: 'Jackets', productType: 'Migration_Jackets' },
    { garmentPlural: 'Jerseys', productType: 'Migration_Jerseys' },
    { garmentPlural: 'Shorts', productType: 'Migration_Shorts' },
    { garmentPlural: 'Pants', productType: 'Migration_Pants' },
    { garmentPlural: 'Jeans', productType: 'Migration_Jeans' },
    { garmentPlural: 'Shirts', productType: 'Migration_Shirts' },
    { garmentPlural: 'Knitwear & Sweaters', productType: 'Migration_Knitwear & Sweaters' },
    { garmentPlural: 'Hoodies & Sweatshirts', productType: 'Migration_Hoodies & Sweatshirts' },
    { garmentPlural: 'Sweatshirts', productType: 'Migration_Sweatshirts' },
    { garmentPlural: 'Dresses', productType: 'Migration_Dresses' },
    { garmentPlural: 'Skirts', productType: 'Migration_Skirts' },
    { garmentPlural: 'Blouses & Tops', productType: 'Migration_Blouses & Tops' },
    { garmentPlural: 'Jumpsuits & Rompers', productType: 'Migration_Jumpsuits & Rompers' },
    { garmentPlural: 'Vests', productType: 'Migration_Vests' },
    { garmentPlural: 'Accessories', productType: 'Migration_Accessories' },
    { garmentPlural: 'Caps', productType: 'Migration_Caps' },
    { garmentPlural: 'Hats', productType: 'Migration_Hats' }
  ],
  config: {
    titleMaxLength: 140, vintageEraMigrationEnabled: false, colorTolerance: 2.0, shopName: "", accessToken: "",
    apiVersion: process.env.SHOPIFY_API_VERSION || "2026-07",
    inventoryLocationId: process.env.SHOPIFY_INVENTORY_LOCATION_ID || "", defaultVendor: STORE_VENDOR,
    ebayConnected: false, ebayAccount: null, ebayAutomationEnabled: false, geminiModel: "gemini-3.6-flash",
    costListingCredit: 1, costModelCredit: 0
  },
  auditLogs: [], shopifyProducts: [], batches: [],
  users: [{ username: "master_admin", fullName: "Master Administrator", password: process.env.INITIAL_ADMIN_PASSWORD_HASH || "", role: "Master Admin", clientId: "master-workspace-id" }],
  clients: [], creditTransactions: []
};

const sqlite = new DatabaseSync(DB_FILE);
sqlite.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_images (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL,
    filename TEXT NOT NULL,
    sequence TEXT,
    label TEXT,
    kind TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    data BLOB NOT NULL,
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    shopify_product_id TEXT,
    shopify_media_id TEXT,
    upload_status TEXT NOT NULL DEFAULT 'STORED',
    UNIQUE(sku, filename, kind)
  );
  CREATE INDEX IF NOT EXISTS idx_product_images_sku ON product_images(sku, sequence, kind);
  CREATE INDEX IF NOT EXISTS idx_product_images_sha ON product_images(sha256);
  CREATE TABLE IF NOT EXISTS ai_cache (
    cache_key TEXT PRIMARY KEY,
    response_json TEXT NOT NULL,
    model_used TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_usage (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    key_slot INTEGER,
    status TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    error_message TEXT,
    created_at TEXT NOT NULL
  );
`);

function normalizeDB(parsed: any): LocalDB {
  const db: any = parsed && typeof parsed === "object" ? parsed : structuredClone(DEFAULT_DB);
  db.mappings ||= structuredClone(DEFAULT_DB.mappings);
  db.config ||= structuredClone(DEFAULT_DB.config);
  db.auditLogs ||= []; db.shopifyProducts ||= []; db.batches ||= []; db.clients ||= []; db.creditTransactions ||= []; db.users ||= [];
  if (!db.users.some((u: any) => u.username === "master_admin")) db.users.push(structuredClone(DEFAULT_DB.users![0]));
  const masterAdmin = db.users.find((u: any) => u.username === "master_admin");
  if (masterAdmin && !masterAdmin.password) {
    if (process.env.INITIAL_ADMIN_PASSWORD_HASH) {
      masterAdmin.password = process.env.INITIAL_ADMIN_PASSWORD_HASH;
    } else if (process.env.INITIAL_ADMIN_PASSWORD) {
      masterAdmin.password = hashPassword(process.env.INITIAL_ADMIN_PASSWORD);
    } else {
      const defaultPass = "AdminOwner2026!";
      console.warn("==================================================");
      console.warn("WARNING: No initial admin password or hash was configured in environment.");
      console.warn(`USING DEFAULT MASTER ADMIN PASSWORD: ${defaultPass}`);
      console.warn("Please change this password after logging in!");
      console.warn("==================================================");
      masterAdmin.password = hashPassword(defaultPass);
    }
  }
  if (!db.users.some((u: any) => u.username === "admin") && masterAdmin) {
    db.users.push({
      username: "admin",
      fullName: "Master Administrator",
      password: masterAdmin.password,
      role: "Master Admin",
      clientId: "master-workspace-id"
    });
  }
  db.config.apiVersion ||= process.env.SHOPIFY_API_VERSION || "2026-07";
  db.config.inventoryLocationId ??= process.env.SHOPIFY_INVENTORY_LOCATION_ID || "";
  db.config.defaultVendor ||= STORE_VENDOR;
  db.config.geminiModel ||= "gemini-3.6-flash";
  db.config.costListingCredit ??= 1; db.config.costModelCredit ??= Number(process.env.AI_MODEL_CREDIT_COST || 1);
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) db.config.accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (process.env.SHOPIFY_SHOP_DOMAIN) db.config.shopName = process.env.SHOPIFY_SHOP_DOMAIN;
  return db;
}

function initializeSQLiteState() {
  const row = sqlite.prepare("SELECT data FROM app_state WHERE id = 1").get() as { data: string } | undefined;
  if (row) return;
  let initial: LocalDB = structuredClone(DEFAULT_DB);
  if (fs.existsSync(LEGACY_DB_FILE)) {
    try { initial = normalizeDB(JSON.parse(fs.readFileSync(LEGACY_DB_FILE, "utf8"))); }
    catch (error) { console.error("Could not migrate legacy db.json; starting with defaults", error); }
  }
  sqlite.prepare("INSERT INTO app_state (id, data, updated_at) VALUES (1, ?, ?)").run(JSON.stringify(initial), new Date().toISOString());
  if (fs.existsSync(LEGACY_DB_FILE)) {
    const backup = `${LEGACY_DB_FILE}.migrated-${Date.now()}.bak`;
    fs.copyFileSync(LEGACY_DB_FILE, backup);
  }
}
initializeSQLiteState();

function readDB(): LocalDB {
  const row = sqlite.prepare("SELECT data FROM app_state WHERE id = 1").get() as { data: string };
  const db = normalizeDB(JSON.parse(row.data));
  writeDB(db);
  return db;
}

function writeDB(data: LocalDB) {
  sqlite.prepare("UPDATE app_state SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(data), new Date().toISOString());
}

function getClientShopifyConfig(clientId: string | null | undefined, db: LocalDB) {
  if (clientId && clientId !== "master-workspace-id") {
    const client = db.clients?.find(c => c.id === clientId);
    if (client && client.shopifyConfig) {
      return {
        shopName: client.shopifyConfig.shopName || db.config.shopName,
        accessToken: client.shopifyConfig.accessToken || db.config.accessToken,
        apiVersion: client.shopifyConfig.apiVersion || db.config.apiVersion || "2026-07",
        inventoryLocationId: client.shopifyConfig.inventoryLocationId || db.config.inventoryLocationId || "",
        defaultVendor: client.shopifyConfig.defaultVendor || db.config.defaultVendor || STORE_VENDOR
      };
    }
  }
  return {
    shopName: db.config.shopName,
    accessToken: db.config.accessToken,
    apiVersion: db.config.apiVersion || "2026-07",
    inventoryLocationId: db.config.inventoryLocationId || "",
    defaultVendor: db.config.defaultVendor || STORE_VENDOR
  };
}

type AuthUser = { username: string; fullName: string; role: string; clientId: string };
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password: string, stored: string) {
  if (!stored) return false;
  if (!stored.startsWith("scrypt$")) return crypto.timingSafeEqual(Buffer.from(hashPassword(password, "legacy").slice(-128)), Buffer.from(hashPassword(stored, "legacy").slice(-128)));
  const [, salt, expected] = stored.split("$");
  const actual = crypto.scryptSync(password, salt, 64);
  return expected?.length === actual.toString("hex").length && crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
function signSession(user: AuthUser) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifySession(token: string): AuthUser | null {
  try {
    const [payload, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded.exp || decoded.exp < Date.now()) return null;
    return decoded;
  } catch { return null; }
}

app.use("/api", (req: any, res, next) => {
  const publicPaths = new Set(["/auth/login", "/auth/register", "/health", "/images/store"]);
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = verifySession(token);
  if (user) req.authUser = user;

  if (publicPaths.has(req.path) || (req.path.startsWith("/images/") && req.method === "GET")) return next();
  if (!user) return res.status(401).json({ error: "Authentication required" });
  next();
});

function getAuthHeaders(req: any) {
  const user = req.authUser as AuthUser | undefined;
  return { reqRole: user?.role || "", reqClientId: user?.clientId || "", reqUsername: user?.username || "" };
}

// Ensure database file is initialized
if (!fs.existsSync(DB_FILE)) {
  writeDB(DEFAULT_DB);
}

// Gemini key pool. Keys rotate only on quota, transient, or authentication failures.
const GEMINI_KEYS = Array.from(new Set([
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY
].filter((value): value is string => Boolean(value && value.trim()))));
const geminiClients = GEMINI_KEYS.map(apiKey => new GoogleGenAI({ apiKey }));
const geminiCooldowns = new Map<number, number>();
let geminiRotationCursor = 0;

function hasGeminiKeys() { return GEMINI_KEYS.length > 0; }
function isRetryableGeminiError(error: any) {
  const message = String(error?.message || error || "").toLowerCase();
  return /429|quota|rate limit|resource exhausted|500|502|503|504|timeout|timed out|unavailable|overloaded|401|403|api key/.test(message);
}
function recordApiUsage(purpose: string, model: string, keySlot: number | null, status: string, durationMs: number, errorMessage?: string) {
  try {
    sqlite.prepare("INSERT INTO api_usage (id, provider, purpose, model, key_slot, status, duration_ms, error_message, created_at) VALUES (?, 'gemini', ?, ?, ?, ?, ?, ?, ?)")
      .run(`usage_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, purpose, model, keySlot, status, durationMs, errorMessage || null, new Date().toISOString());
  } catch (error) { console.warn("Could not record API usage", error); }
}

function recordAuditLog(action: string, user: any, details: any = {}) {
  try {
    const db = readDB();
    if (!db.auditLogs) db.auditLogs = [];
    const entry = {
      id: `audit_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      action,
      username: user?.username || "system",
      role: user?.role || "System",
      clientId: user?.clientId || "master-workspace-id",
      payload: details
    };
    db.auditLogs.unshift(entry);
    if (db.auditLogs.length > 1000) db.auditLogs = db.auditLogs.slice(0, 1000);
    writeDB(db);
  } catch (err) {
    console.warn("[Audit Logging Failure]:", err);
  }
}
async function withGeminiKey<T>(purpose: string, model: string, operation: (client: GoogleGenAI, key: string, keySlot: number) => Promise<T>): Promise<T> {
  if (!GEMINI_KEYS.length) throw new Error("No Gemini API keys are configured.");
  const now = Date.now();
  const ordered = Array.from({ length: GEMINI_KEYS.length }, (_, offset) => (geminiRotationCursor + offset) % GEMINI_KEYS.length);
  let lastError: any = null;
  for (const index of ordered) {
    if ((geminiCooldowns.get(index) || 0) > now) continue;
    const started = Date.now();
    try {
      const result = await operation(geminiClients[index], GEMINI_KEYS[index], index + 1);
      geminiRotationCursor = (index + 1) % GEMINI_KEYS.length;
      recordApiUsage(purpose, model, index + 1, "SUCCESS", Date.now() - started);
      return result;
    } catch (error: any) {
      lastError = error;
      const retryable = isRetryableGeminiError(error);
      recordApiUsage(purpose, model, index + 1, "FAILED", Date.now() - started, String(error?.message || error).slice(0, 500));
      if (!retryable) throw error;
      geminiCooldowns.set(index, Date.now() + (/401|403|api key/i.test(String(error?.message || error)) ? 30 * 60_000 : 60_000));
    }
  }
  throw lastError || new Error("All configured Gemini API keys are cooling down or unavailable.");
}

// API Routes FIRST
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "Listify AI Image-to-Listing Studio" }));

// Get mappings and applet config
app.get("/api/config", (req: any, res) => {
  const db = readDB();
  const taxonomyMappings = readTaxonomyMappings();
  const clientId = req.authUser?.clientId;
  const shopifyConfig = getClientShopifyConfig(clientId, db);
  res.json({
    mappings: getProductTypeMappingsArray(),
    config: { 
      ...db.config, 
      shopName: shopifyConfig.shopName,
      apiVersion: shopifyConfig.apiVersion,
      inventoryLocationId: shopifyConfig.inventoryLocationId,
      defaultVendor: shopifyConfig.defaultVendor,
      accessToken: "", 
      accessTokenConfigured: Boolean(shopifyConfig.accessToken) 
    },
    validationRules: db.validationRules || {
      requiredFields: ["title", "sku", "price", "imageUrl", "garmentType", "category"],
      blockedFields: [],
      allowedValues: {
        condition: ["EXCELLENT", "VERY GOOD", "GOOD", "FAIR", "POOR"],
        gender: ["MEN", "WOMEN", "UNISEX"]
      }
    },
    metafieldsConfig: db.metafieldsConfig || [
      { namespace: "magento", key: "brand_new", type: "single_line_text_field", rules: "Required. Maps from brand name." },
      { namespace: "magento", key: "brand_size", type: "single_line_text_field", rules: "Required. Maps from tagged size." },
      { namespace: "magento", key: "size", type: "single_line_text_field", rules: "Required. Maps from recommended size." },
      { namespace: "magento", key: "condition", type: "single_line_text_field", rules: "Required. Standardized condition grade." },
      { namespace: "magento", key: "color1", type: "single_line_text_field", rules: "Required. Primary color." },
      { namespace: "magento", key: "ebay_outer_shell_material", type: "single_line_text_field", rules: "Optional. Material information." },
      { namespace: "magento", key: "short_description", type: "multi_line_text_field", rules: "Required. Styling description and flaws." },
      { namespace: "custom", key: "gender", type: "single_line_text_field", rules: "Required. Target gender filter." },
      { namespace: "magento", key: "ebay_department", type: "single_line_text_field", rules: "Required. Department based on gender." },
      { namespace: "magento", key: "ebay_style", type: "single_line_text_field", rules: "Required. Style designation." },
      { namespace: "magento", key: "length", type: "single_line_text_field", rules: "Optional. Measured flat length in cm." },
      { namespace: "magento", key: "chest", type: "single_line_text_field", rules: "Optional. Measured chest size." },
      { namespace: "magento", key: "pit_to_pit", type: "single_line_text_field", rules: "Optional. Flat pit to pit in cm." },
      { namespace: "magento", key: "sleeve", type: "single_line_text_field", rules: "Optional. Measured sleeve length." },
      { namespace: "magento", key: "waist", type: "single_line_text_field", rules: "Optional. Measured waist size." }
    ],
    taxonomyMappings
  });
});

// Update mappings or app configuration
app.post("/api/config", async (req: any, res) => {
  const db = readDB();
  const clientId = req.authUser?.clientId;
  const isGlobalAdmin = req.authUser?.role === "Master Admin" || req.authUser?.role === "Admin";
  
  if (!isGlobalAdmin) {
    const isCompanyAdmin = req.authUser?.role === "Company Admin" || req.authUser?.role === "Store Administrator" || req.authUser?.role === "Sub Admin" || req.authUser?.role === "Listing Operator";
    if (!isCompanyAdmin || req.body.mappings || req.body.validationRules || req.body.taxonomyMappings) {
      return res.status(403).json({ error: "Access Denied: You are not authorized to modify system mappings or global validation rules." });
    }
  }

  let autoSyncReport: any = null;

  if (req.body.mappings) {
    db.mappings = req.body.mappings; // keep db sync
    const mappedObj: Record<string, string> = {};
    req.body.mappings.forEach((m: any) => {
      if (m.garmentPlural && m.productType) {
        mappedObj[m.garmentPlural] = m.productType;
      }
    });
    writeProductTypeMappings(mappedObj);
  }
  if (req.body.config) {
    const incoming = { ...req.body.config };
    if (!incoming.accessToken) delete incoming.accessToken;
    if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) delete incoming.accessToken;
    
    if (clientId && clientId !== "master-workspace-id") {
      const clientIdx = db.clients?.findIndex(c => c.id === clientId);
      if (clientIdx !== -1 && db.clients) {
        const cur = db.clients[clientIdx].shopifyConfig || {};
        db.clients[clientIdx].shopifyConfig = {
          shopName: incoming.shopName || cur.shopName || "",
          accessToken: incoming.accessToken || cur.accessToken || "",
          apiVersion: incoming.apiVersion || cur.apiVersion || "2026-07",
          inventoryLocationId: incoming.inventoryLocationId || cur.inventoryLocationId || "",
          defaultVendor: incoming.defaultVendor || cur.defaultVendor || STORE_VENDOR
        };

        const activeToken = db.clients[clientIdx].shopifyConfig?.accessToken;
        const activeShop = db.clients[clientIdx].shopifyConfig?.shopName;
        if (activeShop && activeToken) {
          autoSyncReport = await autoFetchAndSyncShopifyStore(activeShop, activeToken, clientId, db.clients[clientIdx].shopifyConfig?.apiVersion);
          if (autoSyncReport) {
            if (!db.clients[clientIdx].shopifyConfig?.inventoryLocationId && autoSyncReport.primaryLocationId) {
              db.clients[clientIdx].shopifyConfig.inventoryLocationId = autoSyncReport.primaryLocationId;
            }
            if ((!db.clients[clientIdx].shopifyConfig?.defaultVendor || db.clients[clientIdx].shopifyConfig?.defaultVendor === STORE_VENDOR) && autoSyncReport.defaultVendor) {
              db.clients[clientIdx].shopifyConfig.defaultVendor = autoSyncReport.defaultVendor;
            }
            if (autoSyncReport.syncedProducts?.length) {
              if (!db.shopifyProducts) db.shopifyProducts = [];
              for (const sp of autoSyncReport.syncedProducts) {
                const exIdx = db.shopifyProducts.findIndex(p => p.id === sp.id || (p.sku && p.sku === sp.sku));
                if (exIdx !== -1) {
                  db.shopifyProducts[exIdx] = { ...db.shopifyProducts[exIdx], ...sp };
                } else {
                  db.shopifyProducts.push(sp);
                }
              }
            }
          }
        }
      }
    } else {
      db.config = { ...db.config, ...incoming, defaultVendor: incoming.defaultVendor || STORE_VENDOR };
      const activeToken = db.config.accessToken || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
      const activeShop = db.config.shopName || process.env.SHOPIFY_SHOP_DOMAIN;
      if (activeShop && activeToken) {
        autoSyncReport = await autoFetchAndSyncShopifyStore(activeShop, activeToken, "master-workspace-id", db.config.apiVersion);
        if (autoSyncReport) {
          if (!db.config.inventoryLocationId && autoSyncReport.primaryLocationId) {
            db.config.inventoryLocationId = autoSyncReport.primaryLocationId;
          }
          if ((!db.config.defaultVendor || db.config.defaultVendor === STORE_VENDOR) && autoSyncReport.defaultVendor) {
            db.config.defaultVendor = autoSyncReport.defaultVendor;
          }
          if (autoSyncReport.syncedProducts?.length) {
            if (!db.shopifyProducts) db.shopifyProducts = [];
            for (const sp of autoSyncReport.syncedProducts) {
              const exIdx = db.shopifyProducts.findIndex(p => p.id === sp.id || (p.sku && p.sku === sp.sku));
              if (exIdx !== -1) {
                db.shopifyProducts[exIdx] = { ...db.shopifyProducts[exIdx], ...sp };
              } else {
                db.shopifyProducts.push(sp);
              }
            }
          }
        }
      }
    }
  }
  if (req.body.validationRules) {
    db.validationRules = req.body.validationRules;
  }
  if (req.body.metafieldsConfig) {
    db.metafieldsConfig = req.body.metafieldsConfig;
  }
  if (req.body.taxonomyMappings) {
    writeTaxonomyMappings(req.body.taxonomyMappings);
  }
  writeDB(db);
  const taxonomyMappings = readTaxonomyMappings();
  const shopifyConfig = getClientShopifyConfig(clientId, db);
  res.json({
    success: true,
    autoSyncReport,
    mappings: getProductTypeMappingsArray(),
    config: { 
      ...db.config, 
      shopName: shopifyConfig.shopName,
      apiVersion: shopifyConfig.apiVersion,
      inventoryLocationId: shopifyConfig.inventoryLocationId,
      defaultVendor: shopifyConfig.defaultVendor,
      accessToken: "", 
      accessTokenConfigured: Boolean(shopifyConfig.accessToken) 
    },
    validationRules: db.validationRules,
    metafieldsConfig: db.metafieldsConfig,
    taxonomyMappings
  });
});

// Fetch Audit Records
app.get("/api/audit-logs", (req: any, res) => {
  const db = readDB();
  const clientId = req.authUser?.clientId;
  if (req.authUser?.role === "Master Admin") {
    return res.json(db.auditLogs);
  }
  const list = (db.auditLogs || []).filter((log: any) => log.clientId === clientId || log.payload?.clientId === clientId);
  res.json(list);
});

// Clear Audit Records
app.delete("/api/audit-logs", (req, res) => {
  const db = readDB();
  db.auditLogs = [];
  writeDB(db);
  res.json({ success: true });
});

// Fetch Current Shopify Products for Duplicate Checking
app.get("/api/shopify/products", (req: any, res) => {
  const db = readDB();
  const clientId = req.authUser?.clientId;
  if (req.authUser?.role === "Master Admin") {
    return res.json(db.shopifyProducts);
  }
  const list = (db.shopifyProducts || []).filter((p: any) => p.clientId === clientId);
  res.json(list);
});

// Live Shopify reference data used by the review page. Responses are intentionally small and cacheable.
const shopifyReferenceCache = new Map<string, { expires: number; value: any }>();
app.get("/api/shopify/locations", async (req: any, res) => {
  try {
    const db = readDB();
    const shopifyConfig = getClientShopifyConfig(req.authUser?.clientId, db);
    if (!shopifyConfig.shopName || !shopifyConfig.accessToken) return res.json([]);
    const key = `locations:${shopifyConfig.shopName}`;
    const cached = shopifyReferenceCache.get(key);
    if (cached && cached.expires > Date.now()) return res.json(cached.value);
    const data = await shopifyGraphQL(`query { locations(first: 50) { nodes { id name isActive } } }`, {}, shopifyConfig.shopName, shopifyConfig.accessToken, shopifyConfig.apiVersion);
    const value = (data.locations?.nodes || []).filter((x: any) => x.isActive);
    shopifyReferenceCache.set(key, { expires: Date.now() + 10 * 60_000, value });
    res.json(value);
  } catch (error: any) { res.status(502).json({ error: error.message }); }
});
app.get("/api/shopify/collections", async (req: any, res) => {
  try {
    const db = readDB();
    const shopifyConfig = getClientShopifyConfig(req.authUser?.clientId, db);
    if (!shopifyConfig.shopName || !shopifyConfig.accessToken) return res.json([]);
    const key = `collections:${shopifyConfig.shopName}`;
    const cached = shopifyReferenceCache.get(key);
    if (cached && cached.expires > Date.now()) return res.json(cached.value);
    const data = await shopifyGraphQL(`query { collections(first: 100, sortKey: TITLE) { nodes { id title handle } } }`, {}, shopifyConfig.shopName, shopifyConfig.accessToken, shopifyConfig.apiVersion);
    const value = data.collections?.nodes || [];
    shopifyReferenceCache.set(key, { expires: Date.now() + 10 * 60_000, value });
    res.json(value);
  } catch (error: any) { res.status(502).json({ error: error.message }); }
});

// Persistent image storage and deterministic studio-processing bridge.
function imageContentUrl(id: string) { return `/api/images/${encodeURIComponent(id)}/content`; }
function parseImageDataUrl(source: string) {
  const match = source.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!mimeType.startsWith("image/") || !buffer.length) throw new Error("Invalid image data URL.");
  return { buffer, mimeType };
}
function storedImageIdFromSource(source: string) {
  const match = String(source || "").match(/\/api\/images\/([^/?#]+)\/content/);
  return match ? decodeURIComponent(match[1]) : null;
}
async function readImageSource(source: string): Promise<{ buffer: Buffer; mimeType: string; filename: string; storedImageId?: string }> {
  const data = parseImageDataUrl(source);
  if (data) return { ...data, filename: `image-${crypto.randomUUID().slice(0, 8)}.${data.mimeType.includes("png") ? "png" : data.mimeType.includes("webp") ? "webp" : "jpg"}` };
  const storedId = storedImageIdFromSource(source);
  if (storedId) {
    const row = sqlite.prepare("SELECT filename, mime_type, data FROM product_images WHERE id = ?").get(storedId) as any;
    if (!row) throw new Error("Stored image was not found.");
    return { buffer: Buffer.from(row.data), mimeType: row.mime_type, filename: row.filename, storedImageId: storedId };
  }
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not download image (${response.status}).`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 25 * 1024 * 1024) throw new Error("Remote image exceeds 25 MB.");
    const mimeType = (response.headers.get("content-type") || "image/jpeg").split(";")[0];
    return { buffer, mimeType, filename: `remote-${crypto.randomUUID().slice(0, 8)}.${mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg"}` };
  }
  throw new Error("Unsupported image source. Store the image in the app first.");
}
async function storeImageRecord(input: any) {
  const source = String(input.dataUrl || input.imageUrl || input.source || "");
  if (!source) throw new Error("Image data is required.");
  const loaded = await readImageSource(source);
  if (loaded.buffer.length > 25 * 1024 * 1024) throw new Error("Image exceeds the 25 MB storage limit.");
  const sku = String(input.sku || "UNASSIGNED").trim().toUpperCase();
  const filename = String(input.filename || loaded.filename || `image-${Date.now()}.jpg`).trim();
  const kind = String(input.kind || "original").trim().toLowerCase();
  const sequence = String(input.sequence || "").trim().toLowerCase();
  const label = String(input.label || "Detail").trim();
  const sha256 = crypto.createHash("sha256").update(loaded.buffer).digest("hex");
  const existing = sqlite.prepare("SELECT id, created_at FROM product_images WHERE sku = ? AND filename = ? AND kind = ?").get(sku, filename, kind) as any;
  const id = existing?.id || `img_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO product_images (id, sku, filename, sequence, label, kind, mime_type, data, sha256, created_at, updated_at, upload_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'STORED')
    ON CONFLICT(sku, filename, kind) DO UPDATE SET
      sequence=excluded.sequence, label=excluded.label, mime_type=excluded.mime_type, data=excluded.data, sha256=excluded.sha256, updated_at=excluded.updated_at, upload_status='STORED'
  `).run(id, sku, filename, sequence, label, kind, loaded.mimeType, loaded.buffer, sha256, existing?.created_at || now, now);
  return { id, sku, filename, sequence, label, kind, mimeType: loaded.mimeType, sha256, url: imageContentUrl(id) };
}

app.post("/api/images/store", async (req, res) => {
  try { const image = await storeImageRecord(req.body || {}); res.json({ success: true, image, ...image }); }
  catch (error: any) { res.status(400).json({ error: error.message || "Could not store image." }); }
});
app.get("/api/images/:id/content", (req, res) => {
  const row = sqlite.prepare("SELECT mime_type, data, sha256 FROM product_images WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).end();
  res.setHeader("Content-Type", row.mime_type);
  res.setHeader("ETag", `"${row.sha256}"`);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.send(Buffer.from(row.data));
});
app.get("/api/images/by-sku/:sku", (req, res) => {
  const rows = sqlite.prepare("SELECT id, sku, filename, sequence, label, kind, mime_type AS mimeType, sha256, upload_status AS uploadStatus, shopify_product_id AS shopifyProductId, shopify_media_id AS shopifyMediaId, created_at AS createdAt, updated_at AS updatedAt FROM product_images WHERE sku = ? ORDER BY sequence, kind, created_at").all(String(req.params.sku).toUpperCase());
  res.json(rows.map((row: any) => ({ ...row, url: imageContentUrl(row.id) })));
});
app.get("/api/admin/api-usage", (req: any, res) => {
  if (req.authUser?.role !== "Master Admin") return res.status(403).json({ error: "Master Admin access required." });
  res.json(sqlite.prepare("SELECT provider, purpose, model, key_slot AS keySlot, status, duration_ms AS durationMs, error_message AS errorMessage, created_at AS createdAt FROM api_usage ORDER BY created_at DESC LIMIT 500").all());
});

app.post("/api/image/process", async (req, res) => {
  const { imageUrl, base64, sku, filename, label, sequence } = req.body || {};
  const source = base64 || imageUrl;
  if (!source) return res.status(400).json({ error: "Provide imageUrl or base64 image data." });
  try {
    let storedUrl = source;
    let imageId: string | undefined;
    if (String(source).startsWith("data:")) {
      const stored = await storeImageRecord({ dataUrl: source, sku, filename, label, sequence, kind: "original" });
      storedUrl = stored.url; imageId = stored.id;
    }
    res.json({ success: true, processed: true, processedUrl: storedUrl, sourceUrl: storedUrl, imageId });
  } catch (error: any) { res.status(400).json({ error: error.message || "Image processing failed." }); }
});

// Helper function to extract JSON from model responses that might contain markdown blocks
function parseJSONFromText(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();
  return JSON.parse(cleaned);
}

// Helper to invoke OpenAI or OpenAI-compatible (like Moonshot/Kimi) Vision-Language models via standard Fetch
async function callOpenAICompatible(
  apiKey: string,
  endpointUrl: string,
  modelName: string,
  systemInstruction: string,
  images: Array<{ base64: string; label: string }>
): Promise<any> {
  const messages: any[] = [
    {
      role: "system",
      content: systemInstruction + "\nAnalyze the garment and return the JSON object matching the requested schema."
    }
  ];
  
  const userContentArray: any[] = [
    {
      type: "text",
      text: "Analyze these garment photos with absolute precision. Extract all taxonomy mappings, observations, and flat measurements as requested in the system instructions. Return ONLY a single valid JSON object."
    }
  ];

  images.forEach((img, idx) => {
    if (img.base64) {
      let dataUrl = img.base64;
      if (!dataUrl.startsWith("data:")) {
        dataUrl = `data:image/jpeg;base64,${dataUrl}`;
      }
      userContentArray.push({
        type: "image_url",
        image_url: {
          url: dataUrl
        }
      });
      userContentArray.push({
        type: "text",
        text: `Image view ${idx + 1} Label: ${img.label || 'Unlabeled'}`
      });
    }
  });

  messages.push({
    role: "user",
    content: userContentArray
  });

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API returned HTTP ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response content from AI model.");
  }

  return parseJSONFromText(content);
}

// Abstract function to run analysis with a specific model ID
async function runAnalysisWithModel(
  modelId: string,
  systemInstruction: string,
  images: Array<{ base64: string; label: string }>,
  parts: any[]
): Promise<{ data: any; modelUsed: string }> {
  const isGemini = modelId.startsWith("gemini-");
  const isOpenAI = modelId.startsWith("gpt-");
  const isKimi = modelId.startsWith("moonshot-");

  if (isGemini) {
    const response: any = await withGeminiKey("listing-analysis", modelId, (client) => client.models.generateContent({
      model: modelId,
      contents: parts,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["classification", "observations", "shopify", "measurements", "confidence", "warnings"],
          properties: {
            classification: {
              type: Type.OBJECT,
              properties: {
                market: { type: Type.STRING, description: "Must be one of: VINTAGE, RETRO, Y2K, THRIFT, REWORK, EFAAR, ACCESSORIES" },
                gender: { type: Type.STRING, description: "Must be one of: MEN, WOMEN, UNISEX" },
                garment_type: { type: Type.STRING, description: "Selected plural garment name from approved list" },
                brand: { type: Type.STRING },
                era_estimate: { type: Type.STRING },
                tagged_size: { type: Type.STRING },
                subtype: { type: Type.STRING, description: "Specific accurate subtype of the garment, e.g. Graphic Tee, Bomber Jacket, etc." }
              }
            },
            observations: {
              type: Type.OBJECT,
              properties: {
                colors: { type: Type.ARRAY, items: { type: Type.STRING } },
                features: { type: Type.ARRAY, items: { type: Type.STRING } },
                visible_flaws: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            shopify: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description_html: { type: Type.STRING },
                price: { type: Type.STRING, description: "Estimated retail price as decimal string, e.g. '45.00'" },
                vendor: { type: Type.STRING },
                product_type: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                metafields: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      namespace: { type: Type.STRING },
                      key: { type: Type.STRING },
                      value: { type: Type.STRING },
                      type: { type: Type.STRING }
                    }
                  }
                }
              }
            },
            measurements: {
              type: Type.OBJECT,
              properties: {
                pit_to_pit: { type: Type.STRING },
                length: { type: Type.STRING },
                shoulder: { type: Type.STRING },
                sleeve: { type: Type.STRING },
                waist: { type: Type.STRING },
                rise: { type: Type.STRING },
                inseam: { type: Type.STRING }
              }
            },
            confidence: {
              type: Type.OBJECT,
              description: "Fields confidence mappings from 0.0 to 1.0"
            },
            warnings: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    }));

    const text = response.text?.trim() || "{}";
    return { data: JSON.parse(text), modelUsed: modelId };
  } else if (isOpenAI) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API Key is missing in workspace secrets (OPENAI_API_KEY).");
    }
    const data = await callOpenAICompatible(apiKey, "https://api.openai.com/v1/chat/completions", modelId, systemInstruction, images);
    return { data, modelUsed: modelId };
  } else if (isKimi) {
    const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    if (!apiKey) {
      throw new Error("Kimi/Moonshot API Key is missing in workspace secrets (KIMI_API_KEY or MOONSHOT_API_KEY).");
    }
    const data = await callOpenAICompatible(apiKey, "https://api.moonshot.cn/v1/chat/completions", modelId, systemInstruction, images);
    return { data, modelUsed: modelId };
  } else {
    throw new Error(`Unsupported model ID: ${modelId}`);
  }
}

// Normalized and validate the listing according to Fashion ReRun Shopify Product Upload requirements
function normalizeAndValidateListing(rawJson: any, preferredModel: string, modelSucceeded: string, db: any): any {
  // Deep clone to avoid mutating
  const data = JSON.parse(JSON.stringify(rawJson || {}));

  // 1. Ensure top-level sections exist
  if (!data.classification) data.classification = {};
  if (!data.observations) data.observations = {};
  if (!data.measurements) data.measurements = {};
  if (!data.shopify) data.shopify = {};
  if (!data.confidence) data.confidence = {};
  if (!data.warnings) data.warnings = [];
  if (!data.processing) data.processing = {};

  const classification = data.classification;
  const shopify = data.shopify;
  const measurements = data.measurements;
  const observations = data.observations;

  // Ensure arrays exist
  if (!Array.isArray(observations.colors)) observations.colors = [];
  if (!Array.isArray(observations.features)) observations.features = [];
  if (!Array.isArray(observations.visible_flaws)) observations.visible_flaws = [];
  if (!Array.isArray(shopify.tags)) shopify.tags = [];
  if (!Array.isArray(shopify.metafields)) shopify.metafields = [];
  if (!Array.isArray(shopify.options)) shopify.options = ["Title"];
  
  // 2. Consistent gender: Always MEN, WOMEN, or UNISEX
  let rawGender = String(classification.gender || "").trim();
  let normalizedGender = "UNISEX";
  if (/^women|^lady|^female/i.test(rawGender)) {
    normalizedGender = "WOMEN";
  } else if (/^men|^male/i.test(rawGender)) {
    normalizedGender = "MEN";
  } else {
    normalizedGender = "UNISEX";
  }
  classification.gender = normalizedGender as any;

  // Ensure category matches approved list
  const activeMappings = getProductTypeMappingsArray();
  const matchedMapping = activeMappings.find((m: any) => m.garmentPlural.toLowerCase() === String(classification.garment_type || "").toLowerCase());
  if (matchedMapping) {
    classification.garment_type = matchedMapping.garmentPlural;
  }

  // Ensure market is uppercase
  classification.market = String(classification.market || "").trim().toUpperCase();

  // 3. Recommended size vs tagged size
  if (!classification.tagged_size && classification.size) {
    classification.tagged_size = classification.size;
  }
  if (!classification.recommended_size) {
    classification.recommended_size = classification.tagged_size || "M";
  }

  // Ensure price is on variants
  let priceVal = String(shopify.price || data.price || "125.00").trim();
  // Remove currency symbol if any
  priceVal = priceVal.replace(/[^\d.]/g, "");
  if (!priceVal) priceVal = "125.00";
  
  shopify.price = priceVal;
  
  if (!shopify.variants || !Array.isArray(shopify.variants) || shopify.variants.length === 0) {
    shopify.variants = [
      {
        title: "Default Title",
        price: priceVal,
        sku: "",
        optionValues: [
          {
            optionName: "Title",
            name: "Default Title"
          }
        ],
        inventoryItem: {
          tracked: true
        }
      }
    ];
  } else {
    shopify.variants.forEach((v: any) => {
      v.price = priceVal;
    });
  }

  // Shopify options, status, vendor
  shopify.vendor = STORE_VENDOR;
  shopify.status = "DRAFT";

  // Support both key spellings: productType and product_type
  const garmentTypeStr = classification.garment_type || "";
  let productTypeVal = matchedMapping ? matchedMapping.productType : `Migration_${garmentTypeStr}`;
  shopify.productType = productTypeVal;
  shopify.product_type = productTypeVal;

  // Support both description HTML spellings (Disabled description generation)
  shopify.descriptionHtml = "";
  shopify.description_html = "";

  // 4. Clean measurement strings to numbers-only
  const cleanNumOnly = (val: any): string => {
    if (val === null || val === undefined) return "";
    const clean = String(val).replace(/[^\d.]/g, "");
    return clean;
  };

  const measureKeys = ["waist", "inseam", "rise", "length", "pit_to_pit", "shoulder", "sleeve"];
  measureKeys.forEach(k => {
    measurements[k] = cleanNumOnly(measurements[k]);
  });
  if (measurements.pit_to_pit) {
    const p2pVal = parseFloat(measurements.pit_to_pit);
    if (!isNaN(p2pVal)) {
      measurements.chest = String(p2pVal * 2);
    }
  } else {
    measurements.chest = cleanNumOnly(measurements.chest);
  }
  measurements.unit = "cm";

  // 5. Re-generate clean Metafields to guarantee they are never malformed and fully synchronized
  const metafieldsList: any[] = [];

  // Helper to safely add metafield
  const addMetafield = (namespace: string, key: string, type: string, value: any) => {
    if (!key || !namespace || !type || value === undefined || value === null || String(value).trim() === "") {
      return;
    }
    const exists = metafieldsList.some((m: any) => m.namespace === namespace && m.key === key);
    if (exists) {
      return;
    }
    metafieldsList.push({
      namespace,
      key,
      type,
      value: String(value).trim()
    });
  };

  // Add global required filters
  addMetafield("magento", "brand_new", "single_line_text_field", classification.brand || "Vintage");
  addMetafield("magento", "size", "single_line_text_field", classification.recommended_size);
  addMetafield("magento", "brand_size", "single_line_text_field", classification.tagged_size || classification.recommended_size);
  
  // Rule 3: Use one primary filter colour in magento.color1
  let primaryCol = classification.primary_color || observations.colors[0] || "Multi";
  addMetafield("magento", "color1", "single_line_text_field", primaryCol);
  
  addMetafield("magento", "condition", "single_line_text_field", classification.condition || "Very Good");
  addMetafield("custom", "gender", "single_line_text_field", classification.gender);

  // Category specific subtypes
  const gType = String(classification.garment_type || "").toLowerCase();
  
  // Try to find subtype in AI's generated metafields if missing
  if (!classification.subtype && Array.isArray(data.shopify.metafields)) {
    const subKeys = ["hoodies_subcategories", "jumper_knitwear", "cat_jersey", "cat_tshirt", "cat_pants", "cat_shirts", "cat_shorts", "cat_jacket"];
    const foundMeta = data.shopify.metafields.find((m: any) => subKeys.includes(m.key));
    if (foundMeta && foundMeta.value) {
      classification.subtype = foundMeta.value;
    }
  }

  let rawSubType = String(classification.subtype || "").trim();
  let subKey = "";

  if (gType === "hoodies & sweatshirts" || gType === "sweatshirts") {
    subKey = "hoodies_subcategories";
  } else if (gType === "knitwear & sweaters") {
    subKey = "jumper_knitwear";
  } else if (gType === "jerseys") {
    subKey = "cat_jersey";
  } else if (gType === "t-shirts") {
    subKey = "cat_tshirt";
  } else if (gType === "pants" || gType === "jeans") {
    subKey = "cat_pants";
  } else if (gType === "shirts") {
    subKey = "cat_shirts";
  } else if (gType === "shorts") {
    subKey = "cat_shorts";
  } else if (gType === "jackets") {
    subKey = "cat_jacket";
  }

  if (subKey && rawSubType) {
    // Add only that category's specific subtype metafield using whatever subtype was identified
    const ns = (subKey === "hoodies_subcategories" || subKey === "jumper_knitwear") ? "custom" : "magento";
    addMetafield(ns, subKey, "single_line_text_field", rawSubType);
  }

  // Rule 8: Measurements must remain numeric and clean inside measurement metafields
  measureKeys.forEach(mk => {
    const val = measurements[mk];
    if (val) {
      addMetafield("magento", mk, "single_line_text_field", val);
    }
  });

  // Rule 6: Condition information is JSON type
  const flawsArr = Array.isArray(observations.visible_flaws) ? observations.visible_flaws : [];
  const conditionStr = classification.condition || "Very Good";
  const summaryStr = flawsArr.length > 0 
    ? `${conditionStr} vintage condition with ${flawsArr.join(", ")}.` 
    : `${conditionStr} vintage condition.`;
  
  const condJson = {
    condition: conditionStr,
    summary: summaryStr,
    visible_flaws: flawsArr
  };
  addMetafield("custom", "condition_info", "json", JSON.stringify(condJson));

  // Rule 7: Short description is multi_line_text_field (ONLY for visible flaws)
  let shortDesc = "";
  if (observations.visible_flaws && observations.visible_flaws.length > 0) {
    shortDesc = observations.visible_flaws.join(", ");
  } else {
    shortDesc = "";
  }
  addMetafield("magento", "short_description", "multi_line_text_field", shortDesc);

  // Final guard: filter out any metafield missing key, namespace, type, or value
  shopify.metafields = metafieldsList.filter((m: any) => m.key && m.namespace && m.type && m.value !== undefined && m.value !== null && String(m.value).trim() !== "");

// Update processing info
  data.processing = {
    modelUsed: modelSucceeded,
    failoverActive: modelSucceeded !== preferredModel && preferredModel !== "smart-routing"
  };

  return data;
}

const TAXONOMY_MAPPINGS_FILE = path.join(process.cwd(), "taxonomyMappings.json");

function readTaxonomyMappings(): Record<string, any> {
  try {
    if (fs.existsSync(TAXONOMY_MAPPINGS_FILE)) {
      return JSON.parse(fs.readFileSync(TAXONOMY_MAPPINGS_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("Error reading taxonomy mappings:", err);
  }
  return {};
}

function writeTaxonomyMappings(mappings: any) {
  try {
    fs.writeFileSync(TAXONOMY_MAPPINGS_FILE, JSON.stringify(mappings, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing taxonomy mappings:", err);
  }
}

const PRODUCT_TYPE_MAPPINGS_FILE = path.join(process.cwd(), "productTypeMappings.json");

function readProductTypeMappings(): Record<string, string> {
  try {
    if (fs.existsSync(PRODUCT_TYPE_MAPPINGS_FILE)) {
      return JSON.parse(fs.readFileSync(PRODUCT_TYPE_MAPPINGS_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("Error reading product type mappings:", err);
  }
  return {};
}

function writeProductTypeMappings(mappings: Record<string, string>) {
  try {
    fs.writeFileSync(PRODUCT_TYPE_MAPPINGS_FILE, JSON.stringify(mappings, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing product type mappings:", err);
  }
}

function getProductTypeMappingsArray(): { garmentPlural: string; productType: string }[] {
  const rawMappings = readProductTypeMappings();
  return Object.entries(rawMappings).map(([garmentPlural, productType]) => ({
    garmentPlural,
    productType
  }));
}

function generateFashionRerunMetafields(sourceData: any): any[] {
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

function checkLogicalRelationship(garmentType: string, subcategory: string): boolean {
  const gt = garmentType.toLowerCase();
  const sub = subcategory.toLowerCase();

  // Keyword maps to identify category types
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

  // Find which category 'sub' matches best
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
      return false; // Conflicting relationship!
    }
    return true;
  }

  // Fallback to substring match
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

function runValidationEngine(
  sourceData: any,
  shopifyProduct: any,
  verifiedMappings: Record<string, any> = {},
  db: any = null
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

  // RULE-03: VENDOR CHECK
  if (db?.config?.defaultVendor && shopifyProduct.vendor && shopifyProduct.vendor !== db.config.defaultVendor) {
    items.push({
      code: "INVALID_VENDOR",
      path: "shopifyProduct.vendor",
      message: `Vendor does not match configured store vendor (${db.config.defaultVendor}).`,
      blocking: false
    });
  }

  // RULE-10: PRODUCT TYPE REGISTRY
  const knownTypes = [
    "Migration_Jackets", "Migration_Hoodies", "Migration_Sweatshirts", "Migration_Hoodies & Sweatshirts",
    "Migration_Tops", "Migration_Blouses & Tops", "Migration_Shirts", "Migration_T-Shirts", "Migration_Jerseys",
    "Migration_Shorts", "Migration_Pants", "Migration_Jeans", "Migration_Knitwear & Sweaters", "Migration_Dresses",
    "Migration_Skirts", "Migration_Vests", "Migration_Caps", "Migration_Hats", "Migration_Accessories"
  ];
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

function mapToNewSchemaFormat(oldResult: any, requestedSku: string = "", db: any = null): any {
  if (!oldResult) return {};

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

  let categoryGid = "";
  if (garmentType) {
    const verifiedMappings = readTaxonomyMappings();
    const mappingKey = Object.keys(verifiedMappings).find(k => k.toLowerCase() === String(garmentType).toLowerCase());
    if (mappingKey && verifiedMappings[mappingKey]?.gid) {
      categoryGid = verifiedMappings[mappingKey].gid;
    }
  }

  const sku = requestedSku || shopify.variants?.[0]?.sku || oldResult.sku || "";
  const price = shopify.variants?.[0]?.price || shopify.price || "125.00";
  const title = shopify.title || "";
  const descriptionHtml = "";
  const imageUrl = oldResult.imageUrl || shopify.imageUrl || "";

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

  const metafields = generateFashionRerunMetafields(sourceData);

  
  // Category attributes are resolved from the connected Shopify store at publish time.
  // Never guess TaxonomyValue IDs: IDs and category applicability can change.
  const taxonomyAttributes: any[] = [];
  
  // Also fix productType to use exact Migration_* format if mapped
  const mappedProductType = shopify?.product_type || shopify?.productType || ("Migration_" + (garmentType || "Jackets"));

  const shopifyProduct = {
    title,
    descriptionHtml,
    vendor: STORE_VENDOR,
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

  const verifiedMappings = readTaxonomyMappings();
  const validationItems = runValidationEngine(sourceData, shopifyProduct, verifiedMappings, db);
  const isBlocked = validationItems.some(v => v.blocking);
  const isWarning = validationItems.some(v => !v.blocking);

  let validationStatus: "BLOCKED" | "WARNING" | "READY" | "PENDING_REVIEW" = isBlocked ? "BLOCKED" : (isWarning ? "WARNING" : "READY");
  if (validationStatus === "READY" && processing?.requiresHumanReview) {
    validationStatus = "PENDING_REVIEW";
  }
  const unresolvedMappings = validationItems.filter(v => v.code === "MISSING_TAXONOMY_MAPPING");

  const responseJson: any = {
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
      status: validationStatus,
      items: validationItems
    },
    processing: {
      modelUsed: processing.modelUsed || "gemini-3.6-flash",
      failoverActive: processing.failoverActive || false,
      requiresHumanReview: true
    }
  };

  if (oldResult.modelImageUrl) responseJson.processing.modelImageUrl = oldResult.modelImageUrl;
  if (oldResult.modelPromptDescription) responseJson.processing.modelPromptDescription = oldResult.modelPromptDescription;
  if (oldResult.imageUrl) responseJson.processing.imageUrl = oldResult.imageUrl;
  if (oldResult.updatedCreditBalance !== undefined) responseJson.processing.updatedCreditBalance = oldResult.updatedCreditBalance;

  return responseJson;
}

async function validateShopifyProductBeforePublish(product: any, db: any): Promise<string | null> {
  const verifiedMappings = readTaxonomyMappings();

  let sourceData: any = {};
  let shopifyProduct: any = product;

  if (product && product.schemaVersion === "3.0.0") {
    sourceData = product.sourceData || {};
    shopifyProduct = product.shopifyProduct || {};
  } else {
    sourceData = {
      brand: product.metafields?.find((m: any) => m.key === "brand_new")?.value,
      taggedSize: product.metafields?.find((m: any) => m.key === "brand_size")?.value,
      recommendedSize: product.metafields?.find((m: any) => m.key === "size")?.value,
      condition: product.metafields?.find((m: any) => m.key === "condition")?.value,
      primaryColor: product.metafields?.find((m: any) => m.key === "color1")?.value,
      gender: product.metafields?.find((m: any) => m.key === "gender")?.value,
      garmentType: (product.product_type || product.productType || "").replace("Migration_", ""),
      subcategory: product.metafields?.find((m: any) => 
        ["hoodies_subcategories", "jumper_knitwear", "cat_jersey", "cat_tshirt", "cat_pants", "cat_shirts", "cat_shorts", "cat_jacket"].includes(m.key)
      )?.value,
      measurements: {
        length: product.metafields?.find((m: any) => m.key === "length")?.value,
        chest: product.metafields?.find((m: any) => m.key === "chest")?.value,
        pitToPit: product.metafields?.find((m: any) => m.key === "pit_to_pit")?.value,
        sleeve: product.metafields?.find((m: any) => m.key === "sleeve")?.value,
        waist: product.metafields?.find((m: any) => m.key === "waist")?.value,
      }
    };
  }

  const items = runValidationEngine(sourceData, shopifyProduct, verifiedMappings);
  const blockingItem = items.find(v => v.blocking);
  if (blockingItem) {
    return `Validation Error: ${blockingItem.message} (${blockingItem.code})`;
  }

  const genderMeta = sourceData.gender || "";
  const productType = shopifyProduct.productType || shopifyProduct.product_type || "";

  // Parse tags safely (supporting both array and comma-separated string)
  const tagsArray: string[] = typeof shopifyProduct.tags === 'string'
    ? shopifyProduct.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : (Array.isArray(shopifyProduct.tags) ? shopifyProduct.tags : []);

  // Canonical tag structure path validations & conflict checks
  const categoryTag = tagsArray.find((tag: string) => tag.startsWith("Category_Default Category/"));
  if (categoryTag) {
    const parts = categoryTag.split("/");
    if (parts.length < 2 || parts.some(p => p === "" || p === "undefined")) {
      return `Validation Error: Taxonomy path violation: Malformed tag structure found '${categoryTag}'`;
    }
    
    // parts[1] is MARKET, parts[2] is GENDER, parts[3] is GARMENT_PLURAL
    if (parts[2]) {
      const tagGender = parts[2].toLowerCase(); // e.g. "women" or "men"
      const metaGender = String(genderMeta).toLowerCase();
      if (tagGender === "women" && metaGender === "men") {
        return `Validation Error: Collection tags conflict with product classification (Tag has WOMEN but Gender is Men).`;
      }
      if (tagGender === "men" && metaGender === "women") {
        return `Validation Error: Collection tags conflict with product classification (Tag has MEN but Gender is Women).`;
      }
    }
    
    if (parts[3]) {
      const tagGarment = parts[3].toLowerCase();
      const metaType = String(productType).replace("Migration_", "").toLowerCase();
      if (tagGarment !== metaType) {
        return `Validation Error: Collection tags conflict with product classification (Tag garment type '${parts[3]}' does not match '${productType}').`;
      }
    }
  }

  // Metafield types matching their Shopify definitions
  const definitions: Record<string, string> = {
    "brand_new": "single_line_text_field",
    "size": "single_line_text_field",
    "brand_size": "single_line_text_field",
    "color1": "single_line_text_field",
    "condition": "single_line_text_field",
    "gender": "single_line_text_field",
    "hoodies_subcategories": "single_line_text_field",
    "jumper_knitwear": "single_line_text_field",
    "cat_jersey": "single_line_text_field",
    "cat_tshirt": "single_line_text_field",
    "cat_pants": "single_line_text_field",
    "cat_shirts": "single_line_text_field",
    "cat_shorts": "single_line_text_field",
    "cat_jacket": "single_line_text_field",
    "pit_to_pit": "single_line_text_field",
    "length": "single_line_text_field",
    "sleeve": "single_line_text_field",
    "waist": "single_line_text_field",
    "inseam": "single_line_text_field",
    "rise": "single_line_text_field",
    "shoulder": "single_line_text_field",
    "condition_info": "json",
    "short_description": "multi_line_text_field"
  };

  if (product.metafields) {
    for (const m of product.metafields) {
      const expectedType = definitions[m.key];
      if (expectedType && m.type !== expectedType) {
        return `Validation Error: Metafield '${m.key}' type '${m.type}' does not match its Shopify definition '${expectedType}'.`;
      }
      
      // JSON metafield validation
      if (m.type === "json") {
        try {
          JSON.parse(m.value);
        } catch (e) {
          return `Validation Error: JSON metafield '${m.key}' contains invalid JSON: ${m.value}`;
        }
      }
    }
  }

  // Image validation
  if (!product.imageUrl) {
    return "Validation Error: The product has no usable images.";
  }

  return null;
}


// Helper to generate simple text completions using the active/failover model engine
async function generateTextWithModel(
  modelId: string,
  prompt: string
): Promise<string> {
  const isGemini = modelId.startsWith("gemini-");
  const isOpenAI = modelId.startsWith("gpt-");
  const isKimi = modelId.startsWith("moonshot-");

  if (isGemini) {
    const response: any = await withGeminiKey("text-helper", modelId, (client) => client.models.generateContent({
      model: modelId,
      contents: prompt
    }));
    return response.text || "";
  } else if (isOpenAI) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API Key is missing in workspace secrets.");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });
    if (!response.ok) {
      const errTxt = await response.text();
      throw new Error(`HTTP ${response.status}: ${errTxt}`);
    }
    const resJson = await response.json();
    return resJson.choices?.[0]?.message?.content || "";
  } else if (isKimi) {
    const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    if (!apiKey) throw new Error("Kimi/Moonshot API Key is missing in workspace secrets.");
    const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });
    if (!response.ok) {
      const errTxt = await response.text();
      throw new Error(`HTTP ${response.status}: ${errTxt}`);
    }
    const resJson = await response.json();
    return resJson.choices?.[0]?.message?.content || "";
  } else {
    throw new Error(`Unsupported model engine: ${modelId}`);
  }
}

// Vision AI Listing Generator Route using GoogleGenAI SDK, OpenAI and Kimi model failovers
app.post("/api/gemini/generate-listing", async (req: any, res) => {
  const { images, promptConfig } = req.body;
  const username = req.authUser?.username;
  const clientId = req.authUser?.clientId;
  // images is array of { base64, label }
  
  if (!images || images.length === 0) {
    return res.status(400).json({ error: "No garment images uploaded for vision analysis." });
  }

  const db = readDB();

  // SaaS credit protection checks
  const client = db.clients?.find(c => c.id === clientId);
  const user = db.users?.find(u => u.username.toLowerCase() === (username || "").toLowerCase());
  const isMasterAdmin = user?.role === "Master Admin";

  if (!isMasterAdmin) {
    if (!client) {
      return res.status(400).json({ error: "No active client profile associated with this account. Access denied." });
    }
    if (client.licenseStatus !== "Active") {
      return res.status(403).json({ error: "Your client account is currently deactivated. Please contact support." });
    }
    const cost = 0; // Listing compilation is free. 1 credit is deducted only on actual Shopify publish upload.
  }

  try {
    const preferredModel = req.body.model || db.config.geminiModel || process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.6-flash";
    const normalizedImages: Array<{ base64: string; label: string; sha256: string }> = [];
    const parts: any[] = [];
    for (let idx = 0; idx < images.length; idx += 1) {
      const img = images[idx];
      const source = String(img.base64 || img.url || "");
      if (!source) continue;
      const loaded = await readImageSource(source);
      const data = loaded.buffer.toString("base64");
      const sha256 = crypto.createHash("sha256").update(loaded.buffer).digest("hex");
      normalizedImages.push({ base64: `data:${loaded.mimeType};base64,${data}`, label: img.label || "Unlabeled", sha256 });
      parts.push({ inlineData: { mimeType: loaded.mimeType, data } });
      parts.push({ text: `Image view ${idx + 1} Label: ${img.label || 'Unlabeled'}` });
    }
    if (!normalizedImages.length) return res.status(400).json({ error: "No readable garment images were supplied." });
    const cacheKey = crypto.createHash("sha256").update(JSON.stringify({
      images: normalizedImages.map(img => [img.sha256, img.label]),
      promptConfig: promptConfig || {},
      model: preferredModel,
      schema: "3.0.0"
    })).digest("hex");
    const cached = sqlite.prepare("SELECT response_json, model_used, created_at FROM ai_cache WHERE cache_key = ?").get(cacheKey) as any;
    if (cached && Date.now() - Date.parse(cached.created_at) < 30 * 24 * 60 * 60_000) {
      const payload = JSON.parse(cached.response_json);
      payload.processing = { ...(payload.processing || {}), cacheHit: true };
      return res.json(payload);
    }

    const activeMappings = getProductTypeMappingsArray();
    const suggestMeasurements = promptConfig?.suggestMeasurements === true;

    const systemInstruction = `You are a professional vintage fashion appraiser and Shopify SEO strategist for the store "${STORE_VENDOR}".
Analyze the provided garment photos (Front, Back, Label, Flaw, etc.) with absolute architectural honesty.
Extract all garment attributes and format them as a valid, strict JSON object. Do not output anything else.

Every product follows this exact workflow: Product -> Collection -> Shopify Search & Discovery -> Filters -> Customer.
We MUST strictly organize the catalog.

Rules:
1. Identify the following fields precisely:
   - classification: market, gender, garment_type, brand, era_estimate, tagged_size
   - observations: colors, features, visible_flaws
   - measurements: pit_to_pit, length, shoulder, sleeve, waist, rise, inseam (${suggestMeasurements ? "Since suggestMeasurements is enabled, please APPRAISE and ESTIMATE approximate physical flat measurements in cm (e.g., '62' or '78') based on the tagged size, type of garment, and visible details. DO NOT use null if possible; suggest realistic values for length, pit_to_pit, shoulder, and sleeve." : "Keep as null placeholders, do not guess physical measurements from photo"}).

2. Follow the SEO Title Generator standard to create GEO-RICH, SEO-optimized titles. Pattern: [Era/category/regional vibe] [Gender] [Brand] [Year/model/team/graphic/geographic designation] [Garment type] [Color or important feature] Size [Tagged size]. Size should be labeled as "Size [Tagged size]" (e.g. Size XL). Limit to under ${db.config.titleMaxLength} characters. Incorporate high-performing geographic/origin terms where relevant (e.g., "USA Made", "NYC Streetwear", "California Beach", "Tokyo Harajuku", "Parisian Retro", collegiate states/regions, or specific sports teams locales) to make titles highly localized, stylish, and geo-rich for search engines.

3. Vendor MUST be "${STORE_VENDOR}". Never emit "${STORE_VENDOR}" or "Fashion rerun".

4. Product type MUST map to the correct Migration prefix using this deterministic list:
${JSON.stringify(activeMappings)}

5. Generate a beautiful, clean semantic HTML description (using p, ul, li, strong, h3, br tags ONLY). Do not use any inline style attributes, hidden comments, or computed class names. Keep it structured like this:
   <p>[Descriptive overview]</p>
   <ul>
     <li><strong>Brand:</strong> [Brand]</li>
     <li><strong>Era:</strong> [Era]</li>
     <li><strong>Garment:</strong> [Garment Plural Type]</li>
     <li><strong>Colour:</strong> [Colors]</li>
     <li><strong>Size on label:</strong> [Tagged Size]</li>
     <li><strong>Fit:</strong> [Fit description or "Please refer to flat measurements"]</li>
     <li><strong>Details:</strong> [Details]</li>
     <li><strong>Condition:</strong> [Condition grade matching EXCELLENT, VERY GOOD, GOOD, FAIR, or POOR]</li>
   </ul>
   <h3>Flat Measurements</h3>
   <ul>
     <li>Pit to pit: ${suggestMeasurements ? "[Estimated Pit to Pit] cm" : "____ cm"}</li>
     <li>Length: ${suggestMeasurements ? "[Estimated Length] cm" : "____ cm"}</li>
     <li>Shoulder: ${suggestMeasurements ? "[Estimated Shoulder] cm" : "____ cm"}</li>
     <li>Sleeve: ${suggestMeasurements ? "[Estimated Sleeve] cm" : "____ cm"}</li>
   </ul>
   <p>Measurements are taken flat. Please compare them with a similar garment you own.</p>

6. For exact ${STORE_VENDOR} tags, produce canonical plural hierarchy paths:
   - Category_Default Category/{MARKET}
   - Category_Default Category/{MARKET}/{GENDER}
   - Category_Default Category/{MARKET}/{GENDER}/{GARMENT_PLURAL}
   Garment names must be exactly: ${JSON.stringify(activeMappings.map(m => m.garmentPlural))}
   - Add "SW COLLECTION", "Streetwear", Tees/Hoodies/Jackets Streetwear tags if confidently streetwear.
   - For jerseys, add sports tags like "Jerseys NFL", "Jerseys MLB", etc. if applicable.

7. Generate detailed metafields inside the 'shopify.metafields' array. These are critical for Shopify Search & Discovery filters:
   - **Global Filter Metafields (Required for ALL products):**
     - Brand: namespace: "magento", key: "brand_new", value: [The brand name, e.g. "Nike"], type: "single_line_text_field"
     - Size: namespace: "magento", key: "size", value: [The standardized size, e.g. "M", "L", "XL"], type: "single_line_text_field"
     - Brand Size: namespace: "magento", key: "brand_size", value: [The tag size, e.g. "Medium", "34"], type: "single_line_text_field"
     - Colour: namespace: "magento", key: "color1", value: [Primary color name, e.g. "Black", "Red"], type: "single_line_text_field"
     - Condition: namespace: "magento", key: "condition", value: [standardized value, e.g. "Excellent", "Very Good", "Good", "Fair"], type: "single_line_text_field"
     - Gender: namespace: "custom", key: "gender", value: [Must be one of "Men", "Women", "Unisex", "Kids"], type: "single_line_text_field"
   
   - **Category-Specific Subtype Metafields (Add ONLY when matching the respective garment_type):**
     - **If garment_type is "Hoodies & Sweatshirts" or "Sweatshirts":** namespace: "custom", key: "hoodies_subcategories", value: [The specific subtype, e.g. "Zip-Up Hoodie", "Pullover Hoodie", "Quarter Zip"], type: "single_line_text_field"
     - **If garment_type is "Knitwear & Sweaters":** namespace: "custom", key: "jumper_knitwear", value: [The specific subtype, e.g. "Crewneck Knit", "Cardigan", "Cable Knit", "Turtleneck"], type: "single_line_text_field"
     - **If garment_type is "Jerseys":** namespace: "magento", key: "cat_jersey", value: [The specific subtype, e.g. "Football", "Basketball", "Baseball", "Rugby"], type: "single_line_text_field"
     - **If garment_type is "T-Shirts":** namespace: "magento", key: "cat_tshirt", value: [The specific subtype, e.g. "Graphic Tee", "Band Tee", "Vintage Tee", "Souvenir T-Shirt"], type: "single_line_text_field"
     - **If garment_type is "Pants" or "Jeans":** namespace: "magento", key: "cat_pants", value: [The specific subtype, e.g. "Cargo", "Chino", "Jogger", "Parachute Pants"], type: "single_line_text_field"
     - **If garment_type is "Shirts":** namespace: "magento", key: "cat_shirts", value: [The specific subtype, e.g. "Flannel", "Oxford", "Denim Shirt", "Hawaiian"], type: "single_line_text_field"
     - **If garment_type is "Shorts":** namespace: "magento", key: "cat_shorts", value: [The specific subtype, e.g. "Cargo Shorts", "Denim Shorts", "Athletic Shorts"], type: "single_line_text_field"
     - **If garment_type is "Jackets":** namespace: "magento", key: "cat_jacket", value: [The specific jacket subtype, e.g. "Denim Jacket", "Windbreaker", "Bomber Jacket", "Racing Jacket"], type: "single_line_text_field"

   - **Measurements Metafields (For product information, NOT storefront filters):**
     - Pit to pit: namespace: "magento", key: "pit_to_pit", value: [Estimated Pit to Pit in cm, e.g. "55"], type: "single_line_text_field"
     - Length: namespace: "magento", key: "length", value: [Estimated Length in cm, e.g. "72"], type: "single_line_text_field"
     - Sleeve: namespace: "magento", key: "sleeve", value: [Estimated Sleeve in cm, e.g. "60"], type: "single_line_text_field"
     - Waist: namespace: "magento", key: "waist", value: [Estimated Waist in cm, e.g. "80"], type: "single_line_text_field"

   - **Informational Description Metafields:**
     - Condition Info: namespace: "custom", key: "condition_info", value: [Condition grade and notes, e.g. "Excellent condition, no signs of wear"], type: "single_line_text_field"
     - Short Description: namespace: "magento", key: "short_description", value: [A concise, single-sentence summary of the product's style, brand, and condition, e.g., "Vintage Nike crewneck sweatshirt in excellent condition."], type: "single_line_text_field"

8. Grade condition carefully. If visible_flaws is not empty, NEVER grade as EXCELLENT.

9. Every field must list a confidence rating from 0.0 to 1.0, evidence source (e.g. neck_label, front_image), and if directly observed or inferred.

10. Estimate a realistic, competitive retail price for the garment in **AED (United Arab Emirates Dirham)** (e.g., "120.00", "150.00", "220.00", "350.00") depending on the brand, condition grade, and era rarity. Format it as a string representing a decimal number without currency symbols (e.g., "120.00"). Store it in the 'price' property of the 'shopify' object.
\n
----------------------------------------
🧠 CORE BEHAVIOR
----------------------------------------

1. Learn from every interaction:
- When a product is processed, store:
  - Image features (visual patterns, colors, shapes)
  - Generated attributes (brand, size, category, era)
  - Final user edits/corrections
  - Listing performance signals (if available)

2. Build internal knowledge:
- Maintain evolving mappings:
  - product_type → category
  - visual pattern → brand/style (e.g., Coogi knit patterns)
  - text keywords → era (Y2K, Vintage, Retro)
- Improve confidence scoring over time

3. Self-correction loop:
- If user edits output:
  → Treat user version as "ground truth"
  → Update future predictions to align with it

4. Pattern recognition:
- Detect repeating structures:
  - Titles format used by user
  - Common brands and styles
  - Size normalization patterns
- Adapt output to match learned patterns

----------------------------------------
📦 PRODUCT PROCESSING LOGIC
----------------------------------------

For each product:

Step 1: Analyze image deeply
- Detect: garment type, brand indicators, fabric, era, gender
- Do NOT hallucinate brand — only assign if confident

Step 2: Generate structured output
- Title (optimized for Shopify/eBay SEO)
- Description
- Category mapping
- Attributes (size, color, gender, era, condition)

Step 3: Compare with memory
- Check similar past products
- Reuse successful patterns

Step 4: Confidence scoring
- High confidence → auto finalize
- Low confidence → mark for review

----------------------------------------
🔁 SELF-LEARNING SYSTEM
----------------------------------------

After each batch:

1. Store:
- Input images
- AI output
- Final saved product (after user edits)

2. Learn:
- Detect differences between AI output vs final saved version
- Update:
  - Title structure rules
  - Category mappings
  - Attribute extraction logic

3. Optimize:
- Prefer patterns that repeat across multiple products
- Remove inconsistent or low-accuracy patterns

----------------------------------------
🧩 APP-SPECIFIC RULES (CRITICAL)
----------------------------------------

- NEVER modify the product itself (no visual changes)
- Always keep output consistent with:
  - Shopify schema
  - eBay listing format (if used)
- Follow existing taxonomy mappings if available
- Use internal schemaMapper when mapping categories

----------------------------------------
🚀 CONTINUOUS IMPROVEMENT MODE
----------------------------------------

Over time, you should:
- Reduce user corrections
- Increase classification accuracy
- Generate near-perfect titles automatically
- Adapt to this store’s unique vintage style

----------------------------------------
⚠️ HARD CONSTRAINTS
----------------------------------------

- Do NOT hallucinate brands
- Do NOT guess sizes without evidence
- Do NOT overwrite learned correct mappings
- Always prioritize real data over assumptions

----------------------------------------
FINAL GOAL:
Become a fully autonomous product listing assistant that improves with every batch and requires minimal human correction.
\n`;

    parts.push({
      text: systemInstruction + `\nAnalyze the garment and return the JSON object matching the requested schema.`
    });

    // Build a bounded Gemini-only model failover queue. Key rotation happens inside each attempt.
    const allPossible = [
      { id: process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.6-flash", available: hasGeminiKeys() },
      { id: process.env.GEMINI_ANALYSIS_FALLBACK_MODEL || "gemini-3.5-flash-lite", available: hasGeminiKeys() }
    ];

    const tryQueue: string[] = [];
    if (preferredModel !== "smart-routing" && preferredModel.startsWith("gemini-")) {
      tryQueue.push(preferredModel);
    }

    allPossible.forEach(candidate => {
      if (candidate.available && !tryQueue.includes(candidate.id)) {
        tryQueue.push(candidate.id);
      }
    });

    if (tryQueue.length === 0) {
      return res.status(500).json({
        error: "No Gemini API keys are configured. Add GEMINI_API_KEY_1, GEMINI_API_KEY_2, or GEMINI_API_KEY_3."
      });
    }

    let lastError: any = null;
    let successfulResult: any = null;
    let modelSucceeded: string = "";

    for (const modelId of tryQueue) {
      try {
        console.log(`Attempting compilation with model engine: ${modelId}`);
        const result = await runAnalysisWithModel(modelId, systemInstruction, normalizedImages, parts);
        successfulResult = result.data;
        modelSucceeded = result.modelUsed;
        console.log(`Success! Listing compiled successfully using ${modelId}`);
        break;
      } catch (err: any) {
        lastError = err;
        if (!isRetryableGeminiError(err)) {
          console.error(`Model engine ${modelId} returned a non-retryable error; no extra paid fallback call will be made.`);
          break;
        }
        console.log(`Model engine ${modelId} is rate-limited or unavailable. Proceeding with one configured fallback model...`);
      }
    }

    if (!successfulResult) {
      return res.status(500).json({
        error: "The AI compiler is currently processing a high volume of requests. Please try again in a few moments."
      });
    }

    // Run server-side normalization and strict formatting/validation
    const normalizedResult = normalizeAndValidateListing(successfulResult, preferredModel, modelSucceeded, db);

    // AI model generation is on-demand only, preventing an extra paid call for every listing.
    normalizedResult.modelImageUrl = undefined;
    normalizedResult.modelPromptDescription = undefined;

    if (normalizedResult.processing?.failoverActive) {
      if (!normalizedResult.warnings) normalizedResult.warnings = [];
      normalizedResult.warnings.push(`Failover Active: Preferred model ${preferredModel} failed, auto-switched to ${modelSucceeded} to avoid quota limits.`);
    }

    if (client) {
      (normalizedResult as any).updatedCreditBalance = client.creditBalance;
    }

    const finalResponsePayload = mapToNewSchemaFormat(normalizedResult, promptConfig?.sku, db);
    sqlite.prepare("INSERT INTO ai_cache (cache_key, response_json, model_used, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET response_json=excluded.response_json, model_used=excluded.model_used, created_at=excluded.created_at")
      .run(cacheKey, JSON.stringify(finalResponsePayload), modelSucceeded || preferredModel, new Date().toISOString());
    res.json(finalResponsePayload);
  } catch (error: any) {
    console.error("Multimodal model compilation workflow failed:", error);
    return res.status(500).json({
      error: "The AI compiler is currently processing a high volume of requests. Please try again in a few moments."
    });
  }
});

// Publish draft to Shopify via Admin GraphQL (persistent integration)

async function shopifyGraphQL(query: string, variables: any, shopName: string, accessToken: string, apiVersion = process.env.SHOPIFY_API_VERSION || "2026-07") {
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
    throw new Error(`Shopify API error (${response.status}): ${text}`);
  }

  const json: any = await response.json();
  if (json.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

async function autoFetchAndSyncShopifyStore(shopName: string, accessToken: string, clientId?: string, apiVersion = "2026-07") {
  if (!shopName || !accessToken) return null;

  const shopQuery = `
    query SyncStoreDetails {
      shop {
        name
        email
        myshopifyDomain
        currencyCode
      }
      locations(first: 10, includeInactive: false) {
        nodes {
          id
          name
          isPrimary
        }
      }
      metafieldDefinitions(first: 50, ownerType: PRODUCT) {
        nodes {
          namespace
          key
          name
          type {
            name
          }
        }
      }
      products(first: 50, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          title
          vendor
          productType
          status
          featuredImage {
            url
          }
          variants(first: 5) {
            nodes {
              id
              price
              compareAtPrice
              sku
              barcode
              inventoryQuantity
            }
          }
        }
      }
    }
  `;

  try {
    const data = await shopifyGraphQL(shopQuery, {}, shopName, accessToken, apiVersion);
    const shop = data?.shop;
    const locations = data?.locations?.nodes || [];
    const metafieldDefs = data?.metafieldDefinitions?.nodes || [];
    const products = data?.products?.nodes || [];

    const primaryLoc = locations.find((l: any) => l.isPrimary) || locations[0];
    const defaultVendor = shop?.name || "Listify AI";

    const syncedProducts = products.map((p: any) => {
      const v0 = p.variants?.nodes?.[0] || {};
      return {
        id: p.id,
        clientId: clientId || "master-workspace-id",
        title: p.title,
        vendor: p.vendor || defaultVendor,
        price: v0.price || "0.00",
        product_type: p.productType || "",
        tags: [],
        metafields: [],
        status: p.status || "DRAFT",
        imageUrl: p.featuredImage?.url || "",
        imageUrls: p.featuredImage?.url ? [p.featuredImage.url] : [],
        sku: v0.sku || "",
        barcode: v0.barcode || "",
        quantity: v0.inventoryQuantity ?? 1
      };
    });

    return {
      shopName: shop?.name || shopName,
      currency: shop?.currencyCode || "AED",
      primaryLocationId: primaryLoc?.id || "",
      primaryLocationName: primaryLoc?.name || "",
      defaultVendor,
      metafieldDefsCount: metafieldDefs.length,
      syncedProducts
    };
  } catch (err: any) {
    console.warn("[Shopify Auto-Sync] Sync store details failed:", err?.message || err);
    return null;
  }
}

async function stageImageForShopify(source: string, shopName: string, accessToken: string, apiVersion?: string) {
  if (/^https:\/\/cdn\.shopify\.com\//i.test(source)) return { resourceUrl: source, storedImageId: undefined };
  const loaded = await readImageSource(source);
  const buffer = loaded.buffer;
  const mimeType = loaded.mimeType;
  const filename = loaded.filename || `listing-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
  const mutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `;
  const data = await shopifyGraphQL(mutation, {
    input: [{ resource: "IMAGE", filename, mimeType, fileSize: String(buffer.length), httpMethod: "POST" }]
  }, shopName, accessToken, apiVersion);
  const errors = data.stagedUploadsCreate?.userErrors || [];
  if (errors.length) throw new Error(`Shopify staged upload setup failed: ${JSON.stringify(errors)}`);
  const target = data.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) throw new Error("Shopify did not return a staged image upload target.");
  const form = new FormData();
  for (const parameter of target.parameters || []) form.append(parameter.name, parameter.value);
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  const uploadResponse = await fetch(target.url, { method: "POST", body: form });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text();
    throw new Error(`Shopify image upload failed (${uploadResponse.status}): ${detail.slice(0, 500)}`);
  }
  return { resourceUrl: target.resourceUrl, storedImageId: loaded.storedImageId };
}


function normalizeMetafieldType(type: unknown): string {
  const value = String(type || "single_line_text_field");
  if (value === "string") return "single_line_text_field";
  if (value === "integer") return "number_integer";
  return value;
}

const metafieldDefinitionCache = new Map<string, { expires: number; value: Map<string, string> }>();
const taxonomyResolutionCache = new Map<string, { expires: number; value: string }>();
async function getProductMetafieldDefinitions(shopName: string, accessToken: string, apiVersion?: string) {
  const cacheKey = `${shopName}:${apiVersion || ''}`;
  const cached = metafieldDefinitionCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  const query = `
    query ProductMetafieldDefinitions {
      metafieldDefinitions(first: 250, ownerType: PRODUCT) {
        nodes { namespace key type { name } }
      }
    }
  `;
  const data = await shopifyGraphQL(query, {}, shopName, accessToken, apiVersion);
  const map = new Map<string, string>();
  for (const node of data.metafieldDefinitions?.nodes || []) {
    map.set(`${node.namespace}.${node.key}`, node.type?.name);
  }
  metafieldDefinitionCache.set(cacheKey, { expires: Date.now() + 15 * 60_000, value: map });
  return map;
}

async function prepareMetafieldsForShopify(metafields: any[], shopName: string, accessToken: string, apiVersion?: string) {
  const definitions = await getProductMetafieldDefinitions(shopName, accessToken, apiVersion);
  const seen = new Set<string>();
  return (metafields || []).flatMap((m: any) => {
    const namespace = String(m.namespace || "").trim();
    const key = String(m.key || "").trim();
    const value = m.value == null ? "" : String(m.value).trim();
    const compound = `${namespace}.${key}`;
    if (!namespace || !key || !value || seen.has(compound)) return [];
    seen.add(compound);
    return [{ namespace, key, value, type: definitions.get(compound) || normalizeMetafieldType(m.type) }];
  });
}

async function publishProductToSalesChannels(productId: string, shopName: string, accessToken: string, apiVersion?: string) {
  try {
    const getPubsQuery = `
      query GetPublications {
        publications(first: 50) {
          nodes {
            id
            name
          }
        }
      }
    `;
    const pubsData = await shopifyGraphQL(getPubsQuery, {}, shopName, accessToken, apiVersion);
    const publications = pubsData.publications?.nodes || [];
    
    if (publications.length === 0) {
      console.log("No publications (sales channels) found on the store.");
      return;
    }

    const publishMutation = `
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    for (const pub of publications) {
      console.log(`Publishing product ${productId} to channel: ${pub.name} (${pub.id})`);
      const res = await shopifyGraphQL(publishMutation, {
        id: productId,
        input: [{ publicationId: pub.id }]
      }, shopName, accessToken, apiVersion);
      
      const errors = res.publishablePublish?.userErrors || [];
      if (errors.length > 0) {
        console.warn(`Failed to publish product to channel ${pub.name}: ${JSON.stringify(errors)}`);
      }
    }
  } catch (error: any) {
    console.error("Error during sales channel publication:", error?.message || error);
  }
}

async function verifyOrResolveTaxonomyCategory(finalProduct: any, shopName: string, accessToken: string, apiVersion?: string) {
  const supplied = String(finalProduct.category || "").trim();
  if (supplied.startsWith("gid://shopify/TaxonomyCategory/")) {
    const query = `query VerifyCategory($id: ID!) { node(id: $id) { ... on TaxonomyCategory { id name fullName } } }`;
    try {
      const data = await shopifyGraphQL(query, { id: supplied }, shopName, accessToken, apiVersion);
      if (data.node?.id) return data.node.id;
    } catch { /* fall through to name search */ }
  }

  const rawType = String(finalProduct.product_type || finalProduct.productType || "").replace(/^Migration_/, "").trim();
  if (!rawType) throw new Error("A product type is required to resolve the Shopify taxonomy category.");
  const cacheKey = `${shopName}:${rawType.toLowerCase()}`;
  const cached = taxonomyResolutionCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  const query = `
    query ResolveTaxonomy($search: String!) {
      taxonomy { categories(first: 20, search: $search) { nodes { id name fullName } } }
    }
  `;
  const data = await shopifyGraphQL(query, { search: rawType }, shopName, accessToken, apiVersion);
  const nodes = data.taxonomy?.categories?.nodes || [];
  const normalized = rawType.toLowerCase();
  const exact = nodes.filter((n: any) => String(n.name || "").toLowerCase() === normalized || String(n.fullName || "").toLowerCase().endsWith(`> ${normalized}`));
  if (exact.length >= 1) { taxonomyResolutionCache.set(cacheKey, { expires: Date.now() + 24 * 60 * 60_000, value: exact[0].id }); return exact[0].id; }
  if (nodes.length >= 1) { taxonomyResolutionCache.set(cacheKey, { expires: Date.now() + 24 * 60 * 60_000, value: nodes[0].id }); return nodes[0].id; }
  throw new Error(`No Shopify taxonomy category found for "${rawType}". Open Admin Settings to configure mapping rules.`);
}

function buildAdminProductUrl(shopName: string, productId: string) {
  let clean = shopName.replace(/^https?:\/\//, "").replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${clean}/products/${productId.split("/").pop()}`;
}

app.post("/api/shopify/publish", async (req: any, res) => {
  const { product, operator, idempotencyKey } = req.body;
  const db = readDB();
  const allowedRoles = new Set(["Master Admin", "Admin", "Company Admin", "Listing Operator"]);
  if (!allowedRoles.has(req.authUser?.role)) return res.status(403).json({ error: "Your role is not allowed to publish products." });

  const clientId = req.authUser?.clientId;
  const isMasterAdmin = req.authUser?.role === "Master Admin";
  const clientIdx = db.clients?.findIndex(c => c.id === clientId);
  const client = (clientIdx !== -1 && clientIdx !== undefined && db.clients) ? db.clients[clientIdx] : null;

  if (!isMasterAdmin && client) {
    if (client.creditBalance < 1) {
      return res.status(402).json({ error: "Insufficient credits. Product upload costs 1 credit." });
    }
  }

  // Safeguard: Check if idempotency key has been already published
  const existingAudit = db.auditLogs.find(log => log.payload?.idempotencyKey === idempotencyKey);
  if (existingAudit?.shopifyResponse?.productId) {
    return res.json({
      success: existingAudit.status === 'SUCCESS',
      duplicateIdempotency: true,
      partial: existingAudit.status !== 'SUCCESS',
      productId: existingAudit.shopifyResponse.productId,
      adminUrl: existingAudit.shopifyResponse.adminUrl,
      message: existingAudit.status === 'SUCCESS'
        ? "Duplicate creation avoided: this request was already completed."
        : "Duplicate creation avoided: Shopify already created this product, but a later setup step needs attention."
    });
  }

  const shopifyConfig = getClientShopifyConfig(clientId, db);

  // Ensure config exists
  if (!shopifyConfig.shopName || !shopifyConfig.accessToken) {
    return res.status(400).json({ error: "Shopify API Connection is not configured in Admin Settings." });
  }

  let finalProduct = product;
  if (product && product.schemaVersion === "3.0.0") {
    finalProduct = {
      ...product.shopifyProduct,
      product_type: product.shopifyProduct.productType,
      imageUrl: product.shopifyProduct.imageUrl || "",
      imageUrls: product.shopifyProduct.imageUrls || [],
      size: product.sourceData?.taggedSize || product.sourceData?.recommendedSize || "One Size"
    };
  }

  // Resolve taxonomy category first so validation does not block
  let verifiedCategory = "";
  try {
    verifiedCategory = await verifyOrResolveTaxonomyCategory(
      finalProduct, shopifyConfig.shopName, shopifyConfig.accessToken, shopifyConfig.apiVersion
    );
    if (product && product.schemaVersion === "3.0.0") {
      product.shopifyProduct.category = verifiedCategory;
    } else {
      product.category = verifiedCategory;
    }
    finalProduct.category = verifiedCategory;
  } catch (err: any) {
    return res.status(400).json({ error: `Taxonomy Category Resolution Error: ${err.message}` });
  }

  // Server-side strict schema validations before API draft publication
  const validationError = await validateShopifyProductBeforePublish(product, db);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Parse tags safely (supporting both array and comma-separated string)
  const tagsArray: string[] = typeof finalProduct.tags === 'string'
    ? finalProduct.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : (Array.isArray(finalProduct.tags) ? finalProduct.tags : []);

  let createdProductId: string | null = null;
  let createdAdminUrl: string | null = null;
  try {

    let sku = finalProduct.sku || "";
    let extractedPrice = finalProduct.price || "";
    if (!extractedPrice && finalProduct.variants && finalProduct.variants[0]) {
      extractedPrice = finalProduct.variants[0].price || "";
      sku = finalProduct.variants[0].sku || sku;
    }
    
    let descriptionHtml = finalProduct.descriptionHtml || finalProduct.description_html || product.descriptionHtml || "";

    const createProductMutation = `
      mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
        productCreate(input: $input, media: $media) {
          product {
            id
            media(first: 20) { nodes { id mediaContentType status } }
            variants(first: 1) {
              nodes {
                id
                inventoryItem {
                  id
                }
              }
              edges {
                node {
                  id
                  inventoryItem {
                    id
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const safeMetafields = await prepareMetafieldsForShopify(
      finalProduct.metafields || [], shopifyConfig.shopName, shopifyConfig.accessToken, shopifyConfig.apiVersion
    );
    const productInput = {
      title: finalProduct.title,
      vendor: finalProduct.vendor,
      productType: finalProduct.product_type,
      tags: tagsArray,
      status: "DRAFT",
      category: verifiedCategory,
      descriptionHtml: descriptionHtml,
      metafields: safeMetafields
    };

    const mediaInput = [];
    const stagedStoredImageIds: Array<string | undefined> = [];
    const approvedImages = Array.from(new Set([
      finalProduct.imageUrl,
      ...(Array.isArray(finalProduct.imageUrls) ? finalProduct.imageUrls : [])
    ].filter(Boolean))).slice(0, 20) as string[];
    for (let index = 0; index < approvedImages.length; index += 1) {
      const staged = await stageImageForShopify(
        approvedImages[index], shopifyConfig.shopName, shopifyConfig.accessToken, shopifyConfig.apiVersion
      );
      mediaInput.push({
        mediaContentType: "IMAGE",
        originalSource: staged.resourceUrl,
        alt: `${finalProduct.title || "Product image"}${index ? ` - view ${index + 1}` : ""}`
      });
      stagedStoredImageIds.push(staged.storedImageId);
    }

    let createResult: any;
    try {
      createResult = await shopifyGraphQL(
        createProductMutation, 
        { input: productInput, media: mediaInput },
        shopifyConfig.shopName,
        shopifyConfig.accessToken,
        shopifyConfig.apiVersion
      );
    } catch (e: any) {
      // Fallback for pre-2024 legacy GraphQL endpoints
      const legacyMutation = `
        mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
          productCreate(product: $product, media: $media) {
            product { id media(first: 20) { nodes { id } } variants(first: 1) { edges { node { id inventoryItem { id } } } } }
            userErrors { field message }
          }
        }
      `;
      createResult = await shopifyGraphQL(
        legacyMutation, 
        { product: productInput, media: mediaInput },
        shopifyConfig.shopName,
        shopifyConfig.accessToken,
        shopifyConfig.apiVersion
      );
    }

    if (createResult.productCreate.userErrors && createResult.productCreate.userErrors.length > 0) {
      return res.status(400).json({ 
        error: "Shopify Product Create Error", 
        details: createResult.productCreate.userErrors 
      });
    }

    const createdProduct = createResult.productCreate.product;
    const productId = createdProduct.id;
    createdProductId = productId;
    createdAdminUrl = buildAdminProductUrl(shopifyConfig.shopName, productId);
    const variantId = createdProduct.variants?.nodes?.[0]?.id || createdProduct.variants?.edges?.[0]?.node?.id;
    const inventoryItemId = createdProduct.variants?.nodes?.[0]?.inventoryItem?.id || createdProduct.variants?.edges?.[0]?.node?.inventoryItem?.id;
    const createdMediaNodes = createdProduct.media?.nodes || [];
    stagedStoredImageIds.forEach((storedImageId, index) => {
      if (!storedImageId) return;
      sqlite.prepare("UPDATE product_images SET shopify_product_id = ?, shopify_media_id = ?, upload_status = 'UPLOADED', updated_at = ? WHERE id = ?")
        .run(productId, createdMediaNodes[index]?.id || null, new Date().toISOString(), storedImageId);
    });

    // Step 2: update the initial variant using current bulk variant API
    if (variantId && (extractedPrice || sku)) {
      const updateVariantMutation = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) {
            productVariants { id }
            userErrors { field message }
          }
        }
      `;
      const variantInput: any = { id: variantId };
      if (extractedPrice) variantInput.price = String(extractedPrice);
      if (finalProduct.compareAtPrice) variantInput.compareAtPrice = String(finalProduct.compareAtPrice);
      if (finalProduct.barcode) variantInput.barcode = String(finalProduct.barcode);
      variantInput.inventoryItem = { sku: String(sku || ""), tracked: true };

      const variantRes = await shopifyGraphQL(
        updateVariantMutation,
        { productId, variants: [variantInput] },
        shopifyConfig.shopName,
        shopifyConfig.accessToken,
        shopifyConfig.apiVersion
      );
      const variantErrors = variantRes.productVariantsBulkUpdate?.userErrors || [];
      if (variantErrors.length > 0) {
        throw new Error(`Shopify variant update failed: ${JSON.stringify(variantErrors)}`);
      }
    }

    // Step 3: Inventory Quantity & Location Activation
    if (inventoryItemId) {
      let locationId = shopifyConfig.inventoryLocationId;
      if (!locationId) {
        try {
          const locQuery = `query { locations(first: 10) { nodes { id name isActive } } }`;
          const locData = await shopifyGraphQL(locQuery, {}, shopifyConfig.shopName, shopifyConfig.accessToken, shopifyConfig.apiVersion);
          const activeLocs = (locData.locations?.nodes || []).filter((x: any) => x.isActive);
          if (activeLocs.length > 0) {
            locationId = activeLocs[0].id;
            console.log(`Automatically resolved location to: ${activeLocs[0].name} (${locationId})`);
            if (clientId && clientId !== "master-workspace-id") {
              const clientIdx = db.clients?.findIndex(c => c.id === clientId);
              if (clientIdx !== -1 && db.clients) {
                db.clients[clientIdx].shopifyConfig = {
                  ...(db.clients[clientIdx].shopifyConfig || {}),
                  inventoryLocationId: locationId
                } as any;
              }
            } else {
              db.config.inventoryLocationId = locationId;
            }
            writeDB(db);
          }
        } catch (err: any) {
          console.warn("Could not automatically resolve location:", err.message);
        }
      }

      if (!locationId) {
        return res.status(400).json({ error: "Select and save an active Shopify inventory location before publishing." });
      }

      if (locationId) {
        const activateInventoryMutation = `
          mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!, $available: Int) {
            inventoryActivate(
              inventoryItemId: $inventoryItemId,
              locationId: $locationId,
              available: $available
            ) {
              inventoryLevel { id }
              userErrors { field message }
            }
          }
        `;
        const invRes = await shopifyGraphQL(
          activateInventoryMutation,
          {
            inventoryItemId,
            locationId,
            available: Math.max(0, Number(finalProduct.inventory_quantity ?? finalProduct.quantity ?? 1))
          },
          shopifyConfig.shopName,
          shopifyConfig.accessToken,
          shopifyConfig.apiVersion
        );
        const inventoryErrors = invRes.inventoryActivate?.userErrors || [];
        if (inventoryErrors.length > 0) {
          throw new Error(`Shopify inventory activation failed: ${JSON.stringify(inventoryErrors)}`);
        }
      }
    }

    // Step 4: Publish to Sales Channels (Online Store, etc.)
    await publishProductToSalesChannels(productId, shopifyConfig.shopName, shopifyConfig.accessToken, shopifyConfig.apiVersion);

    const adminUrl = buildAdminProductUrl(shopifyConfig.shopName, productId);

    const newShopifyProduct = {
      id: productId,
      clientId: clientId || "master-workspace-id",
      title: finalProduct.title,
      vendor: finalProduct.vendor,
      price: extractedPrice,
      product_type: finalProduct.product_type,
      tags: tagsArray,
      metafields: finalProduct.metafields || [],
      status: finalProduct.status || "DRAFT",
      imageUrl: finalProduct.imageUrl || "",
      imageUrls: approvedImages,
      sku,
      barcode: finalProduct.barcode || "",
      quantity: Math.max(0, Number(finalProduct.inventory_quantity ?? finalProduct.quantity ?? 1))
    };

    // Save to persistence store
    db.shopifyProducts.unshift(newShopifyProduct);

    const auditEntry = {
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operator: operator || "Listing Operator",
      clientId: clientId || "master-workspace-id",
      images: approvedImages,
      payload: { ...product, idempotencyKey },
      shopifyResponse: {
        productId,
        adminUrl,
        graphqlVersion: db.config.apiVersion || "2026-07",
        userErrors: [],
        throttlesRemaining: 48,
        timestamp: new Date().toISOString()
      },
      status: 'SUCCESS' as const
    };

    // Deduct credit if not Master Admin
    let balanceAfter = client ? client.creditBalance : 999999;
    if (!isMasterAdmin && client) {
      const balanceBefore = client.creditBalance;
      client.creditBalance = Math.max(0, client.creditBalance - 1);
      balanceAfter = client.creditBalance;

      if (!db.creditTransactions) db.creditTransactions = [];
      db.creditTransactions.unshift({
        id: `tx_${Date.now()}`,
        clientId: client.id,
        companyName: client.companyName,
        username: operator || "Listing Operator",
        dateTime: new Date().toISOString(),
        action: "Product Upload",
        productRef: finalProduct.title || "Shopify Product",
        amount: -1,
        balanceBefore,
        balanceAfter,
        status: "SUCCESS"
      });
    }

    db.auditLogs.unshift(auditEntry);
    writeDB(db);

    res.json({
      success: true,
      productId,
      adminUrl,
      auditEntry,
      updatedCreditBalance: balanceAfter
    });
  } catch (err: any) {
    const failedAudit = {
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operator: operator || "Listing Operator",
      clientId: clientId || "master-workspace-id",
      images: [],
      payload: { ...product, idempotencyKey },
      shopifyResponse: createdProductId ? {
        productId: createdProductId,
        adminUrl: createdAdminUrl,
        graphqlVersion: shopifyConfig.apiVersion || "2026-07",
        userErrors: [],
        timestamp: new Date().toISOString()
      } : null,
      status: (createdProductId ? 'PARTIAL' : 'FAILED') as any,
      errorMessage: err.message || "Failed during Shopify creation"
    };
    db.auditLogs.unshift(failedAudit);
    writeDB(db);

    res.status(500).json({ error: "GraphQL submission failed", details: err.message });
  }
});

// ==========================================
// 1. User Management & Authentication APIs
// ==========================================
app.post("/api/auth/register", (req: any, res) => {
  const db = readDB();
  const hasUsers = Array.isArray(db.users) && db.users.length > 0;
  
  if (hasUsers) {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const authenticatedUser = verifySession(token);
    if (!authenticatedUser || authenticatedUser.role !== "Master Admin") {
      return res.status(403).json({ error: "Access Denied: Only the Master Admin can register new users." });
    }
  }

  const { username, password, fullName, role, companyName } = req.body;
  if (!username || !password || !fullName) {
    return res.status(400).json({ error: "Missing required registration fields" });
  }
  if (String(password).length < 12) {
    return res.status(400).json({ error: "Password must be at least 12 characters." });
  }
  const exists = db.users?.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: "Username already exists" });
  }

  // Create or assign a client profile dynamically
  let assignedClientId = "";
  const finalCompanyName = (companyName && companyName.trim()) || `${fullName}'s Store`;
  
  if (!db.clients) db.clients = [];
  const existingClient = db.clients.find(c => c.companyName.toLowerCase() === finalCompanyName.toLowerCase());
  
  if (existingClient) {
    assignedClientId = existingClient.id;
  } else {
    assignedClientId = `client_${Date.now()}`;
    db.clients.push({
      id: assignedClientId,
      companyName: finalCompanyName,
      contactPerson: fullName,
      email: `${username}@placeholder-listify.com`,
      phone: "+971500000000",
      licenseStatus: "Active",
      subscriptionPeriod: "2026-07-20 to 2027-07-20",
      creditBalance: 150.00 // Give onboarding credits
    });
    if (!db.creditTransactions) db.creditTransactions = [];
    db.creditTransactions.push({
      id: `tx_${Date.now()}`,
      clientId: assignedClientId,
      companyName: finalCompanyName,
      username: "system",
      dateTime: new Date().toISOString(),
      action: "Credit Refill",
      productRef: "SaaS Onboarding Trial",
      amount: 150.00,
      balanceBefore: 0,
      balanceAfter: 150.00,
      status: "SUCCESS"
    });
  }

  const newUser = { 
    username, 
    password: hashPassword(password),
    fullName,
    role: "Listing Operator",
    clientId: assignedClientId
  };
  if (!db.users) db.users = [];
  db.users.push(newUser);
  writeDB(db);

  recordAuditLog("USER_REGISTERED", newUser, { username: newUser.username, role: newUser.role, companyName: finalCompanyName });
  const client = db.clients?.find(c => c.id === assignedClientId);
  res.json({ 
    success: true, 
    user: { 
      username, 
      fullName, 
      role: newUser.role,
      clientId: assignedClientId,
      companyName: client?.companyName || finalCompanyName,
      creditBalance: client?.creditBalance ?? 150.00
    } 
  });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users?.find(u => u.username.toLowerCase() === username.toLowerCase() && verifyPassword(password, u.password));
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const client = db.clients?.find(c => c.id === user.clientId);
  const safeUser = { username: user.username, fullName: user.fullName, role: user.role, clientId: user.clientId || "" };
  recordAuditLog("USER_LOGIN", safeUser, { username: user.username, role: user.role });
  res.json({ 
    success: true,
    token: signSession(safeUser), 
    user: { 
      username: user.username, 
      fullName: user.fullName, 
      role: user.role,
      clientId: user.clientId || "",
      companyName: client?.companyName || (user.role === "Master Admin" ? "SaaS Operator" : "My Workspace"),
      creditBalance: client?.creditBalance ?? (user.role === "Master Admin" ? 999999 : 0)
    } 
  });
});

app.get("/api/auth/users", (req, res) => {
  const db = readDB();
  res.json(db.users?.map(u => {
    const client = db.clients?.find(c => c.id === u.clientId);
    return { 
      username: u.username, 
      fullName: u.fullName, 
      role: u.role,
      clientId: u.clientId || "",
      companyName: client?.companyName || "My Workspace"
    };
  }) || []);
});

// ==========================================
// 2. Batch Upload & Management APIs
// ==========================================
app.get("/api/batches", (req: any, res) => {
  const db = readDB();
  const clientId = req.authUser?.clientId;
  if (req.authUser?.role === "Master Admin") {
    return res.json(db.batches || []);
  }
  const list = (db.batches || []).filter((b: any) => b.clientId === clientId);
  res.json(list);
});

app.post("/api/batches", (req: any, res) => {
  const { name, products, status } = req.body;
  if (!name || !products) {
    return res.status(400).json({ error: "Batch name and products are required" });
  }
  const db = readDB();
  const clientId = req.authUser?.clientId;
  const newBatch = {
    id: `batch_${Date.now()}`,
    clientId: clientId || "master-workspace-id",
    name,
    productCount: products.length,
    uploadDate: new Date().toISOString(),
    status: status || "COMPLETED",
    products
  };
  if (!db.batches) db.batches = [];
  db.batches.unshift(newBatch);
  writeDB(db);
  res.json({ success: true, batch: newBatch });
});

// ==========================================
// 3. eBay Connection & Listing APIs
// ==========================================
app.get("/api/ebay/config", (req, res) => {
  const db = readDB();
  res.json({
    ebayConnected: db.config.ebayConnected || false,
    ebayAccount: db.config.ebayAccount || null,
    ebayAutomationEnabled: db.config.ebayAutomationEnabled || false
  });
});

app.post("/api/ebay/config", (req, res) => {
  const { ebayConnected, ebayAccount, ebayAutomationEnabled } = req.body;
  const db = readDB();
  if (ebayConnected !== undefined) db.config.ebayConnected = ebayConnected;
  if (ebayAccount !== undefined) db.config.ebayAccount = ebayAccount;
  if (ebayAutomationEnabled !== undefined) db.config.ebayAutomationEnabled = ebayAutomationEnabled;
  writeDB(db);
  res.json({ success: true, config: db.config });
});

app.post("/api/ebay/list", (_req, res) => {
  return res.status(501).json({
    error: "eBay publishing is disabled until OAuth, Trading/Inventory API credentials, marketplace policies and real exchange-rate handling are configured."
  });
});

// ==========================================
// 4. Studio AI Model Generation API
// ==========================================
app.post("/api/ai-model/generate", async (req: any, res) => {
  const { productTitle, gender, garmentType, brand, productImage, sku } = req.body;
  const username = req.authUser?.username;
  const clientId = req.authUser?.clientId;
  const db = readDB();
  const client = db.clients?.find(c => c.id === clientId);
  const user = db.users?.find(u => u.username.toLowerCase() === (username || "").toLowerCase());
  const isMasterAdmin = user?.role === "Master Admin";

  if (!isMasterAdmin) {
    if (!client) return res.status(400).json({ error: "No active client profile associated with this account." });
    if (client.licenseStatus !== "Active") return res.status(403).json({ error: "Your client account is deactivated." });
    const modelCost = Number(process.env.AI_MODEL_CREDIT_COST || 1);
    if (client.creditBalance < modelCost) {
      return res.status(402).json({ error: `Insufficient credits. AI model generation costs ${modelCost} credit(s).` });
    }
  }

  if (!hasGeminiKeys()) {
    return res.status(503).json({ error: "No Gemini API keys are configured. AI model generation is unavailable." });
  }
  if (!productImage || typeof productImage !== "string") {
    return res.status(400).json({ error: "A product image is required. Select the clearest front product photo and try again." });
  }

  try {
    const sourceSku = String(sku || productTitle || "MODEL").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80).toUpperCase();
    let sourceImage = await readImageSource(productImage);
    if (!sourceImage.storedImageId) {
      const storedSource = await storeImageRecord({ imageUrl: productImage, sku: sourceSku, filename: `${sourceSku}-model-source.jpg`, label: "Front", kind: "model-source" });
      sourceImage = await readImageSource(storedSource.url);
    }
    const mimeType = sourceImage.mimeType;
    const base64Data = sourceImage.buffer.toString("base64");
    if (sourceImage.buffer.length < 1024) return res.status(400).json({ error: "The selected product image is empty or invalid." });
    if (sourceImage.buffer.length > 15 * 1024 * 1024) return res.status(413).json({ error: "Product image is too large. Use an image below 15 MB." });

    const genderText = gender === "WOMEN" ? "adult female" : gender === "MEN" ? "adult male" : "adult";
    const prompt = `Create one photorealistic e-commerce fashion photograph of an ${genderText} model naturally wearing the exact garment shown in the supplied reference image.

The supplied image is the authoritative product reference. Preserve the garment's exact identity and all visible details: silhouette, cut, proportions, color, print, logo, embroidery, stitching, trim, closures, pockets, distressing, fading, texture, and vintage wear. Do not redesign, modernize, recolor, clean up, add, remove, mirror, replace, or invent any garment detail. Do not substitute a similar product. The garment must be physically worn with realistic fit, drape, folds, occlusion, lighting, and shadows—not pasted on top of the body.

Product context: ${brand || "Vintage"} ${garmentType || "garment"}, ${productTitle || "product"}.

Use a clean neutral studio background, full-body or three-quarter framing, natural commercial pose, realistic anatomy, and soft professional lighting. Keep branding readable when it is readable in the reference. Do not add text, watermarks, accessories that cover the garment, or additional clothing layers over it.`;

    const imageModelsQueue = [
      process.env.GEMINI_IMAGE_MODEL || "imagen-3.0-generate-002",
      process.env.GEMINI_IMAGE_FALLBACK_MODEL || "imagen-3.0-capability-001"
    ];

    let outputImage: any = null;
    let imageModelSucceeded = "";
    let lastImageError: any = null;

    for (const imageModel of imageModelsQueue) {
      try {
        console.log(`Attempting virtual try-on image generation with model: ${imageModel}`);
        const interaction: any = await withGeminiKey("model-generation", imageModel, (client) => client.interactions.create({
          model: imageModel,
          input: [
            { type: "text", text: prompt },
            { type: "image", mime_type: mimeType, data: base64Data }
          ],
          response_format: {
            type: "image",
            mime_type: "image/png",
            aspect_ratio: "4:5",
            image_size: process.env.GEMINI_IMAGE_SIZE || "2K"
          }
        }));
        outputImage = interaction?.output_image || interaction?.outputImage;
        if (outputImage?.data) {
          imageModelSucceeded = imageModel;
          break;
        }
      } catch (err: any) {
        lastImageError = err;
        console.error(`Virtual try-on model ${imageModel} generation failed:`, err?.message || err);
      }
    }

    if (!outputImage?.data) {
      throw new Error(`AI model generation failed across all image engines. Last error: ${lastImageError?.message || lastImageError}`);
    }

    const outputMime = outputImage.mime_type || outputImage.mimeType || "image/jpeg";
    const generatedDataUrl = `data:${outputMime};base64,${outputImage.data}`;
    const storedModel = await storeImageRecord({
      dataUrl: generatedDataUrl,
      sku: sourceSku,
      filename: `${sourceSku}-ai-model-${Date.now()}.jpg`,
      label: "AI Model",
      kind: "model"
    });
    const modelUrl = storedModel.url;


    let balanceAfter = client ? client.creditBalance : 999999;

    res.json({
      success: true,
      modelImageUrl: modelUrl,
      modelImageId: storedModel.id,
      promptDescription: "Reference-image virtual try-on generated for review.",
      generatedViaAI: true,
      requiresReview: true,
      updatedCreditBalance: balanceAfter,
      telemetry: { renderingEngine: imageModelSucceeded, genderFilter: gender || "UNSPECIFIED" }
    });
  } catch (err: any) {
    console.error("[Virtual Try-On] Generation failed:", err?.message || err);
    res.status(502).json({
      error: "AI model generation is currently processing a high volume of requests. Please try again in a few moments.",
      guidance: "Use a clear, front-facing product image on a plain background. Review every generated image before publishing."
    });
  }
});

// ==========================================
// 5. Commercial SaaS SaaS Admin APIs
// ==========================================

// Get all clients (Secure: Master Admin sees all, clients/sub-admins see only theirs)
app.get("/api/admin/clients", (req, res) => {
  const { reqRole, reqClientId } = getAuthHeaders(req);
  const db = readDB();

  if (reqRole === "Master Admin") {
    res.json(db.clients || []);
  } else if (reqClientId) {
    const list = (db.clients || []).filter(c => c.id === reqClientId);
    res.json(list);
  } else {
    res.status(403).json({ error: "Access Denied: Unauthorized client query." });
  }
});

// Create/Update Client (Master Admin only)
app.post("/api/admin/clients", (req, res) => {
  const { reqRole } = getAuthHeaders(req);
  if (reqRole !== "Master Admin") {
    return res.status(403).json({ error: "Access Denied: Only Master Admin can manage client profiles." });
  }

  const { id, companyName, contactPerson, email, phone, licenseStatus, subscriptionPeriod, creditBalance } = req.body;
  if (!companyName) {
    return res.status(400).json({ error: "Company name is required" });
  }

  const db = readDB();
  if (!db.clients) db.clients = [];

  if (id) {
    // Update
    const idx = db.clients.findIndex(c => c.id === id);
    if (idx !== -1) {
      const oldBalance = db.clients[idx].creditBalance;
      db.clients[idx] = {
        ...db.clients[idx],
        companyName,
        contactPerson: contactPerson || db.clients[idx].contactPerson,
        email: email || db.clients[idx].email,
        phone: phone || db.clients[idx].phone,
        licenseStatus: licenseStatus || db.clients[idx].licenseStatus,
        subscriptionPeriod: subscriptionPeriod || db.clients[idx].subscriptionPeriod
      };
      
      // If credit balance was modified directly from edit client, log transaction
      if (creditBalance !== undefined && parseFloat(creditBalance) !== oldBalance) {
        const newBal = parseFloat(creditBalance);
        const diff = newBal - oldBalance;
        db.clients[idx].creditBalance = newBal;
        
        if (!db.creditTransactions) db.creditTransactions = [];
        db.creditTransactions.unshift({
          id: `tx_${Date.now()}`,
          clientId: id,
          companyName: companyName,
          username: "admin",
          dateTime: new Date().toISOString(),
          action: diff > 0 ? "Credit Refill" : "Credit Refund",
          productRef: "Manual adjustment by SaaS Owner",
          amount: diff,
          balanceBefore: oldBalance,
          balanceAfter: newBal,
          status: "SUCCESS"
        });
      }
    } else {
      return res.status(404).json({ error: "Client not found" });
    }
  } else {
    // Create new
    const newId = `client_${Date.now()}`;
    const initialCredits = creditBalance !== undefined ? parseFloat(creditBalance) : 100;
    db.clients.push({
      id: newId,
      companyName,
      contactPerson: contactPerson || "",
      email: email || "",
      phone: phone || "",
      licenseStatus: licenseStatus || "Active",
      subscriptionPeriod: subscriptionPeriod || "2026-01-01 to 2027-01-01",
      creditBalance: initialCredits
    });

    if (!db.creditTransactions) db.creditTransactions = [];
    db.creditTransactions.unshift({
      id: `tx_${Date.now()}`,
      clientId: newId,
      companyName: companyName,
      username: "admin",
      dateTime: new Date().toISOString(),
      action: "Credit Refill",
      productRef: "SaaS onboarding grant",
      amount: initialCredits,
      balanceBefore: 0,
      balanceAfter: initialCredits,
      status: "SUCCESS"
    });
  }

  writeDB(db);
  res.json({ success: true, clients: db.clients });
});

// Refill or Refund credits on-demand (Master Admin only)
app.post("/api/admin/refill", (req, res) => {
  const { reqRole } = getAuthHeaders(req);
  if (reqRole !== "Master Admin") {
    return res.status(403).json({ error: "Access Denied: Only Master Admin can modify credit balances." });
  }

  const { clientId, amount, description, username } = req.body;
  if (!clientId || amount === undefined) {
    return res.status(400).json({ error: "Missing clientId or amount" });
  }

  const db = readDB();
  const client = db.clients?.find(c => c.id === clientId);
  if (!client) {
    return res.status(404).json({ error: "Client profile not found" });
  }

  const change = parseFloat(amount);
  const balanceBefore = client.creditBalance;
  client.creditBalance = Math.max(0, client.creditBalance + change);
  const balanceAfter = client.creditBalance;

  if (!db.creditTransactions) db.creditTransactions = [];
  db.creditTransactions.unshift({
    id: `tx_${Date.now()}`,
    clientId: client.id,
    companyName: client.companyName,
    username: username || "admin",
    dateTime: new Date().toISOString(),
    action: change > 0 ? "Credit Refill" : "Credit Refund",
    productRef: description || "Manual adjustment",
    amount: change,
    balanceBefore,
    balanceAfter,
    status: "SUCCESS"
  });

  writeDB(db);
  res.json({ success: true, client, transactions: db.creditTransactions });
});

// Get all transactions (Secure: Master Admin sees all, client sees only theirs)
app.get("/api/admin/transactions", (req, res) => {
  const { reqRole, reqClientId } = getAuthHeaders(req);
  const { clientId } = req.query;
  const db = readDB();
  
  let list = db.creditTransactions || [];
  
  if (reqRole === "Master Admin") {
    if (clientId && clientId !== "all") {
      list = list.filter(t => t.clientId === String(clientId));
    }
    return res.json(list);
  } else if (reqClientId) {
    // Non-Master Admin can ONLY view their own client's transactions
    list = list.filter(t => t.clientId === reqClientId);
    return res.json(list);
  } else {
    return res.status(403).json({ error: "Access Denied" });
  }
});

// Process client online card payment and generate invoice
app.post("/api/billing/pay", (req: any, res) => {
  const { reqClientId, reqUsername } = getAuthHeaders(req);
  if (!reqClientId || reqClientId === "master-workspace-id") {
    return res.status(400).json({ error: "Online payments are only available for client workspace accounts." });
  }

  const { packageId, cardNumber, cvv, cardHolder } = req.body;
  if (!packageId || !cardNumber || !cvv) {
    return res.status(400).json({ error: "Missing required checkout details: packageId, cardNumber, and CVV are mandatory." });
  }

  const db = readDB();
  const clientIdx = db.clients?.findIndex(c => c.id === reqClientId);
  if (clientIdx === -1 || clientIdx === undefined || !db.clients) {
    return res.status(404).json({ error: "Client workspace profile not found." });
  }
  const client = db.clients[clientIdx];

  const packages: Record<string, { priceAED: number; credits: number; name: string }> = {
    "starter": { priceAED: 87.50, credits: 50, name: "Starter Bundle (50 Credits)" },
    "growth": { priceAED: 262.50, credits: 150, name: "Growth Pack (150 Credits)" },
    "enterprise": { priceAED: 612.50, credits: 350, name: "Enterprise Pro (350 Credits)" }
  };

  const selectedPackage = packages[packageId];
  if (!selectedPackage) {
    return res.status(400).json({ error: "Invalid payment package selected." });
  }

  const cleanCard = String(cardNumber).replace(/\s/g, "");
  if (cleanCard.length < 15 || cleanCard.length > 19) {
    return res.status(400).json({ error: "Payment failed: Invalid credit card number." });
  }

  // Record balance changes
  const balanceBefore = client.creditBalance;
  client.creditBalance = balanceBefore + selectedPackage.credits;
  const balanceAfter = client.creditBalance;

  // Generate deterministic invoice metadata
  const lastFour = cleanCard.slice(-4);
  const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const subtotalAED = selectedPackage.priceAED;
  const vatAED = parseFloat((subtotalAED * 0.05).toFixed(2));
  const totalAED = parseFloat((subtotalAED + vatAED).toFixed(2));

  const invoice = {
    invoiceNumber,
    date: new Date().toISOString(),
    companyName: client.companyName,
    email: client.email || "billing@fashionrerun.com",
    phone: client.phone || "N/A",
    packageName: selectedPackage.name,
    creditsPurchased: selectedPackage.credits,
    subtotalAED,
    vatAED,
    totalAED,
    paymentMethod: `Credit Card (ending in ${lastFour})`,
    cardHolder: cardHolder || "Authorized User",
    status: "PAID"
  };

  if (!db.creditTransactions) db.creditTransactions = [];
  db.creditTransactions.unshift({
    id: `tx_${Date.now()}`,
    clientId: client.id,
    companyName: client.companyName,
    username: reqUsername || "Client Operator",
    dateTime: new Date().toISOString(),
    action: "Credit Refill",
    productRef: `Online Top-up - Invoice ${invoiceNumber}`,
    amount: selectedPackage.credits,
    balanceBefore,
    balanceAfter,
    status: "SUCCESS",
    invoice
  });

  writeDB(db);
  console.log(`[PAYMENT SUCCESS] Client ${client.companyName} (${client.id}) purchased ${selectedPackage.credits} credits. Invoice: ${invoiceNumber}. Total charged: AED ${totalAED}`);

  res.json({
    success: true,
    message: `Payment authorized! AED ${totalAED.toFixed(2)} (including 5% VAT) successfully charged. ${selectedPackage.credits} credits added.`,
    creditBalance: balanceAfter,
    invoice
  });
});


// Get system usage metrics and billing logs
app.get("/api/admin/analytics", (req, res) => {
  const { reqRole } = getAuthHeaders(req);
  if (reqRole !== "Master Admin") {
    return res.status(403).json({ error: "Access Denied: Master Admin analytics only." });
  }

  const db = readDB();
  const clientsCount = db.clients?.length || 0;
  const usersCount = db.users?.length || 0;
  const totalListings = db.shopifyProducts?.length || 0;
  
  const transactions = db.creditTransactions || [];
  const totalRefilled = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const totalCharged = Math.abs(transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));
  
  res.json({
    clientsCount,
    usersCount,
    totalListings,
    totalRefilled,
    totalCharged,
    estimatedRevenueAED: totalRefilled * 1.75
  });
});

// Get and Update AI feature credit costs (Master Admin only)
app.get("/api/admin/costs", (req, res) => {
  const db = readDB();
  res.json({
    costListingCredit: db.config.costListingCredit || 1,
    costModelCredit: db.config.costModelCredit || 1
  });
});

app.post("/api/admin/costs", (req, res) => {
  const { reqRole } = getAuthHeaders(req);
  if (reqRole !== "Master Admin") {
    return res.status(403).json({ error: "Access Denied: Only Master Admin can modify cost configurations." });
  }

  const { costListingCredit, costModelCredit } = req.body;
  const db = readDB();
  if (costListingCredit !== undefined) db.config.costListingCredit = parseInt(costListingCredit);
  if (costModelCredit !== undefined) db.config.costModelCredit = parseInt(costModelCredit);
  writeDB(db);
  res.json({ success: true, config: db.config });
});

// GET /api/admin/users: Role-based Directory Fetching
app.get("/api/admin/users", (req, res) => {
  const { reqRole, reqClientId } = getAuthHeaders(req);
  const db = readDB();

  if (reqRole === "Master Admin") {
    const list = (db.users || []).map(u => {
      const client = db.clients?.find(c => c.id === u.clientId);
      return {
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        clientId: u.clientId || "",
        companyName: client?.companyName || "Master Workspace"
      };
    });
    return res.json(list);
  } else if (reqRole === "Sub Admin" || reqRole === "Store Administrator") {
    // Filter to only their company users
    const list = (db.users || [])
      .filter(u => u.clientId === reqClientId)
      .map(u => {
        const client = db.clients?.find(c => c.id === u.clientId);
        return {
          username: u.username,
          fullName: u.fullName,
          role: u.role,
          clientId: u.clientId || "",
          companyName: client?.companyName || "My Company"
        };
      });
    return res.json(list);
  } else {
    return res.status(403).json({ error: "Access Denied: Administration privileges required." });
  }
});

// POST /api/admin/users: Create/Update user accounts securely
app.post("/api/admin/users", (req, res) => {
  const { reqRole, reqClientId } = getAuthHeaders(req);
  
  if (reqRole !== "Master Admin" && reqRole !== "Sub Admin" && reqRole !== "Store Administrator") {
    return res.status(403).json({ error: "Access Denied: Administrative privileges required." });
  }

  const { username, fullName, password, role, clientId, isEdit, oldUsername } = req.body;
  if (!username || !fullName) {
    return res.status(400).json({ error: "Username and full name are required." });
  }

  // Security bounds
  let targetClientId = clientId;
  let targetRole = role;

  if (reqRole !== "Master Admin") {
    // Sub-admins can ONLY create users for their own company
    targetClientId = reqClientId;
    // Sub-admins cannot promote anyone to Master Admin
    if (role === "Master Admin") {
      targetRole = "Listing Operator";
    }
  }

  const db = readDB();
  if (!db.users) db.users = [];

  if (isEdit) {
    // Editing an existing user
    const idx = db.users.findIndex(u => u.username.toLowerCase() === (oldUsername || username).toLowerCase());
    if (idx === -1) {
      return res.status(404).json({ error: "Target user not found." });
    }

    // Protection check
    if (reqRole !== "Master Admin" && db.users[idx].clientId !== reqClientId) {
      return res.status(403).json({ error: "Access Denied: Cannot modify a user from another company." });
    }

    db.users[idx].fullName = fullName;
    db.users[idx].role = targetRole;
    db.users[idx].clientId = targetClientId;
    
    if (password && password.trim()) {
      db.users[idx].password = hashPassword(password);
    }
  } else {
    // Creating a new user
    const exists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: "An account with this username already exists." });
    }

    db.users.push({
      username: username.toLowerCase(),
      fullName,
      password: hashPassword(password || crypto.randomBytes(18).toString("base64url")),
      role: targetRole,
      clientId: targetClientId
    });
  }

  writeDB(db);
  res.json({ success: true });
});

// POST /api/admin/users/delete: Remove/Deactivate operator profiles securely
app.post("/api/admin/users/delete", (req, res) => {
  const { reqRole, reqClientId, reqUsername } = getAuthHeaders(req);

  if (reqRole !== "Master Admin" && reqRole !== "Sub Admin" && reqRole !== "Store Administrator") {
    return res.status(403).json({ error: "Access Denied: Administrative privileges required." });
  }

  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }

  if (username.toLowerCase() === reqUsername.toLowerCase()) {
    return res.status(400).json({ error: "You cannot delete your own logged-in session account." });
  }

  const db = readDB();
  if (!db.users) db.users = [];

  const idx = db.users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) {
    return res.status(404).json({ error: "Target user not found." });
  }

  // Protection check
  if (reqRole !== "Master Admin" && db.users[idx].clientId !== reqClientId) {
    return res.status(403).json({ error: "Access Denied: Cannot delete a user from another company." });
  }

  // Delete user
  db.users.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// Vite & Static file configurations
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.BUILDING_FUNCTIONS !== "true" && !process.env.FIREBASE_CONFIG) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Listify AI Listing Studio Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();
export { app };
