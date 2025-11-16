# Google OAuth Setup for Chrome Extension

## Error: redirect_uri_mismatch

This error occurs because you need to set up Google OAuth credentials for your Chrome extension.

## Complete Setup Guide

### Step 1: Configure OAuth Consent Screen

**This must be done first!**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **OAuth consent screen**
4. Choose **External** (unless you have a Google Workspace account)
5. Click **CREATE**
6. Fill in the required information:
   - **App name**: `ONE-Go Security` (or your preferred name)
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
7. Click **SAVE AND CONTINUE**
8. On the **Scopes** page, click **SAVE AND CONTINUE** (no scopes needed for basic setup)
9. On the **Test users** page (if in testing mode), add your email, then click **SAVE AND CONTINUE**
10. Review and click **BACK TO DASHBOARD**

### Step 2: Get Your Extension's Redirect URI

**⚠️ Important: Extension ID Stability**

**Good News:** Your Extension ID (`imihkpoglmmcdipfpneofiecliaaalaj`) will **NOT change** when you:
- ✅ Rebuild the extension
- ✅ Reload the extension (click reload button)
- ✅ Update your code
- ✅ Restart Chrome

**It WILL change if you:**
- ❌ Remove the extension completely
- ❌ Remove and reload from a different folder

**For Development:**
- Keep your extension loaded in Chrome
- Use the reload button instead of removing/re-adding
- Your redirect URI will stay the same: `https://imihkpoglmmcdipfpneofiecliaaalaj.chromiumapp.org/`

**For Production:**
- Package your extension to get a permanent ID
- Use Chrome's "Pack extension" feature

**Get Your Extension ID:**
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Find your "ONE-Go Security" extension
4. Copy the **Extension ID** (it's a long string like `abcdefghijklmnopqrstuvwxyz123456`)
5. Your redirect URI will be: `https://<your-extension-id>.chromiumapp.org/`
   - Example: `https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/`

**From Error Message:**
- When the error occurs, check the toast notification or browser console
- The redirect URI will be displayed there automatically

### Step 3: Create OAuth 2.0 Client ID

**Important:** Use **"Web application"** type (not "Chrome app" - it's deprecated)

1. In Google Cloud Console, navigate to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** at the top
3. Select **OAuth client ID**
4. Select **Application type**: **Web application**
5. Fill in the details:
   - **Name**: `ONE-Go Security Extension` (or your preferred name)
   - **Authorized redirect URIs**: Click **+ ADD URI**
   - Paste your redirect URI: `https://<your-extension-id>.chromiumapp.org/`
     - **Important**: Include the trailing slash `/`
     - Example: `https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/`
6. Click **CREATE**

### Step 4: Copy Your Client ID

After creating the OAuth client:
1. A popup will show your **Client ID** and **Client Secret**
2. **Copy the Client ID** (you'll need this)
3. Copy the Client Secret if you need it for backend (optional)

### Step 5: Verify Redirect URI

If you need to add more redirect URIs later:
1. Click on the OAuth client you created
2. Under **Authorized redirect URIs**, you can add more URIs if needed
3. Click **SAVE**

### Step 6: Configure Your Extension

1. In your project, create or update `.env` file in the `client` folder:
   ```env
   VITE_GOOGLE_CLIENT_ID=your-client-id-here
   ```
2. Replace `your-client-id-here` with the Client ID you copied in Step 4
3. Save the file
4. Restart your development server

### Step 7: Test

1. Wait 1-2 minutes for Google's servers to update
2. Try signing in with Google in the extension
3. The error should be resolved!

## Troubleshooting

### Still seeing the error?
- **Wait longer**: Google's changes can take a few minutes to propagate
- **Check the URI**: Make sure it matches exactly (including trailing slash)
- **Check the Client ID**: Make sure your `.env` file has the correct Client ID
- **Check OAuth Consent Screen**: Make sure you completed Step 1
- **Clear cache**: Try restarting Chrome or clearing browser cache
- **Check environment variable**: Make sure `VITE_GOOGLE_CLIENT_ID` is set correctly

### Can't find your Extension ID?
1. Open `chrome://extensions/`
2. Enable Developer mode (toggle in top-right)
3. Your extension ID is shown under the extension name

### Extension ID Changed?

**Rebuilding won't change it!** Your Extension ID only changes if you:
- Remove the extension completely
- Remove and reload from a different folder

**If your Extension ID did change:**
1. Get your new Extension ID from `chrome://extensions/`
2. Calculate new redirect URI: `https://<new-extension-id>.chromiumapp.org/`
3. Go back to Google Cloud Console → Credentials
4. Edit your OAuth client
5. Add the new redirect URI (you can keep the old one too)
6. Save and wait 1-2 minutes

**Pro Tip:** You can add multiple redirect URIs to the same OAuth client. This is useful if:
- You have multiple test extensions
- Your Extension ID changed during development
- You want to support both development and production IDs

### Multiple OAuth Clients?
If you have multiple OAuth clients, make sure you're using the one that matches your `VITE_GOOGLE_CLIENT_ID` environment variable.

### OAuth Consent Screen Issues?
- Make sure you've completed the OAuth consent screen setup (Step 1)
- If in testing mode, add your email as a test user
- For production, you'll need to submit for verification

## Quick Reference

**OAuth Client Type:**
- ✅ Use **"Web application"** (recommended)
- ❌ Don't use "Chrome app" (deprecated)

**Redirect URI Format:**
```
https://<your-extension-id>.chromiumapp.org/
```

**Where to find Extension ID:**
- `chrome://extensions/` → Enable Developer mode → Look under extension name

**Extension ID Stability:**
- ✅ **Stable**: Keep extension loaded, don't remove it
- ✅ **Stable**: Packaged extension (.crx)
- ✅ **Stable**: Published to Chrome Web Store
- ⚠️ **Changes**: Removing and reloading unpacked extension

**Environment Variable:**
```env
VITE_GOOGLE_CLIENT_ID=your-client-id-here
```

**Pro Tip:** You can add multiple redirect URIs to the same OAuth client if you have multiple test extensions or if your Extension ID changes during development.

## Alternative: Use Web App Login (Temporary Workaround)

If you can't set up OAuth right now, you can use the web app's Google sign-in instead. The extension will detect this and sync your authentication.

