# Suraksha-Chain — Deployment Guide

## Architecture

`
Netlify (Frontend)  ──→  Render (Backend API + SQLite on Disk)
React + Vite              Express + sql.js + /var/data/suraksha.db
`

---

## Step 1 — Deploy Backend to Render

1. Go to https://render.com and create a free account
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Render will auto-detect ender.yaml — click **Apply**
5. Set these environment variables in the Render dashboard:
   - APP_URL = https://suraksha-chain.onrender.com (your Render URL)
   - CORS_ORIGINS = https://your-app.netlify.app (your Netlify URL — add after step 3)
   - BOOTSTRAP_PASSWORD = any strong password (for demo accounts)
6. Click **Deploy** — wait for it to go live
7. **Copy your Render URL** (e.g. https://suraksha-chain.onrender.com)
8. Test: visit https://suraksha-chain.onrender.com/api/health → should return {"ok":true}

---

## Step 2 — Deploy Frontend to Netlify

1. Go to https://netlify.com and create a free account
2. Click **Add new site → Import an existing project**
3. Connect your GitHub repo
4. Build settings (auto-detected from netlify.toml):
   - Build command: 
pm run build:client
   - Publish directory: dist
5. **IMPORTANT** — Before deploying, add this environment variable:
   - Go to **Site Settings → Environment Variables**
   - Add: VITE_API_URL = https://suraksha-chain.onrender.com (your Render URL from Step 1)
6. Click **Deploy site**
7. Copy your Netlify URL (e.g. https://your-app.netlify.app)

---

## Step 3 — Connect Frontend ↔ Backend (CORS)

1. Go back to Render dashboard → your service → **Environment**
2. Update CORS_ORIGINS = https://your-app.netlify.app (your Netlify URL)
3. Click **Save Changes** — Render will auto-redeploy

---

## Step 4 — Verify

- Visit your Netlify URL → login page should load
- Login with: dmin@suraksha.gov.in / <your BOOTSTRAP_PASSWORD>
- All features should work

---

## Demo Accounts (created on first boot)

| Email | Password | Role |
|---|---|---|
| admin@suraksha.gov.in | BOOTSTRAP_PASSWORD | Admin |
| io@suraksha.gov.in | BOOTSTRAP_PASSWORD | Investigating Officer |
| forensic@suraksha.gov.in | BOOTSTRAP_PASSWORD | Forensic Expert |
| prosecutor@suraksha.gov.in | BOOTSTRAP_PASSWORD | Prosecutor |
| court@suraksha.gov.in | BOOTSTRAP_PASSWORD | Court Officer |

---

## Troubleshooting

| Error | Fix |
|---|---|
| "Cannot reach the API at /api" | Set VITE_API_URL in Netlify dashboard → redeploy |
| CORS error in browser console | Set CORS_ORIGINS in Render to your exact Netlify URL |
| Login fails | Check BOOTSTRAP_PASSWORD is set in Render env vars |
| Data lost on restart | Make sure Render disk is mounted at /var/data |
