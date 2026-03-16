# 🏃 Galah Panjang — Online Multiplayer

Real-time multiplayer Galah Panjang (Galasin) game. Built with **React + Node.js + Socket.io**.

---

## 🚀 Deploy to Production

This project has two parts:

```
React Client  →  Netlify (free static hosting)
Node.js Server →  Railway or Render (free backend hosting)
```

---

### Step 1 — Push to GitHub

```bash
cd galah-panjang
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/galah-panjang.git
git push -u origin main
```

---

### Step 2 — Deploy Server on Railway (recommended)

1. Go to [railway.app](https://railway.app) → sign in with GitHub
2. **New Project → Deploy from GitHub repo** → select your repo
3. Set **Root Directory** to `server`
4. Add env var: `PORT = 3001`
5. Deploy → copy the URL e.g. `https://galah-panjang-server.up.railway.app`

**Alternative: Render.com**
1. New Web Service → connect GitHub repo
2. Root Directory: `server` | Build: `npm install` | Start: `node server.js`
3. Deploy → copy the URL

---

### Step 3 — Deploy Client on Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site → Import from GitHub**
2. Select your repo — Netlify auto-reads `netlify.toml` (base: `client`, publish: `build`)
3. Add environment variable:
   - `REACT_APP_SERVER_URL` = your Railway/Render URL from Step 2
4. **Deploy site**

---

### Step 4 — Done!

Open your Netlify URL and share it with friends. Both desktop and mobile supported.

If you update `REACT_APP_SERVER_URL` later: Netlify → Deploys → Trigger redeploy.

---

## 💻 Local Development

```bash
npm run install:all   # install all deps
npm run dev           # starts server + client, prints LAN IP for mobile
```

---

## 🎮 Controls

| Key | Action |
|-----|--------|
| `↑ W` | Move up (toward goal) |
| `↓ S` | Move down |
| `← A` | Move left |
| `→ D` | Move right |
| `Q` | Grab — extend left arm |
| `E` | Grab — extend right arm |

Mobile: D-pad on left, grab buttons on right.

---

Made with ❤️ — Traditional Malaysian game, now online! 🇲🇾
