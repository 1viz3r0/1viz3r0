const axios = require('axios');
const { URL } = require('url');

// VirusTotal API configuration
const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY;
const VIRUSTOTAL_API_URL = process.env.VIRUSTOTAL_API_URL || 'https://www.virustotal.com/vtapi/v2';

// Cache for URL reputation checks
const urlCache = new Map();
const CACHE_TTL = 3600000; // 1 hour cache

// Known malicious domains (can be expanded)
const KNOWN_MALICIOUS_DOMAINS = new Set([
  // Add known malicious domains here
  // Example: 'malicious-domain.com'
]);

// Suspicious URL patterns (only truly dangerous file types)
// Common file types like .zip, .rar, .mp3, .pdf are NOT suspicious by default
const SUSPICIOUS_PATTERNS = [
  /\.scr$/i,           // Screen saver files (often used for malware)
  /\.pif$/i,           // Program Information Files (often malware)
  /\.vbs$/i,           // VBScript files (can be malicious)
  /\.js$/i,            // JavaScript files (only suspicious if not from trusted source)
  /\.jar$/i,           // Java archive files (can contain malware, but also legitimate)
];

// High-risk executable patterns (always suspicious)
const HIGH_RISK_PATTERNS = [
  /\.exe$/i,           // Windows executables
  /\.bat$/i,           // Batch files
  /\.cmd$/i,           // Command files
  /\.com$/i,           // COM files
  /\.msi$/i,           // Windows installer
  /\.dll$/i,           // Dynamic link libraries
];

// Suspicious domain patterns
const SUSPICIOUS_DOMAIN_PATTERNS = [
  /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/,  // IP addresses (can be suspicious)
  /\.tk$/,                             // .tk domains (often used for malware)
  /\.ml$/,                             // .ml domains
  /\.ga$/,                             // .ga domains
  /\.cf$/,                             // .cf domains
  /bit\.ly/,                           // URL shorteners (can hide malicious URLs)
  /tinyurl\.com/,
  /t\.co/,
];

/**
 * Extract domain from URL
 * @param {string} urlString - URL to extract domain from
 * @returns {string|null} Domain or null if invalid URL
 */
function extractDomain(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname;
  } catch (error) {
    console.error(`❌ Invalid URL: ${urlString}`, error.message);
    return null;
  }
}

/**
 * Check if domain is in known malicious list
 * @param {string} domain - Domain to check
 * @returns {boolean} True if domain is known malicious
 */
function isKnownMaliciousDomain(domain) {
  if (!domain) return false;
  
  const domainLower = domain.toLowerCase();
  
  // Check exact match
  if (KNOWN_MALICIOUS_DOMAINS.has(domainLower)) {
    return true;
  }
  
  // Check subdomain matches
  for (const maliciousDomain of KNOWN_MALICIOUS_DOMAINS) {
    if (domainLower.endsWith('.' + maliciousDomain)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if URL matches suspicious patterns
 * @param {string} urlString - URL to check
 * @returns {Object} Suspicious pattern check result
 */
function checkSuspiciousPatterns(urlString) {
  const url = new URL(urlString);
  const pathname = url.pathname.toLowerCase();
  const domain = url.hostname.toLowerCase();
  
  const suspiciousReasons = [];
  let hasHighRisk = false;
  
  // Check high-risk executable patterns first (always suspicious)
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(pathname)) {
      suspiciousReasons.push(`High-risk executable: ${pathname.match(pattern)[0]}`);
      hasHighRisk = true;
    }
  }
  
  // Check suspicious patterns (less severe)
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(pathname)) {
      suspiciousReasons.push(`Suspicious file extension: ${pathname.match(pattern)[0]}`);
    }
  }
  
  // Check domain patterns (only if not a known good domain)
  const isKnownGoodDomain = domain.includes('google.com') || 
                           domain.includes('microsoft.com') || 
                           domain.includes('github.com') ||
                           domain.includes('sourceforge.net') ||
                           domain.includes('npmjs.com');
  
  if (!isKnownGoodDomain) {
    for (const pattern of SUSPICIOUS_DOMAIN_PATTERNS) {
      if (pattern.test(domain)) {
        suspiciousReasons.push(`Suspicious domain pattern: ${domain}`);
      }
    }
  }
  
  // Only mark as suspicious if we have high-risk patterns or multiple suspicious indicators
  // Common file types like .zip, .mp3, .pdf are NOT suspicious
  const isSuspicious = suspiciousReasons.length > 0;
  const severity = hasHighRisk ? 'high' : (suspiciousReasons.length > 2 ? 'medium' : 'low');
  
  return {
    isSuspicious: isSuspicious,
    reasons: suspiciousReasons,
    severity: severity
  };
}

/**
 * Check URL reputation using VirusTotal API
 * @param {string} urlString - URL to check
 * @returns {Promise<Object>} URL reputation check result
 */
