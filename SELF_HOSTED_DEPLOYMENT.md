# On-Premise Self-Hosted Deployment Guide

This guide describes how to install, configure, and host **Listify AI** locally on your own office server or local network machine.

---

## 1. Prerequisites

Before installing, make sure your local server machine has:
* **Node.js**: Version 20.x or higher (LTS recommended). Download from [nodejs.org](https://nodejs.org/).
* **Network Access**: Port `3000` must be free and open for local network requests.

---

## 2. Installation & Quick Start

1. **Extract the Package**:
   Extract `listify-ai.zip` to a dedicated directory on the server (e.g., `C:\ListifyAI` or `/var/www/listify-ai`).

2. **Install Dependencies**:
   Open your command prompt or terminal inside the extracted directory and run:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root folder of the project:
   ```env
   PORT=3000
   NODE_ENV=production
   GEMINI_API_KEY_1=your_first_gemini_key
   GEMINI_API_KEY_2=your_second_gemini_key
   GEMINI_API_KEY_3=your_third_gemini_key
   INITIAL_ADMIN_PASSWORD=AdminOwner2026!
   ```

4. **Build & Start the Application**:
   Run the compiler and start the production server:
   ```bash
   npm run build
   npm start
   ```
   *The server is now live at `http://localhost:3000`.*

---

## 3. Local Network Configuration

To allow staff members in your office to use the application from their own computers:

1. **Find your Server IP Address**:
   * **Windows**: Open Command Prompt and type `ipconfig` (find IPv4 Address under your active network, e.g., `192.168.1.50`).
   * **Mac/Linux**: Open terminal and type `ifconfig` or `ip a`.

2. **Access from Office Devices**:
   Open a browser on any laptop or phone connected to the same office Wi-Fi and type:
   ```text
   http://<YOUR-SERVER-IP>:3000
   ```
   *(For example: `http://192.168.1.50:3000`)*

---

## 4. Administrative Login & Store Setup

Once the app is loaded in the browser:

1. **Log in as Master Admin**:
   * **Username**: `master_admin`
   * **Password**: `AdminOwner2026!` *(or what you set in `.env`)*

2. **Create your Local Client & Operators**:
   * Go to the **SaaS Master Panel** tab in the left sidebar.
   * Add a new client profile for your vintage store (e.g., *Fashion Rerun*).
   * In the **Users** section, create user logins for your inventory operators. Set their role to `Listing Operator` or `Company Admin`.

3. **Connect Shopify**:
   * Log out of the `master_admin` account and log in with your new user account.
   * Go to the **Company Admin** tab.
   * Input your Shopify Shop domain (`your-store.myshopify.com`) and your custom app **Admin API Access Token** (starts with `shpat_`).
   * Click **Save settings**. The system will automatically connect and resolve your inventory location IDs.

---

## 5. Offline Backups

All user accounts, credit states, Shopify logs, and product images are stored locally on the server in:
- **`src/data/listing-studio.sqlite`**

To back up your system, simply copy or make a duplicate of this single `.sqlite` file.
