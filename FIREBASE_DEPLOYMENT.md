# Firebase 1-Click Deployment Guide for ListifyCraft

Your ListifyCraft repository is now pre-configured for **Firebase Hosting**!

---

## ⚡ 1-Minute Firebase Deployment Steps

### Step 1: Open Terminal in `final_build` Folder
```bash
cd "c:\Users\SHAFEER\Downloads\fashion-rerun-listing-studio-production-ready-delivery\final_build"
```

### Step 2: Log into your Google Firebase Account
Run the login command (this will open a Google browser tab for approval):
```bash
npx firebase-tools login
```

### Step 3: Deploy your Live Web App ($0/mo)
Run the build & deploy script:
```bash
npm run build && npx firebase-tools deploy
```

---

### 🎉 Your Live Firebase URL
Once deployed, Firebase will print your live production URL:
👉 **`https://[YOUR-PROJECT-ID].web.app`**
