# Deployment & Auth Debugging Guide

## Current Status ✅

**Deployment:**
- ✅ GitHub Pages: https://1viz3r0.github.io/1viz3r0/
- ✅ Custom Domain: https://hawkursociety.xyz/
- ✅ CNAME configured for custom domain
- ✅ Base path: `/` (root) - works with both URLs
- ✅ Auth disabled in production build: `VITE_DISABLE_AUTH=true`

**Auth Setup:**
- ✅ API client stubbed (`client/src/lib/api.ts`)
- ✅ Login/Register pages check `VITE_DISABLE_AUTH` flag
- ✅ OTP verification page disabled when auth is off
- ✅ All auth functions return demo responses

**Local Dev:**
- ✅ Dev server running: http://localhost:8080/
- ✅ Hot reload enabled
- ✅ Auth disabled in development build

---

## If You See Blank White Screen

### Step 1: Check Browser Console (F12)
Press `F12` → Console tab → Look for:
- ❌ `Failed to fetch` errors → Network issue
- ❌ `Cannot find module` errors → Missing assets
- ✅ No errors → Issue might be CSS/rendering

### Step 2: Check Asset Loading
Press `F12` → Network tab → Look at:
- `index-*.js` file - should load OK
- `index-*.css` file - should load OK
- `favicon.ico` - can fail without breaking site

### Step 3: Check if Root Element Loads
Press `F12` → Elements tab → Look for:
```html
<div id="root">
  <!-- React content should be here -->
</div>
```

If empty, React failed to render. Check Console for errors.

---

## Auth Flow Verification

### Test Login/Register (Should be disabled)
1. Go to http://localhost:8080/login
2. Try entering credentials
3. Expected: **Inputs disabled**, button disabled
4. Message shows: "Authentication is disabled in this deployment"

### Test Register → Verify OTP (Should be disabled)
1. Go to http://localhost:8080/login?mode=register
2. Inputs should be disabled
3. Cannot proceed to OTP verification

### Test OTP Page (Should be disabled)
1. Go to http://localhost:8080/verify
2. OTP input should be disabled
3. Buttons should be disabled
4. Message shows: "Authentication disabled in this deployment"

---

## API Verification

Check `client/src/lib/api.ts`:
```typescript
const DISABLE = import.meta.env.VITE_DISABLE_AUTH === 'true';

export async function login(email, password) {
  if (DISABLE) return delay({ success: true, token: 'demo-token' });
  // ... real backend call
}
```

✅ When `VITE_DISABLE_AUTH=true` → Returns mock data  
✅ No network calls made  
✅ All auth functions stubbed  

---

## Build Verification

### Local Build
```powershell
npm run build:gh-pages
```

Result should show:
```
✅ Created .nojekyll
✅ Build complete! docs/ folder ready for GitHub Pages
../docs/index.html                     1.13 kB
../docs/assets/index-*.css            65.27 kB
../docs/assets/index-*.js          1,209.78 kB
```

### Check Built HTML
Open `docs/index.html` and verify asset paths:
- ✅ `<script src="/assets/index-*.js"></script>` (root path)
- ✅ `<link href="/assets/index-*.css">` (root path)

**NOT:**
- ❌ `<script src="/1viz3r0/assets/...">` (subdirectory)

---

## Deployment Checklist

- [ ] CNAME file exists in `docs/`
- [ ] `index.html` in `docs/` folder
- [ ] `assets/` folder in `docs/` with CSS/JS
- [ ] `.nojekyll` file in `docs/`
- [ ] GitHub Pages Settings:
  - Source: "Deploy from a branch"
  - Branch: `main`
  - Folder: `/docs`
- [ ] DNS points custom domain to GitHub Pages
- [ ] Wait 1-5 minutes for DNS propagation

---

## If Site Still Blank

### Option 1: Check Vite Config
Verify `client/vite.config.ts`:
```typescript
base: process.env.VITE_BASE_PATH || "/"
```
✅ Should default to `/` (root)

### Option 2: Force Rebuild
```powershell
npm run build:gh-pages
git add docs/
git commit -m "Force rebuild"
git push origin main
```

### Option 3: Disable Auth Explicitly
Ensure build was run with:
```powershell
$env:VITE_DISABLE_AUTH = 'true'
npm run build:gh-pages
```

### Option 4: Check for 404 errors
In GitHub Pages settings, check:
- Pages is enabled
- Source is `/docs` folder
- Build status is green

---

## Current Setup Summary

| Property | Value |
|----------|-------|
| **GitHub Pages** | https://1viz3r0.github.io/1viz3r0/ |
| **Custom Domain** | https://hawkursociety.xyz/ |
| **Base Path** | `/` (root) |
| **Auth Status** | Disabled (`VITE_DISABLE_AUTH=true`) |
| **Build Output** | `docs/` folder |
| **Dev Server** | http://localhost:8080/ |
| **CNAME** | `docs/CNAME` configured |

---

**Next Steps:**
1. Open http://localhost:8080/ to verify local version
2. Check browser console for any errors (F12)
3. If local works, issue is with GitHub Pages DNS/settings
4. If local blank too, issue is with React build

Need help? Check the console errors and let me know what you see!