async function checkURLWithVirusTotal(urlString) {
  // Check cache first
  const cached = urlCache.get(urlString);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`📋 URL reputation check result from cache: ${urlString.substring(0, 50)}...`);
    return cached.result;
  }

  // If no API key, skip URL checking
  if (!VIRUSTOTAL_API_KEY) {
    console.log('ℹ️ VirusTotal API key not configured, skipping URL reputation check');
    return {
      checked: false,
      isMalicious: false,
      threats: null,
      message: 'URL reputation check not available (no API key)'
    };
  }

  try {
    console.log(`🔍 Checking URL reputation with VirusTotal: ${urlString.substring(0, 50)}...`);
    
    // VirusTotal URL report endpoint (faster - checks existing reports first)
    // Use URL directly as resource parameter
    const reportResponse = await axios.get(`${VIRUSTOTAL_API_URL}/url/report`, {
      params: {
        apikey: VIRUSTOTAL_API_KEY,
        resource: urlString // Use URL directly
      },
      timeout: 8000, // 8 second timeout (target: <800ms)
      headers: {
        'User-Agent': 'One-Go-Security/1.0'
      }
    });

    const data = reportResponse.data;

    // VirusTotal response_code: 1 = found, 0 = not found, -2 = queued
    if (data.response_code === 1) {
      // URL found in database
      const positives = data.positives || 0;
      const total = data.total || 0;
      const isMalicious = positives > 0;

      if (isMalicious) {
        // Extract threat names
        const threats = [];
        if (data.scans) {
          Object.keys(data.scans).forEach(engine => {
            const scan = data.scans[engine];
            if (scan.detected && scan.result) {
              threats.push(`${engine}: ${scan.result}`);
            }
          });
        }

        console.log(`🚫 URL is malicious: ${positives}/${total} engines detected threats`);
        console.log(`   Threats: ${threats.slice(0, 3).join(', ')}${threats.length > 3 ? '...' : ''}`);

        const result = {
          checked: true,
          isMalicious: true,
          threats: threats.length > 0 ? threats : ['Unknown threat'],
          positives: positives,
          total: total,
          message: `URL is malicious (${positives}/${total} engines detected)`
        };

        // Cache the result
        urlCache.set(urlString, {
          result: result,
          timestamp: Date.now()
        });

        return result;
      } else {
        // URL is clean
        console.log(`✅ URL is clean according to VirusTotal (0/${total} engines detected)`);

        const result = {
          checked: true,
          isMalicious: false,
          threats: null,
          positives: 0,
          total: total,
          message: 'URL is clean (verified by VirusTotal)'
        };

        // Cache the result
        urlCache.set(urlString, {
          result: result,
          timestamp: Date.now()
        });

        return result;
      }
    } else if (data.response_code === -2) {
      // Scan in progress
      console.log(`ℹ️ URL scan in progress, proceeding with download`);
      return {
        checked: true,
        isMalicious: false,
        threats: null,
        message: 'URL scan in progress (proceeding with download)'
      };
    } else {
      // URL not in database
      console.log(`ℹ️ URL not found in VirusTotal database`);
      return {
        checked: true,
        isMalicious: false,
        threats: null,
        message: 'URL not in database (unknown URL)'
      };
    }
  } catch (error) {
    console.error(`❌ Error checking URL with VirusTotal:`, error.message);
    
    // Don't block on API errors - allow download to proceed
    return {
      checked: false,
      isMalicious: false,
      threats: null,
      message: `URL reputation check failed: ${error.message}`
    };
  }
}

/**
 * Check URL reputation before downloading
 * @param {string} urlString - URL to check
 * @returns {Promise<Object>} URL reputation check result
 */
async function checkURLReputation(urlString) {
  try {
    // Extract domain
    const domain = extractDomain(urlString);
    
    if (!domain) {
      return {
        checked: false,
        isMalicious: false,
        threats: null,
        message: 'Invalid URL format'
      };
    }

    // Check known malicious domains first (fastest check)
    if (isKnownMaliciousDomain(domain)) {
      console.log(`🚫 Domain is in known malicious list: ${domain}`);
      return {
        checked: true,
        isMalicious: true,
        threats: ['Known malicious domain'],
        message: `Domain ${domain} is in known malicious list`
      };
    }

    // Check suspicious patterns (but don't block - just warn)
    // Only high-risk executables are marked as suspicious
    const patternCheck = checkSuspiciousPatterns(urlString);
    if (patternCheck.isSuspicious && patternCheck.severity === 'high') {
      console.log(`⚠️ URL matches high-risk patterns: ${patternCheck.reasons.join(', ')}`);
      // Don't return early - continue to VirusTotal check for actual threat detection
      // We'll log this but not block based on patterns alone
    }

    // Check with VirusTotal API (if configured)
    if (VIRUSTOTAL_API_KEY) {
      return await checkURLWithVirusTotal(urlString);
    }

    // If no API key, return pattern check result
    return {
      checked: true,
      isMalicious: false,
      isSuspicious: patternCheck.isSuspicious,
      threats: null,
      suspiciousReasons: patternCheck.reasons,
      message: patternCheck.isSuspicious 
        ? `URL matches suspicious patterns: ${patternCheck.reasons.join(', ')}`
        : 'URL appears safe (no API key for deep scan)'
    };
  } catch (error) {
    console.error(`❌ Error in URL reputation check:`, error.message);
    return {
      checked: false,
      isMalicious: false,
      threats: null,
      message: `URL reputation check error: ${error.message}`
    };
  }
}

module.exports = {
  checkURLReputation,
  extractDomain,
  isKnownMaliciousDomain,
  checkSuspiciousPatterns
};

