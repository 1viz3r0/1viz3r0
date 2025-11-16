# Building and Loading the Browser Extension

## Build the Extension

1. Build the main extension files:
```bash
npm run build
```

2. Build the content script separately:
```bash
npx vite build --config vite.config.extension.ts
```

3. Copy necessary files to dist:
```bash
cp public/manifest.json dist/
cp public/background.js dist/
cp public/favicon.ico dist/
```

4. The extension files will be ready in the `dist` folder.

## Load in Chrome/Edge

1. Open Chrome/Edge and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `dist` folder from your project

## Load in Firefox

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Navigate to the `dist` folder and select `manifest.json`

## Testing the Extension

1. Click the extension icon in your browser toolbar
2. You'll see the login screen first
3. Register a new account or login with existing credentials
4. After login, you'll have access to:
   - **Protection Tab**: Page Scan, Scan Status, Ad Blocker, Download Scan
   - **Privacy Tab**: Password Checker, Clean Data
   - **Tools Tab**: Dashboard, Activity, Network Check, Settings

## Development Mode

For development, you can run:
```bash
npm run dev
```

Then open `http://localhost:8080/extension-popup.html` in your browser to test the popup UI.

## Shared Authentication (Phase 4)

The extension now supports **seamless authentication sync** between the extension and web app:

- **Login in extension** → Automatically logged in on web app
- **Login on web app** → Automatically logged in extension  
- **Logout from either** → Logs out from both
- Authentication state is synchronized in real-time using content scripts

### How It Works

1. **Content Script** (`content.ts`) - Bridges communication between extension and web pages
2. **Auth Sync** (`authSync.ts`) - Manages sync logic between extension and web storage
3. **Background Worker** - Listens for auth changes and keeps state synchronized

## Activity Logging & Export

The Dashboard includes full activity logging with:
- Filter by type (Pages, Downloads, Network, Passwords)
- Export logs to CSV for specific categories
- Real-time updates from backend API
- Threat level visualization with badges

## Notes

- The extension uses chrome.storage for secure token storage
- All API calls use the backend defined in VITE_API_BASE_URL
- Content script enables auth sharing across extension and web app
- Background worker handles download scanning and auth sync
- Activity logs sync between extension and web dashboard
