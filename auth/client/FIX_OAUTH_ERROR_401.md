# Fix: Google OAuth "Error 401: invalid_client" and "no registered origin"

## 🔴 The Error

You're seeing:
- **"Access blocked: Authorization Error"**
- **"no registered origin"**
- **"Error 401: invalid_client"**

This means Google doesn't recognize your OAuth client or the request origin.

## ✅ Solution Steps

### Step 1: Verify Your OAuth Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID: `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`
5. **Click on it** to open the details

### Step 2: Check OAuth Client Type

**CRITICAL:** Make sure your OAuth client is set up as **"Web application"** (NOT "Chrome app" - that's deprecated).

1. In the OAuth client details page, check the **Application type**
2. If it says "Chrome app", you need to create a new "Web application" client
3. If it says "Web application", continue to Step 3

### Step 3: Configure Authorized JavaScript Origins

For Chrome extensions, you need to add the extension's origin:

1. In the OAuth client details, scroll to **"Authorized JavaScript origins"**
2. Click **"+ ADD URI"**
3. Add: `chrome-extension://imihkpoglmmcdipfpneofiecliaaalaj`
   - **Note:** Replace `imihkpoglmmcdipfpneofiecliaaalaj` with your actual extension ID if different
4. Click **SAVE**

### Step 4: Configure Authorized Redirect URIs

1. Scroll to **"Authorized redirect URIs"**
2. Make sure this URI is added:
   ```
   https://imihkpoglmmcdipfpneofiecliaaalaj.chromiumapp.org/
   ```
3. If it's not there, click **"+ ADD URI"** and add it
4. Click **SAVE**

### Step 5: Check OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Make sure:
   - **User Type** is set (Internal or External)
   - **App name** is set: "ONE-Go Security"
   - **Support email** is set
   - **Authorized domains** are configured (if required)
3. Click **SAVE**

### Step 6: Verify Environment Variables

Make sure your `.env` files are set correctly:

**`client/.env`:**
```env
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
```

**`server/.env`:**
```env
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_EXTENSION_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
GOOGLE_EXTENSION_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
```

### Step 7: Restart Everything

1. **Restart your client dev server:**
   ```bash
   cd client
   npm run dev
   ```

2. **Restart your server:**
   ```bash
   cd server
   npm start
   ```

3. **Reload the extension:**
   - Go to `chrome://extensions/`
   - Click the reload icon on your extension

### Step 8: Test Again

1. Open the extension
2. Click "Sign in with Google"
3. Check the browser console (F12) for any errors

## 🔍 Troubleshooting

### If you still get "invalid_client":

1. **Double-check the Client ID:**
   - Make sure it matches exactly: `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`
   - No extra spaces or characters

2. **Check if the OAuth client is enabled:**
   - In Google Cloud Console, make sure the OAuth client status is "Enabled"

3. **Verify the extension ID:**
   - Go to `chrome://extensions/`
   - Find your extension and copy its ID
   - Make sure it matches `imihkpoglmmcdipfpneofiecliaaalaj`
   - If different, update the redirect URI in Google Cloud Console

4. **Check OAuth consent screen status:**
   - If it's in "Testing" mode, only test users can sign in
   - Add your email to the test users list

### If you need to create a new OAuth client:

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Select **"Web application"** as the application type
4. Name it: "ONE-Go Security Extension"
5. Add the JavaScript origin and redirect URI as shown above
6. Copy the new Client ID and Secret
7. Update your `.env` files with the new credentials

## 📝 Quick Checklist

- [ ] OAuth client type is "Web application"
- [ ] Authorized JavaScript origin: `chrome-extension://imihkpoglmmcdipfpneofiecliaaalaj`
- [ ] Authorized redirect URI: `https://imihkpoglmmcdipfpneofiecliaaalaj.chromiumapp.org/`
- [ ] OAuth consent screen is configured
- [ ] Client ID matches in `.env` files
- [ ] Extension is reloaded
- [ ] Servers are restarted

## 🆘 Still Having Issues?

1. Check the browser console (F12) for detailed error messages
2. Check the server console for backend errors
3. Verify the extension ID hasn't changed (it can change if you reload from a different path)
4. Make sure you're using the correct Google account in the browser

