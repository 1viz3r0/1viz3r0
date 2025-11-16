# GitHub Pages Deployment Guide

Your landing page is ready to deploy to GitHub Pages!

## Quick Setup

### 1. Build for GitHub Pages
```powershell
npm run build:gh-pages
```
This will:
- Build the frontend with `VITE_DISABLE_AUTH=true` (UI-only, no backend calls)
- Output to the `docs/` folder
- Create `.nojekyll` file to prevent Jekyll processing

### 2. Commit & Push
```bash
git add docs/
git commit -m "Build for GitHub Pages"
git push origin main
```

### 3. Enable GitHub Pages
1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Build and deployment":
   - **Source**: Select "Deploy from a branch"
   - **Branch**: Select `main`
   - **Folder**: Select `/docs`
4. Click **Save**

GitHub will automatically deploy and your site will be live at:
- `https://<username>.github.io/<repo-name>/`

## File Structure
```
root/
├── docs/              ← GitHub Pages serves from here
│   ├── index.html
│   ├── assets/
│   └── .nojekyll
├── client/            ← React source
├── auth/              ← Backend (optional)
├── scripts/
│   └── gh-pages-build.js
└── package.json
```

## Features
✅ **UI-only deployment** — No backend required (auth disabled)  
✅ **Scroll & animations** — All UI/UX preserved  
✅ **Mobile responsive** — Full responsive design  
✅ **One-command build** — `npm run build:gh-pages`

## Notes
- The site runs completely client-side with no backend calls
- All auth pages (Login, Register, Verify OTP) are non-interactive demos
- Ideal for showcasing the landing page and UI design
- To add backend functionality later, update `.env` in deployment settings

---

**Ready to deploy?** Run:
```
npm run build:gh-pages && git add docs/ && git commit -m "Build for GitHub Pages" && git push
```
