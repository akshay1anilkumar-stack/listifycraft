# Enterprise SaaS Architecture & Cloud Database Security Guide

**Platform**: ListifyCraft (Private Enterprise Multi-Tenant SaaS)  
**Target Architecture**: Production Cloud Database (PostgreSQL / Managed SQLite), Multi-Tenant Workspace Isolation, Credit Locking, and High-Availability Failover.

---

## 🏛️ 1. Enterprise Cloud Database Provisioning

To operate ListifyCraft as a high-end, professional SaaS application, tenant data, credit balances, and synced catalogs must be hosted on a persistent, managed cloud database rather than temporary container storage.

### 🌟 Recommended Managed Database Providers (100% Free Tiers Available)

#### **Option A: Render PostgreSQL (Recommended for 1-Click Integration)**
1. In your **Render Dashboard**, click **New +** → **PostgreSQL**.
2. Set Name: `listifycraft-db` → Plan: `Free`.
3. Copy the **Internal Database URL** (e.g. `postgres://listifycraft_user:...@dpg-...-a/listifycraft_db`).
4. In your ListifyCraft Web Service **Environment Variables**, add:
   - `DATABASE_URL` = *(Your Render Postgres Internal URL)*

---

#### **Option B: Supabase / Neon PostgreSQL (Production Managed Cloud)**
1. Create a free account at **[Supabase.com](https://supabase.com)** or **[Neon.tech](https://neon.tech)**.
2. Create a project named `listifycraft`.
3. Copy the Connection String URI (`postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres`).
4. In your Render Web Service **Environment Variables**, set:
   - `DATABASE_URL` = *(Your Supabase Connection String)*

---

## 🔒 2. Multi-Tenant Safety & Workspace Isolation

ListifyCraft implements **Strict Logical Tenant Isolation**:

### Safety Features Active:
- **Role-Based Access Control (RBAC)**:
  - `Master Admin`: Access to all workspaces, global API keys, and company profile creation.
  - `Company Admin`: Access only to their company workspace, staff users, and store configuration.
  - `Listing Operator`: Read/Write access to cataloging and publishing within their assigned tenant.
- **Credit Lock Protection**:
  - Drafting vision analysis, background removal, and AI model try-ons are **0 credits (Free)**.
  - Actual publishing to Shopify costs **1 credit** and executes inside an atomic transaction.
- **Idempotency Safeguards**:
  - Every product upload generates a SHA-256 idempotency key (`publish_sku_timestamp`) to prevent accidental double-publishing or credit double-deduction.

---

## 🤖 3. High-Availability AI Engine & Failover Protection

ListifyCraft is built with an enterprise **AI Key Pool & Model Routing Engine**:

- **Up to 3 Gemini API Keys Supported**: Configure `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, and `GEMINI_API_KEY_3`.
- **Automatic Cooldown & Failover**: If Key #1 encounters a rate limit or 429 quota error, the server automatically rotates to Key #2 and Key #3 with exponential backoff.
- **Zero Interruption**: Your users never experience AI generation failures due to individual API key limits.
