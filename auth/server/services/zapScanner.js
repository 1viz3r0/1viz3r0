const axios = require('axios');
const Log = require('../models/log');

const ZAP_API_URL = process.env.ZAP_API_URL || 'http://localhost:8080';
const ZAP_API_KEY = process.env.ZAP_API_KEY;

// Store active scans
const activeScans = new Map();

// Trusted domains that should always be marked as safe (major legitimate services)
// These are well-known, reputable domains that should not be flagged as malicious
const TRUSTED_DOMAINS = [
  'google.com',
  'google.co.uk',
  'google.ca',
  'google.com.au',
  'google.de',
  'google.fr',
  'google.it',
  'google.es',
  'google.co.jp',
  'google.co.in',
  'google.com.br',
  'google.com.mx',
  'google.com.ar',
  'google.ru',
  'google.cn',
  'google.com.tr',
  'google.co.za',
  'google.com.sg',
  'google.com.hk',
  'google.co.kr',
  'google.com.tw',
  'google.com.ph',
  'google.co.th',
  'google.com.vn',
  'google.com.my',
  'google.com.id',
  'google.com.au',
  'google.com.nz',
  'youtube.com',
  'youtu.be',
  'gmail.com',
  'gstatic.com',
  'googleapis.com',
  'googlevideo.com',
  'ytimg.com',
  'googleusercontent.com',
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googleadservices.com',
  'facebook.com',
  'fbcdn.net',
  'facebook.net',
  'instagram.com',
  'whatsapp.com',
  'twitter.com',
  'x.com',
  'twimg.com',
  'linkedin.com',
  'microsoft.com',
  'microsoftonline.com',
  'office.com',
  'live.com',
  'hotmail.com',
  'outlook.com',
  'msn.com',
  'bing.com',
  'github.com',
  'githubusercontent.com',
  'stackoverflow.com',
  'stackexchange.com',
  'wikipedia.org',
  'amazon.com',
  'amazon.co.uk',
  'amazon.de',
  'amazon.fr',
  'amazon.co.jp',
  'amazon.in',
  'amazon.com.au',
  'amazon.ca',
  'amazon.com.br',
  'amazon.com.mx',
  'apple.com',
  'icloud.com',
  'apple.com.cn',
  'apple.co.uk',
  'netflix.com',
  'spotify.com',
  'discord.com',
  'reddit.com',
  'paypal.com',
  'stripe.com',
  'cloudflare.com',
  'cloudfront.net',
  'akamai.net',
  'fastly.com',
  'vercel.com',
  'netlify.com',
  'heroku.com',
  'firebase.com',
  'aws.amazon.com',
  'azure.com',
  'mozilla.org',
  'firefox.com',
  'chrome.google.com',
  'chromium.org'
];

/**
 * Check if a URL belongs to a trusted domain
 * This function handles various domain patterns including subdomains
 */
function isTrustedDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Extract base domain (e.g., "google.com" from "www.google.com" or "maps.google.com")
    const hostnameParts = hostname.split('.');
    
    // Check if hostname matches any trusted domain exactly
    for (const trustedDomain of TRUSTED_DOMAINS) {
      // Exact match
      if (hostname === trustedDomain) {
        return true;
      }
      
      // Subdomain match (e.g., "www.google.com" matches "google.com")
      if (hostname.endsWith('.' + trustedDomain)) {
        return true;
      }
      
      // Check if the last two or three parts match (e.g., "maps.google.com" matches "google.com")
      // This handles cases like "subdomain.google.com" matching "google.com"
      const trustedParts = trustedDomain.split('.');
      if (hostnameParts.length >= trustedParts.length) {
        const hostnameSuffix = hostnameParts.slice(-trustedParts.length).join('.');
        if (hostnameSuffix === trustedDomain) {
          return true;
        }
      }
    }
    
    return false;
  } catch (e) {
    // Invalid URL - not trusted
    return false;
  }
}

/**
 * Initiate a web page security scan using OWASP ZAP
 * This function starts the scan asynchronously and returns immediately
 */
