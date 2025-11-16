# GitHub Pages Deployment Guide

Your landing page is ready to deploy to GitHub Pages!

## Quick Setup (2 minutes)

### Option A: Automatic (Recommended)
The GitHub Actions workflow will auto-deploy on every push to main:

1. **Push your code:**
   ```bash
   git add .
   git commit -m "Set up GitHub Pages"
   git push origin main
   ```

2. **Enable GitHub Pages:**
   - Go to repo **Settings** → **Pages**
   - Source: "Deploy from a branch"
   - Branch: `main`
   - Folder: `/docs`
   - Click **Save**

3. **That's it!** 🚀
   - GitHub Actions will build automatically
   - Site will be live at: `https://<username>.github.io/<repo-name>/`

### Option B: Manual Build
If you want to build locally first:

```powershell
# Build the frontend
npm run build:gh-pages

# Commit and push
git add docs/ .nojekyll
git commit -m "Build for GitHub Pages"
git push origin main
```

Then follow the same Pages setup steps above.

## What's Included

✅ **UI-only deployment** — No backend required  
✅ **Automated builds** — GitHub Actions workflow included  
✅ **Scroll & animations** — Full UI/UX preserved  
✅ **Mobile responsive** — All devices supported  
✅ **One-command build** — `npm run build:gh-pages`

## File Structure
```
root/
├── .github/
│   └── workflows/
│       └── deploy.yml          ← Auto-deploy workflow
├── docs/                        ← GitHub Pages serves from here
│   ├── index.html
│   ├── assets/
│   ├── .nojekyll
│   └── ...
├── client/                      ← React source
├── scripts/
│   ├── gh-pages-build.js       ← Build script
│   └── deploy-local.js         ← Local dev script
└── package.json
```

## Deployment Status

Watch your deployment:
1. Push to main
2. Go to repo **Actions** tab
3. See "Build and Deploy to GitHub Pages" workflow running
4. When green ✅ — site is live!

## Troubleshooting

**Pages not showing?**
- Wait 1-2 minutes for the first build
- Check **Actions** tab for build errors
- Ensure `/docs` folder is in Settings > Pages

**Want to use a different branch?**
- Edit `.github/workflows/deploy.yml`
- Change `branches: [ main ]` to your branch
- Push and re-enable Pages

**Need to rebuild?**
```powershell
npm run build:gh-pages
git add docs/
git commit -m "Rebuild"
git push
```

---

**Ready?** Just commit and push:
```bash
git add -A
git commit -m "Set up GitHub Pages"
git push
```

Your site will be live in 1-2 minutes! 🎉

