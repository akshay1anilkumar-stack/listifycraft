# ListifyCraft - Cloud Deployment Guide (www.listifycraft.com)

This guide provides instructions for deploying **ListifyCraft** to any cloud platform or custom VPS under your custom domain (e.g. `https://www.listifycraft.com`).

---

## 🚀 Option 1: Docker / Container Hosting (Render, Railway, Cloud Run, AWS)

The repository includes a production-optimized `Dockerfile`.

1. **Upload your code** to GitHub or GitLab.
2. **Create a Web Service** on Render, Railway, or Google Cloud Run pointing to your repository.
3. **Set Environment Variables**:
   - `PORT`: `3000` (or leave default assigned by host)
   - `NODE_ENV`: `production`
   - `SESSION_SECRET`: `generate-a-secure-random-key-here`
   - `APP_DOMAIN`: `https://www.listifycraft.com`
   - `GEMINI_API_KEY_1`: `your-gemini-api-key`
   - `DATABASE_PATH`: `/app/data/listing-studio.sqlite` (Mount a persistent disk to `/app/data` if using Render/Railway to preserve SQLite data on restarts).
4. **Attach Custom Domain**:
   - In your cloud dashboard, add custom domain `www.listifycraft.com`.
   - Update your DNS CNAME record: `www` -> `your-cloud-app.onrender.com` (or Railway CNAME).

---

## 🖥️ Option 2: Linux VPS (Ubuntu / Debian + Nginx + PM2)

If hosting on DigitalOcean, AWS EC2, Hetzner, or Linode:

### Step 1: Install Node.js 22 & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs Nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

### Step 2: Extract & Install App
```bash
sudo mkdir -p /var/www/listifycraft
cd /var/www/listifycraft
# Copy listify-ai.zip here and unzip:
unzip listify-ai.zip
npm install
npm run build
```

### Step 3: Start with PM2
```bash
pm2 start dist/server.cjs --name "listify-studio"
pm2 save
pm2 startup
```

### Step 4: Configure Nginx & SSL Certbot (`www.listifystudio.com`)
Create `/etc/nginx/sites-available/listify-studio`:
```nginx
server {
    server_name www.listifystudio.com listifystudio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable & apply SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/listify-studio /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d www.listifystudio.com -d listifystudio.com
```

---

## 🛠️ Environment Variables Reference

| Variable | Description | Recommended Production Value |
| :--- | :--- | :--- |
| `PORT` | Server listening port | `3000` |
| `NODE_ENV` | App execution mode | `production` |
| `APP_DOMAIN` | Public domain origin | `https://www.listifystudio.com` |
| `SESSION_SECRET` | Secret key for JWT sessions | 32+ random characters |
| `DATABASE_PATH` | SQLite database file location | `src/data/listing-studio.sqlite` |
| `GEMINI_API_KEY_1` | Primary Gemini Vision API key | Your Google AI key |
| `SHOPIFY_DEFAULT_VENDOR` | Fallback shopify store vendor | `Listify Studio` |