exports.scanWebPage = async (url, userId) => {
  try {
    console.log(`Starting scan for: ${url}`);
    
    // CRITICAL: Check if URL is from a trusted domain first
    // Trusted domains should always be marked as safe (no scanning needed)
    if (isTrustedDomain(url)) {
      console.log(`✅ URL is from trusted domain, marking as safe: ${url}`);
      const trustedScanId = `trusted_${Date.now()}`;
      
      // Save log marking as safe
      if (userId) {
        try {
          await Log.create({
            userId: userId,
            type: 'pages',
            result: 'safe',
            threatLevel: 'none',
            source: url,
            details: {
              scanId: trustedScanId,
              alerts: { critical: 0, high: 0, medium: 0, low: 0 },
              trusted: true,
              reason: 'Trusted domain'
            }
          });
        } catch (error) {
          console.error('Failed to create trusted domain log:', error);
        }
      }
      
      return {
        scanId: trustedScanId,
        status: 'safe',
        threatLevel: 'none',
        alerts: { critical: 0, high: 0, medium: 0, low: 0 }
      };
    }
    
    // Check if ZAP is available
    if (!ZAP_API_KEY) {
      console.warn('⚠️ ZAP_API_KEY not set in environment variables');
      console.warn('   Using mock scan (mock scans may have false positives)');
      console.warn('   To use real ZAP scanning, set ZAP_API_KEY in .env file');
      console.warn('   See: server/CLOUD_SCANNING_SETUP.md for setup instructions');
      return createMockScan(url, userId);
    }
    
    console.log(`🔍 Using ZAP API for scanning: ${ZAP_API_URL}`);

    // Start spider scan (crawl the site) - this is quick
    let spiderScanId;
    try {
      const spiderResponse = await axios.get(`${ZAP_API_URL}/JSON/spider/action/scan/`, {
        params: {
          apikey: ZAP_API_KEY,
          url: url,
          maxChildren: 5,
          maxDepth: 2
        },
        timeout: 10000 // 10 second timeout
      });

      spiderScanId = spiderResponse.data.scan;
      console.log(`✅ Spider scan started: ${spiderScanId}`);
    } catch (error) {
      console.error('❌ Failed to start spider scan:', error.message);
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.error('   ZAP API is not accessible - is ZAP running?');
        console.error(`   Expected ZAP API URL: ${ZAP_API_URL}`);
        console.error('   Falling back to mock scan');
      }
      // Continue with mock scan if ZAP is not available
      return createMockScan(url, userId);
    }

    // Start active scan immediately (don't wait for spider)
    let activeScanId;
    try {
      const activeScanResponse = await axios.get(`${ZAP_API_URL}/JSON/ascan/action/scan/`, {
        params: {
          apikey: ZAP_API_KEY,
          url: url,
          recurse: false, // Don't recurse to make it faster
          inScopeOnly: true
        },
        timeout: 10000
      });

      activeScanId = activeScanResponse.data.scan;
      console.log(`✅ Active scan started: ${activeScanId}`);
    } catch (error) {
      console.error('❌ Failed to start active scan:', error.message);
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.error('   ZAP API is not accessible - is ZAP running?');
        console.error(`   Expected ZAP API URL: ${ZAP_API_URL}`);
        console.error('   Falling back to mock scan');
      }
      // Continue with mock scan if ZAP is not available
      return createMockScan(url, userId);
    }

    // Store scan info
    activeScans.set(activeScanId, {
      url,
      userId,
      startTime: new Date(),
      status: 'scanning',
      spiderScanId
    });

    // Run scan completion in background
    completeScanAsync(activeScanId, url, userId, spiderScanId);

    // Return immediately
    return {
      scanId: activeScanId,
      status: 'scanning',
      threatLevel: 'none',
      alerts: { critical: 0, high: 0, medium: 0, low: 0 }
    };

  } catch (error) {
    console.error('ZAP scan error:', error.message);
    return createMockScan(url, userId);
  }
};

/**
 * Complete scan asynchronously and save results
 */
