# Fix: Website Google OAuth "Error 401: invalid_client" and "no registered origin"

## 🔴 The Error

When clicking "Sign in with Google" on the website, you're seeing:
- **"Access blocked: Authorization Error"**
- **"no registered origin"**
- **"Error 401: invalid_client"**

This means the OAuth client is not properly configured for web applications.

## ⚠️ Important: Website vs Extension OAuth

The **website** and **extension** use different Google OAuth flows:
- **Website**: Uses Google Identity Services (ID tokens) - requires **Authorized JavaScript origins**
- **Extension**: Uses authorization code flow - requires **Authorized redirect URIs**

You can use the **same OAuth client** for both, but you need to configure **both** settings.

## ✅ Solution Steps

### Step 1: Go to Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID: `161373365833-qvlbdug18eksvfimqef4p2d5spp88g67.apps.googleusercontent.com`
5. **Click on it** to open the details

### Step 2: Configure Authorized JavaScript Origins

**CRITICAL for Website:** The website needs JavaScript origins, not just redirect URIs.

1. In the OAuth client details, scroll to **"Authorized JavaScript origins"**
2. Click **"+ ADD URI"**
3. Add these origins (one at a time):
   - `http://localhost:5173` (for local development)
   - `http://localhost:3000` (if using port 3000)
   - `https://yourdomain.com` (for production - replace with your actual domain)
4. Click **SAVE** after adding each one

### Step 3: Verify Authorized Redirect URIs (for Extension)

Make sure these are also configured (for the extension):
- `https://imihkpoglmmcdipfpneofiecliaaalaj.chromiumapp.org/`

### Step 4: Check OAuth Client Type

1. Make sure the OAuth client is set as **"Web application"** (NOT "Chrome app")
2. If it's set as "Chrome app", you need to create a new "Web application" client

### Step 5: Verify Environment Variable

Make sure your `client/.env` file has the correct Client ID:

```env
VITE_GOOGLE_CLIENT_ID=161373365833-qvlbdug18eksvfimqef4p2d5spp88g67.apps.googleusercontent.com
VITE_API_BASE_URL=http://localhost:5000/api
```

### Step 6: Restart Your Dev Server

After updating the `.env` file or Google Cloud Console:

1. **Stop** your client dev server (Ctrl+C)
2. **Restart** it:
   ```bash
   cd client
   npm run dev
   ```

### Step 7: Clear Browser Cache

1. Open your browser's Developer Tools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"
4. Or clear browser cache manually

### Step 8: Test Again

1. Go to `http://localhost:5173/login`
2. Click "Sign in with Google"
3. Check the browser console (F12) for any errors

## 🔍 Troubleshooting

### If you still get "invalid_client":

1. **Check the exact Client ID:**
   - Make sure it matches: `161373365833-qvlbdug18eksvfimqef4p2d5spp88g67.apps.googleusercontent.com`
   - No extra spaces or characters
   - Check in browser console: `console.log(import.meta.env.VITE_GOOGLE_CLIENT_ID)`

2. **Verify JavaScript origins:**
   - Must match **exactly** (including `http://` vs `https://`)
   - No trailing slashes for origins (e.g., `http://localhost:5173` not `http://localhost:5173/`)
   - Port number must match your dev server port

3. **Check OAuth consent screen:**
   - Go to **APIs & Services** → **OAuth consent screen**
   - Make sure it's configured and published (or in testing mode with your email added)

4. **Verify the OAuth client is enabled:**
   - In the OAuth client details, make sure status is "Enabled"

### If you need separate OAuth clients:

If you want separate clients for website and extension:

1. **Create a new OAuth client** for the website:
   - Type: "Web application"
   - Name: "ONE-Go Security Website"
   - Authorized JavaScript origins: `http://localhost:5173`, `https://yourdomain.com`
   - **No redirect URIs needed** (website uses ID tokens, not redirects)

2. **Keep the existing client** for the extension:
   - Authorized redirect URIs: `https://imihkpoglmmcdipfpneofiecliaaalaj.chromiumapp.org/`
   - Authorized JavaScript origins: `chrome-extension://imihkpoglmmcdipfpneofiecliaaalaj`

3. **Update environment variables:**
   - `client/.env`: Use the website client ID
   - `server/.env`: Use the extension client ID for `GOOGLE_EXTENSION_CLIENT_ID`

## 📝 Quick Checklist

- [ ] OAuth client type is "Web application"
- [ ] Authorized JavaScript origin: `http://localhost:5173` (or your dev server port)
- [ ] Authorized redirect URI: `https://imihkpoglmmcdipfpneofiecliaaalaj.chromiumapp.org/` (for extension)
- [ ] OAuth consent screen is configured
- [ ] Client ID matches in `client/.env`
- [ ] Dev server restarted after `.env` changes
- [ ] Browser cache cleared

## 🆘 Still Having Issues?

1. **Check browser console (F12)** for detailed error messages
2. **Check server console** for backend errors
3. **Verify the Client ID** is being loaded:
   - Open browser console
   - Type: `import.meta.env.VITE_GOOGLE_CLIENT_ID`
   - Should show your Client ID

4. **Test with a different browser** to rule out browser-specific issues

5. **Check Google Cloud Console activity logs:**
   - Go to **APIs & Services** → **Credentials** → Your OAuth client
   - Check for any error logs or blocked requests

