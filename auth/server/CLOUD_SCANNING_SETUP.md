# Cloud-Based File Scanning Setup

## Overview

The file scanning system uses **cloud APIs** for fast, reliable malware detection:
- **VirusTotal API**: URL reputation checking (<800ms)
- **MetaDefender Cloud API**: Multi-engine file scanning (<1.5s average)

## Benefits

✅ **No local setup required** - Works out of the box  
✅ **Fast scanning** - Results in ~1-2 seconds  
✅ **Multi-engine detection** - 30+ antivirus engines  
✅ **Cross-browser compatible** - No platform-specific dependencies  
✅ **Lightweight** - No daemons or local services  
✅ **Reliable** - Cloud infrastructure with high availability  

## Configuration

### 1. Get API Keys

#### VirusTotal API Key
1. Sign up at: https://www.virustotal.com/gui/join-us
2. Get API key from: https://www.virustotal.com/gui/user/<username>/apikey
3. Free tier: 4 requests/minute
4. Public API: 4 requests/minute (shared with other users)
5. Private API: Higher limits (paid plans)

#### MetaDefender API Key
1. Sign up at: https://www.metadefender.com/
2. Get API key from your account dashboard
3. Free tier: Limited requests/day
4. Paid plans: Higher limits and priority scanning

### 2. Environment Variables

Add to your `.env` file:

```env
# VirusTotal API Configuration (for URL reputation)
VIRUSTOTAL_API_KEY=your_virustotal_api_key_here
VIRUSTOTAL_API_URL=https://www.virustotal.com/vtapi/v2

# MetaDefender Cloud API Configuration (for file scanning)
METADEFENDER_API_KEY=your_metadefender_api_key_here
METADEFENDER_API_URL=https://api.metadefender.com/v4
```

### 3. Install Dependencies

```bash
npm install
```

The `form-data` package is required for MetaDefender file uploads.

## How It Works

### Scanning Flow

```
1. User initiates download
   ↓
2. Extension intercepts download
   ↓
3. Server receives scan request
   ↓
4. Step 1: VirusTotal URL reputation check (<800ms)
   ├─ If malicious → Block immediately (NO download!)
   └─ If clean/unknown → Continue
   ↓
5. Step 2: MetaDefender Cloud scan (<1.5s)
   ├─ Upload file to MetaDefender
   ├─ Poll for scan results
   └─ Return verdict
   ↓
6. Step 3: Show result to user
   ├─ No Threat → Allow download
   ├─ Threat Found → Block download
   └─ Unknown → Log and allow (future: sandbox scan)
```

### Performance

- **VirusTotal URL check**: <800ms average
- **MetaDefender scan**: <1.5s average (for files <10MB)
- **Total latency**: <2 seconds (meets performance targets)

### Caching

- **Scan results cached by file hash** (1 hour TTL)
- **URL reputation cached** (1 hour TTL)
- **Avoids re-scanning identical files**

## API Rate Limits

### VirusTotal
- Free tier: 4 requests/minute
- Public API: 4 requests/minute (shared)
- Private API: Higher limits (paid)

### MetaDefender
- Free tier: Limited requests/day
- Paid plans: Higher limits

**Note:** Caching helps stay within rate limits by avoiding duplicate scans.

## Testing

### Test URL Reputation

```bash
curl -X POST http://localhost:5000/api/scan/download \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "fileUrl": "https://example.com/file.exe",
    "fileName": "file.exe"
  }'
```

### Test File Scanning

Use the extension to download a file - it will automatically scan it.

## Troubleshooting

### API Key Not Configured

**Error:** `MetaDefender API key not configured`

**Solution:** Add `METADEFENDER_API_KEY` to `.env` file

### Rate Limit Exceeded

**Error:** `Rate limit exceeded`

**Solution:** 
- Wait for rate limit to reset
- Upgrade to paid API plan
- Check cache - duplicate scans are cached

### Scan Timeout

**Error:** `MetaDefender scan timeout`

**Solution:**
- File might be too large (>100MB)
- Network issues
- MetaDefender API might be slow
- Check MetaDefender status page

## Migration from ClamAV

### What Changed

1. ✅ Removed ClamAV daemon dependency
2. ✅ Removed local file scanning
3. ✅ Added VirusTotal URL reputation
4. ✅ Added MetaDefender Cloud scanning
5. ✅ Removed disk-based scanning
6. ✅ Added cloud API caching

### What Stayed the Same

1. ✅ Extension UI/UX (identical)
2. ✅ Download interception (same)
3. ✅ Activity logs (same format)
4. ✅ User notifications (same)
5. ✅ MongoDB logging (same schema)

## Future Improvements

1. **Hybrid Analysis Integration**: Deep sandboxing for unknown files
2. **Hash-based Caching**: Cache scan results in database
3. **Parallel Scanning**: Scan with multiple engines simultaneously
4. **Real-time Updates**: WebSocket for scan progress
5. **Threat Intelligence**: Integrate with threat feeds

## Support

For issues or questions:
- Check API status: https://status.metadefender.com/
- VirusTotal status: https://www.virustotal.com/gui/status
- Review logs: Check server console for detailed error messages