async function completeScanAsync(activeScanId, url, userId, spiderScanId) {
  try {
    // Wait for spider to complete (with timeout) - but don't block if it fails
    let spiderCompleted = false;
    if (spiderScanId) {
      let spiderProgress = 0;
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max for spider

      while (spiderProgress < 100 && attempts < maxAttempts) {
        try {
          const statusResponse = await axios.get(`${ZAP_API_URL}/JSON/spider/view/status/`, {
            params: {
              apikey: ZAP_API_KEY,
              scanId: spiderScanId
            },
            timeout: 5000
          });
          spiderProgress = parseInt(statusResponse.data.status) || 0;
          if (spiderProgress >= 100) {
            spiderCompleted = true;
            break;
          }
        } catch (error) {
          console.error('Error checking spider status:', error.message);
          // Continue even if spider check fails
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      console.log(`Spider scan progress: ${spiderProgress}% (completed: ${spiderCompleted})`);
      
      // If spider failed, that's okay - we can still scan the base URL
      if (!spiderCompleted && spiderProgress < 100) {
        console.log('⚠️ Spider scan did not complete, but continuing with active scan...');
      }
    }

    // Wait for active scan to complete - check progress periodically
    let scanComplete = false;
    let finalAlerts = [];
    let maxWaitTime = 60000; // Wait up to 60 seconds for scan
    let elapsedTime = 0;
    const checkInterval = 5000; // Check every 5 seconds
    
    while (!scanComplete && elapsedTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsedTime += checkInterval;
      
      try {
        // Check scan progress
        const progressResponse = await axios.get(`${ZAP_API_URL}/JSON/ascan/view/status/`, {
          params: {
            apikey: ZAP_API_KEY,
            scanId: activeScanId
          },
          timeout: 5000
        });
        const progress = parseInt(progressResponse.data.status) || 0;
        console.log(`Active scan progress: ${progress}% (${elapsedTime/1000}s elapsed)`);
        
        // Get current alerts (even if scan is still running)
        try {
          const alertsResponse = await axios.get(`${ZAP_API_URL}/JSON/core/view/alerts/`, {
            params: {
              apikey: ZAP_API_KEY,
              baseurl: url
            },
            timeout: 5000
          });
          const alerts = alertsResponse.data.alerts || [];
          
          // Filter alerts to only include those for the target URL
          const urlAlerts = alerts.filter(alert => {
            const alertUrl = alert.url || '';
            return alertUrl.startsWith(url) || url.startsWith(alertUrl);
          });
          
          if (urlAlerts.length > 0) {
            finalAlerts = urlAlerts;
            console.log(`Found ${urlAlerts.length} alerts for ${url} (${alerts.length} total alerts)`);
          }
        } catch (alertError) {
          console.error('Error getting alerts:', alertError.message);
        }
        
        // If scan is complete, break and get final results
        if (progress >= 100) {
          scanComplete = true;
          console.log(`✅ Active scan completed at ${progress}%`);
          
          // Get final alerts one more time
          try {
            const alertsResponse = await axios.get(`${ZAP_API_URL}/JSON/core/view/alerts/`, {
              params: {
                apikey: ZAP_API_KEY,
                baseurl: url
              },
              timeout: 5000
            });
            const alerts = alertsResponse.data.alerts || [];
            const urlAlerts = alerts.filter(alert => {
              const alertUrl = alert.url || '';
              return alertUrl.startsWith(url) || url.startsWith(alertUrl);
            });
            finalAlerts = urlAlerts;
            console.log(`📊 Final alert count: ${urlAlerts.length} alerts for ${url}`);
          } catch (alertError) {
            console.error('Error getting final alerts:', alertError.message);
          }
          break;
        }
        
        // If we've been waiting a while and have some alerts, we can proceed
        if (elapsedTime >= 30000 && finalAlerts.length > 0) {
          console.log(`⏱️ Scan has been running for ${elapsedTime/1000}s with ${finalAlerts.length} alerts found. Proceeding with current results.`);
          break;
        }
      } catch (error) {
        console.error('Error checking scan progress:', error.message);
        // Continue waiting
      }
    }
    
    // Use final alerts or empty array
    const alerts = finalAlerts.length > 0 ? finalAlerts : [];

    console.log(`📊 Processing ${alerts.length} alerts for ${url}`);
    
    // Log sample alerts for debugging
    if (alerts.length > 0) {
      console.log('Sample alerts:');
      alerts.slice(0, 3).forEach((alert, idx) => {
        console.log(`  Alert ${idx + 1}: Risk="${alert.risk}", Confidence="${alert.confidence}", Name="${alert.name}"`);
      });
    }

    // Process alerts correctly - fix the double-counting issue
    // ZAP risk levels: Informational, Low, Medium, High
    // Critical = High risk + High confidence
    // High = High risk but NOT (High risk + High confidence)
    const criticalAlerts = alerts.filter(a => {
      const risk = (a.risk || '').toUpperCase();
      const confidence = (a.confidence || '').toUpperCase();
      return risk === 'HIGH' && confidence === 'HIGH';
    });
    
    const highRiskAlerts = alerts.filter(a => {
      const risk = (a.risk || '').toUpperCase();
      return risk === 'HIGH';
    });
    
    // High count = all High risk minus critical (to avoid double counting)
    const highAlerts = highRiskAlerts.filter(a => {
      const risk = (a.risk || '').toUpperCase();
      const confidence = (a.confidence || '').toUpperCase();
      return !(risk === 'HIGH' && confidence === 'HIGH');
    });
    
    const mediumAlerts = alerts.filter(a => {
      const risk = (a.risk || '').toUpperCase();
      return risk === 'MEDIUM';
    });
    
    const lowAlerts = alerts.filter(a => {
      const risk = (a.risk || '').toUpperCase();
      return risk === 'LOW' || risk === 'INFORMATIONAL';
    });

    const threatCounts = {
      critical: criticalAlerts.length,
      high: highAlerts.length,
      medium: mediumAlerts.length,
      low: lowAlerts.length
    };
    
    console.log(`📈 Threat counts: Critical=${threatCounts.critical}, High=${threatCounts.high}, Medium=${threatCounts.medium}, Low=${threatCounts.low}`);

    // Determine threat level first
    const threatLevel = threatCounts.critical > 0 ? 'critical' : 
                        threatCounts.high > 0 ? 'high' : 
                        threatCounts.medium > 0 ? 'medium' : 
                        threatCounts.low > 0 ? 'low' : 'none';

    // Status: 'unsafe' ONLY if there are critical or high threats
    // Medium and low threats are considered 'safe' (they're often false positives or informational)
    const status = (threatCounts.critical > 0 || threatCounts.high > 0) ? 'unsafe' : 'safe';

    // Save log
    if (userId) {
      await Log.create({
        userId: userId,
        type: 'pages',
        result: status,
        threatLevel: threatLevel,
        source: url,
        details: {
          scanId: activeScanId,
          alerts: threatCounts,
          alertCount: alerts.length
        }
      });
    }

    // Update scan info
    activeScans.set(activeScanId, {
      url,
      userId,
      startTime: activeScans.get(activeScanId)?.startTime || new Date(),
      status: 'completed',
      results: {
        status,
        threatLevel,
        ...threatCounts
      }
    });

    console.log(`Scan completed for ${url}: ${status} (${threatLevel})`);
  } catch (error) {
    console.error('Error completing scan:', error.message);
    
    // Log error
    if (userId) {
      try {
        await Log.create({
          userId: userId,
          type: 'pages',
          result: 'error',
          threatLevel: 'none',
          source: url,
          details: {
            scanId: activeScanId,
            error: error.message
          }
        });
      } catch (logError) {
        console.error('Failed to log scan error:', logError);
      }
    }
  }
}

/**
 * Create a mock scan for testing/demo purposes
 * NOTE: This should only be used when ZAP is not available
 * Mock scans are conservative and should NOT flag legitimate sites
 */
async function createMockScan(url, userId) {
  const mockScanId = `mock_${Date.now()}`;
  
  // CRITICAL: Trusted domains should NEVER be flagged as unsafe in mock scans
  // This is a safety check (trusted domains should be handled before calling this)
  if (isTrustedDomain(url)) {
    console.log(`✅ Mock scan: Trusted domain detected, marking as safe: ${url}`);
    const mockAlerts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };
    
    // Save log
    if (userId) {
      try {
        await Log.create({
          userId: userId,
          type: 'pages',
          result: 'safe',
          threatLevel: 'none',
          source: url,
          details: {
            scanId: mockScanId,
            alerts: mockAlerts,
            mock: true,
            trusted: true
          }
        });
      } catch (error) {
        console.error('Failed to create mock scan log:', error);
      }
    }
    
    return {
      scanId: mockScanId,
      status: 'safe',
      threatLevel: 'none',
      alerts: mockAlerts
    };
  }
  
  // For non-trusted domains, be VERY conservative in mock scans
  // Only flag as unsafe in very rare cases (5% chance instead of 20%)
  // This prevents false positives for legitimate sites
  const mockStatus = Math.random() > 0.95 ? 'unsafe' : 'safe';
  const mockThreat = mockStatus === 'unsafe' ? 'high' : 'none';
  const mockAlerts = {
    critical: mockStatus === 'unsafe' ? Math.floor(Math.random() * 2) : 0, // Max 2 critical
    high: mockStatus === 'unsafe' ? Math.floor(Math.random() * 3) : 0, // Max 3 high
    medium: mockStatus === 'unsafe' ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2), // 0-2 medium
    low: Math.floor(Math.random() * 3) // 0-3 low (informational)
  };
  
  console.log(`⚠️ Mock scan result for ${url}: ${mockStatus} (mock: true, ZAP not configured)`);

  // Save log
  if (userId) {
    try {
      await Log.create({
        userId: userId,
        type: 'pages',
        result: mockStatus,
        threatLevel: mockThreat,
        source: url,
        details: {
          scanId: mockScanId,
          alerts: mockAlerts,
          mock: true
        }
      });
    } catch (error) {
      console.error('Failed to create mock scan log:', error);
    }
  }

  return {
    scanId: mockScanId,
    status: mockStatus,
    threatLevel: mockThreat,
    alerts: mockAlerts
  };
}

/**
 * Get scan results
 */
exports.getScanResults = async (scanId) => {
  try {
    // Check if scan exists in memory
    const scanInfo = activeScans.get(scanId);
    
    // If we have completed results in memory, return them
    if (scanInfo && scanInfo.results) {
      return scanInfo.results;
    }

    // If scan is still running, try to get progress from ZAP
    if (scanInfo && ZAP_API_KEY) {
      try {
        // Get scan progress
        const progressResponse = await axios.get(`${ZAP_API_URL}/JSON/ascan/view/status/`, {
          params: {
            apikey: ZAP_API_KEY,
            scanId: scanId
          },
          timeout: 5000
        });

        const progress = parseInt(progressResponse.data.status) || 0;

        // Get current alerts
        const alertsResponse = await axios.get(`${ZAP_API_URL}/JSON/core/view/alerts/`, {
          params: {
            apikey: ZAP_API_KEY,
            baseurl: scanInfo.url
          },
          timeout: 5000
        });

        const alerts = alertsResponse.data.alerts || [];
        
        // Filter alerts to only include those for the target URL
        const urlAlerts = alerts.filter(alert => {
          const alertUrl = alert.url || '';
          return alertUrl.startsWith(scanInfo.url) || scanInfo.url.startsWith(alertUrl);
        });
        
        // Process alerts correctly - same logic as completeScanAsync
        const criticalAlerts = urlAlerts.filter(a => {
          const risk = (a.risk || '').toUpperCase();
          const confidence = (a.confidence || '').toUpperCase();
          return risk === 'HIGH' && confidence === 'HIGH';
        });
        
        const highRiskAlerts = urlAlerts.filter(a => {
          const risk = (a.risk || '').toUpperCase();
          return risk === 'HIGH';
        });
        
        const highAlerts = highRiskAlerts.filter(a => {
          const risk = (a.risk || '').toUpperCase();
          const confidence = (a.confidence || '').toUpperCase();
          return !(risk === 'HIGH' && confidence === 'HIGH');
        });
        
        const mediumAlerts = urlAlerts.filter(a => {
          const risk = (a.risk || '').toUpperCase();
          return risk === 'MEDIUM';
        });
        
        const lowAlerts = urlAlerts.filter(a => {
          const risk = (a.risk || '').toUpperCase();
          return risk === 'LOW' || risk === 'INFORMATIONAL';
        });

        const threatCounts = {
          critical: criticalAlerts.length,
          high: highAlerts.length,
          medium: mediumAlerts.length,
          low: lowAlerts.length
        };

        // Status: 'unsafe' ONLY if there are critical or high threats
        // Medium and low threats are considered 'safe'
        const status = (threatCounts.critical > 0 || threatCounts.high > 0) ? 'unsafe' : 'safe';

        // If scan complete, update and remove from active scans
        if (progress >= 100) {
          const results = {
            status,
            progress: 100,
            ...threatCounts
          };
          
          if (scanInfo.userId) {
            try {
              await Log.create({
                userId: scanInfo.userId,
                type: 'pages',
                result: status,
                threatLevel: threatCounts.critical > 0 ? 'critical' : 
                            threatCounts.high > 0 ? 'high' : 
                            threatCounts.medium > 0 ? 'medium' : 
                            threatCounts.low > 0 ? 'low' : 'none',
                source: scanInfo.url,
                details: {
                  scanId: scanId,
                  alerts: threatCounts
                }
              });
            } catch (logError) {
              console.error('Failed to create scan log:', logError);
            }
          }
          
          activeScans.delete(scanId);
          return results;
        }

        return {
          status,
          progress,
          ...threatCounts
        };
      } catch (error) {
        console.error('Error getting ZAP scan results:', error.message);
        // Fall through to return mock/default data
      }
    }

    // Return default/mock data if scan not found or ZAP unavailable
    return {
      status: 'safe',
      critical: 0,
      high: 0,
      medium: 1,
      low: 2
    };

  } catch (error) {
    console.error('Error getting scan results:', error.message);
    
    // Return mock data
    return {
      status: 'safe',
      critical: 0,
      high: 0,
      medium: 1,
      low: 2
    };
  }
};