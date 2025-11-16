// Background service worker for ONE-Go Security Extension
// This handles download scanning and other background tasks

// Cross-browser compatibility: Use 'browser' API (Firefox) or 'chrome' API (Chrome/Edge)
// Firefox uses 'browser' namespace, Chrome/Edge use 'chrome' namespace
const browserAPI = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

// Validate browserAPI is available
if (!browserAPI) {
  console.error('❌ Browser API not available - extension cannot function');
  throw new Error('Browser API (chrome/browser) is not available');
}

// Validate required APIs are available
if (!browserAPI.runtime) {
  console.error('❌ browserAPI.runtime is not available');
  throw new Error('Runtime API is not available');
}

if (!browserAPI.storage) {
  console.error('❌ browserAPI.storage is not available');
  throw new Error('Storage API is not available');
}

console.log('✅ Browser API initialized successfully');

// Helper function to ensure Chrome API compatibility (Chrome uses callbacks, browser uses promises)
function chromeAPI() {
  // If browser API is available (Firefox), use it directly (it's Promise-based)
  if (typeof browser !== 'undefined') {
    return browser;
  }
  // For Chrome, return chrome API (callback-based)
  return chrome;
}

// Helper to wrap Chrome callbacks as promises for cross-browser compatibility
function promisifyChromeAPI(apiFunc, ...args) {
  return new Promise((resolve, reject) => {
    try {
      apiFunc(...args, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Simple auth helper to determine if the user is logged in (has token)
async function isAuthenticated() {
  try {
    const { auth_token } = await browserAPI.storage.local.get('auth_token');
    return Boolean(auth_token);
  } catch (e) {
    return false;
  }
}

// uBlock-style Ad Blocker using declarativeNetRequest API
// Uses filter lists compatible with uBlock Origin (EasyList, EasyPrivacy, etc.)

const AD_BLOCKER_RULE_ID_START = 100000;
let adBlockerRules = [];
let adBlockerInitialized = false;

// uBlock-compatible filter list sources (same as uBlock Origin uses)
const FILTER_LIST_SOURCES = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt'
];

// Parse filter list line and convert to declarativeNetRequest rule
function parseFilterLine(line) {
  // Remove comments and whitespace
  line = line.trim();
  if (!line || line.startsWith('!') || line.startsWith('[')) {
    return null;
  }

  // Handle exception rules (starts with @@)
  if (line.startsWith('@@')) {
    // For now, skip exception rules (can be implemented later)
    return null;
  }

  // Handle domain-specific rules (||domain.com^)
  if (line.startsWith('||') && line.includes('^')) {
    const domain = line.substring(2, line.indexOf('^'));
    if (domain && domain.length > 0 && domain.length < 253) { // Valid domain length
      return {
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: `*://${domain}/*`,
          resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other']
        }
      };
    }
  }

  // Handle simple domain blocking (||domain.com)
  if (line.startsWith('||') && !line.includes('^')) {
    const domain = line.substring(2).split('/')[0].split('?')[0];
    if (domain && domain.length > 0 && domain.length < 253) { // Valid domain length
      return {
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: `*://${domain}/*`,
          resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other']
        }
      };
    }
  }

  // Handle URL pattern rules (simplified - only basic patterns)
  // Note: declarativeNetRequest has limitations, so we focus on domain-based blocking
  // Complex URL patterns are skipped for now
  
  return null;
}

// Load and parse filter lists
async function loadFilterLists() {
  const allRules = [];
  const seenDomains = new Set(); // Track domains to prevent duplicates
  let ruleId = AD_BLOCKER_RULE_ID_START;

  for (const source of FILTER_LIST_SOURCES) {
    try {
      console.log(`📥 Loading filter list: ${source}`);
      const response = await fetch(source);
      if (!response.ok) {
        console.warn(`⚠️ Failed to load filter list: ${source}`);
        continue;
      }

      const text = await response.text();
      const lines = text.split('\n');
      
      let rulesFromList = 0;
      for (const line of lines) {
        const rule = parseFilterLine(line);
        if (rule) {
          // Extract domain from urlFilter to check for duplicates
          // urlFilter format: *://domain.com/*
          const urlFilterMatch = rule.condition.urlFilter.match(/\*:\/\/([^\/\*]+)/);
          const domain = urlFilterMatch ? urlFilterMatch[1] : null;
          
          // Skip if we've already added a rule for this domain
          if (domain && seenDomains.has(domain)) {
            continue; // Skip duplicate domain
          }
          
          // Mark domain as seen
          if (domain) {
            seenDomains.add(domain);
          }
          
          // Assign unique ID after checking for duplicates
          rule.id = ruleId++;
          allRules.push(rule);
          rulesFromList++;
        }
      }
      
      console.log(`✅ Loaded ${rulesFromList} rules from ${source}`);
    } catch (error) {
      console.error(`❌ Error loading filter list ${source}:`, error);
    }
  }

  // Limit to 30,000 rules (Chrome's limit for declarativeNetRequest)
  if (allRules.length > 30000) {
    console.warn(`⚠️ Too many rules (${allRules.length}), limiting to 30,000`);
    return allRules.slice(0, 30000);
  }

  console.log(`✅ Total unique rules loaded: ${allRules.length} (${seenDomains.size} unique domains)`);
  return allRules;
}

// Initialize uBlock-style ad blocker
async function initializeAdBlocker() {
  if (adBlockerInitialized) {
    return;
  }

  try {
    console.log('🔄 Initializing uBlock-style Ad Blocker...');
    
    // Check authentication and protection state
    const isAuth = await isAuthenticated();
    const { protectionEnabled, adBlockerEnabled } = await browserAPI.storage.local.get(['protectionEnabled', 'adBlockerEnabled']);
    
    if (!isAuth || protectionEnabled === false || adBlockerEnabled === false) {
      console.log('🔒 Ad blocker not enabled: auth=', isAuth, 'protection=', protectionEnabled, 'adBlocker=', adBlockerEnabled);
      adBlockerInitialized = true;
      return;
    }

    // Load filter lists
    adBlockerRules = await loadFilterLists();
    console.log(`✅ Loaded ${adBlockerRules.length} ad blocking rules`);

    // Apply rules using declarativeNetRequest API
    if (browserAPI.declarativeNetRequest && adBlockerRules.length > 0) {
      // Remove existing rules first
      const existingRules = await browserAPI.declarativeNetRequest.getDynamicRules();
      const existingRuleIds = existingRules.map(rule => rule.id);
      
      if (existingRuleIds.length > 0) {
        await browserAPI.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existingRuleIds
        });
      }

      // Add new rules in batches (Chrome has limits)
      const batchSize = 1000;
      for (let i = 0; i < adBlockerRules.length; i += batchSize) {
        const batch = adBlockerRules.slice(i, i + batchSize);
        await browserAPI.declarativeNetRequest.updateDynamicRules({
          addRules: batch
        });
        console.log(`✅ Applied ${Math.min(i + batchSize, adBlockerRules.length)}/${adBlockerRules.length} rules`);
      }
    }

    adBlockerInitialized = true;
    console.log('✅ uBlock-style Ad Blocker initialized and enabled');
  } catch (error) {
    console.error('❌ Error initializing ad blocker:', error);
    adBlockerInitialized = true; // Mark as initialized to prevent retry loops
  }
}

// Update ad blocker state
async function updateAdBlocker(enabled) {
  try {
    // Check authentication
    const isAuth = await isAuthenticated();
    if (!isAuth) {
      console.log('🔒 Not authenticated - disabling ad blocker');
      enabled = false;
    }

    // Check protection state
    const { protectionEnabled, adBlockerEnabled } = await browserAPI.storage.local.get(['protectionEnabled', 'adBlockerEnabled']);
    if (protectionEnabled === false) {
      console.log('🛡️ Protection disabled - disabling ad blocker');
      enabled = false;
    }
    
    // Also check adBlockerEnabled setting
    if (enabled && adBlockerEnabled === false) {
      console.log('🔒 Ad blocker setting disabled - disabling ad blocker');
      enabled = false;
    }

    if (!adBlockerInitialized && enabled) {
      // Initialize if not already initialized
      await initializeAdBlocker();
      return;
    }

    if (browserAPI.declarativeNetRequest) {
      if (enabled) {
        // Re-apply rules if they were removed
        if (adBlockerRules.length > 0) {
          const existingRules = await browserAPI.declarativeNetRequest.getDynamicRules();
          const existingRuleIds = existingRules.map(rule => rule.id);
          
          // Check if rules are already applied
          if (existingRuleIds.length === 0) {
            // Re-apply rules
            const batchSize = 1000;
            for (let i = 0; i < adBlockerRules.length; i += batchSize) {
              const batch = adBlockerRules.slice(i, i + batchSize);
              await browserAPI.declarativeNetRequest.updateDynamicRules({
                addRules: batch
              });
            }
          }
        }
        console.log('✅ Ad blocker enabled');
      } else {
        // Remove all rules
        const existingRules = await browserAPI.declarativeNetRequest.getDynamicRules();
        const existingRuleIds = existingRules.map(rule => rule.id);
        
        if (existingRuleIds.length > 0) {
          await browserAPI.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingRuleIds
          });
        }
        console.log('✅ Ad blocker disabled');
      }
    }
  } catch (error) {
    console.error('❌ Error updating ad blocker:', error);
  }
}

browserAPI.runtime.onInstalled.addListener(async (details) => {
  console.log('ONE-Go Security Extension installed');
  
  // IMPORTANT: Disable all features by default until user logs in
  await browserAPI.storage.local.set({
    protectionEnabled: false,
    adBlockerEnabled: false,
    downloadScanEnabled: false,
    autoPageScanEnabled: false
  });
  
  // Disable ad blocker (user must login first)
  await updateAdBlocker(false);
  
  // Clear all notifications on install/update
  if (browserAPI.notifications && browserAPI.notifications.getAll) {
    try {
      const notifications = await browserAPI.notifications.getAll();
      for (const notificationId of Object.keys(notifications)) {
        browserAPI.notifications.clear(notificationId).catch(() => {});
      }
    } catch (error) {
      // Ignore errors
    }
  }
});

// Clear all notifications when extension is uninstalled
if (browserAPI.runtime && browserAPI.runtime.setUninstallURL) {
  // This is called before uninstall - clear all notifications
  browserAPI.runtime.setUninstallURL('', () => {
    if (browserAPI.notifications && browserAPI.notifications.getAll) {
      browserAPI.notifications.getAll().then((notifications) => {
        for (const notificationId of Object.keys(notifications)) {
          browserAPI.notifications.clear(notificationId).catch(() => {});
        }
      }).catch(() => {});
    }
  });
}

// Ensure proper gating on browser startup too
if (browserAPI.runtime && browserAPI.runtime.onStartup) {
  browserAPI.runtime.onStartup.addListener(async () => {
    await initializeAdBlocker();
  });
}

// Listen for messages from content script and extension
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AUTH_CHANGED') {
    // Handle auth change from any popup/window
    // This ensures all popups stay in sync with the same user
    if (request.token && request.user) {
      // New login - IMPORTANT: Clear old auth first to ensure single user session
      // Then set new auth
      browserAPI.storage.local.remove(['auth_token', 'user']).then(() => {
        return browserAPI.storage.local.set({ 
          auth_token: request.token,
          user: JSON.stringify(request.user),
          // Keep features disabled - user must explicitly enable them after login
          // Don't auto-enable protection, ad blocker, or download scan
          protectionEnabled: false,
          adBlockerEnabled: false,
          downloadScanEnabled: false
        });
      }).then(() => {
        console.log('✅ Auth updated in background script (old auth cleared):', request.user?.name || 'Unknown');
        console.log('ℹ️ Features remain disabled - user must enable them manually');
        // Ensure ad blocker is disabled
        updateAdBlocker(false);
        sendResponse({ success: true });
      }).catch((error) => {
        console.error('❌ Error updating auth:', error);
        sendResponse({ success: false, error: error.message });
      });
    } else {
      // Logout - clear auth and disable protection/ad blocker
      browserAPI.storage.local.remove(['auth_token', 'user']).then(() => {
        // Disable protection and ad blocker on logout
        return browserAPI.storage.local.set({
          protectionEnabled: false,
          adBlockerEnabled: false,
          downloadScanEnabled: false
        });
      }).then(() => {
        // Disable ad blocker rules
        return updateAdBlocker(false);
      }).then(() => {
        console.log('✅ Auth cleared and protection disabled in background script');
        sendResponse({ success: true });
      }).catch((error) => {
        console.error('❌ Error clearing auth:', error);
        sendResponse({ success: false, error: error.message });
      });
    }
    return true; // Keep message channel open for async response
  } else if (request.type === 'SET_AUTH_TOKEN' || request.type === 'WEBAPP_AUTH_CHANGE') {
    // Update extension storage with web app auth (from phone verification page)
    // IMPORTANT: Clear existing auth first to ensure single user session
    if (request.token) {
      // Get tab ID from sender (content script) or from request
      const tabId = request.tabId || sender?.tab?.id;
      
      // Clear first, then set new auth
      browserAPI.storage.local.remove(['auth_token', 'user']).then(() => {
        return browserAPI.storage.local.set({ 
          auth_token: request.token,
          user: JSON.stringify(request.user),
          // Keep features disabled - user must explicitly enable them after login
          protectionEnabled: false,
          adBlockerEnabled: false,
          downloadScanEnabled: false
        });
      }).then(() => {
        console.log('✅ Auth synced from web app:', request.user?.name || 'Unknown');
        console.log('ℹ️ Features remain disabled - user must enable them manually');
        // Ensure ad blocker is disabled
        updateAdBlocker(false);
        
        // Close the tab after syncing auth (if tabId is available)
        if (tabId) {
          setTimeout(() => {
            browserAPI.tabs.remove(tabId).catch((error) => {
              console.log('⚠️ Could not close tab:', error.message);
            });
          }, 1000); // Give time for auth to be processed
        }
        
        sendResponse({ success: true });
      }).catch((error) => {
        console.error('❌ Error syncing auth from web app:', error);
        sendResponse({ success: false, error: error.message });
      });
    } else {
      browserAPI.storage.local.remove(['auth_token', 'user']).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        console.error('❌ Error clearing auth:', error);
        sendResponse({ success: false, error: error.message });
      });
    }
    return true; // Keep message channel open for async response
  } else if (request.type === 'CLOSE_TAB') {
    // Close a tab by ID (used when tab was opened by extension)
    // Get tab ID from request or from sender
    const tabId = request.tabId || sender?.tab?.id;
    
    if (tabId) {
      browserAPI.tabs.remove(tabId).then(() => {
        console.log('✅ Tab closed successfully:', tabId);
        sendResponse({ success: true });
      }).catch((error) => {
        console.error('❌ Error closing tab:', error);
        sendResponse({ success: false, error: error.message });
      });
    } else {
      // Try to find the tab by URL if no tab ID provided
      console.log('⚠️ No tab ID provided, trying to find tab by URL');
      if (sender?.tab?.url) {
        browserAPI.tabs.query({ url: sender.tab.url }).then((tabs) => {
          if (tabs && tabs.length > 0) {
            const tabToClose = tabs[0];
            browserAPI.tabs.remove(tabToClose.id).then(() => {
              console.log('✅ Tab closed successfully by URL:', tabToClose.id);
              sendResponse({ success: true });
            }).catch((error) => {
              console.error('❌ Error closing tab by URL:', error);
              sendResponse({ success: false, error: error.message });
            });
          } else {
            console.warn('⚠️ No tab found with URL:', sender.tab.url);
            sendResponse({ success: false, error: 'No tab found' });
          }
        }).catch((error) => {
          console.error('❌ Error querying tabs:', error);
          sendResponse({ success: false, error: error.message });
        });
      } else {
        console.warn('⚠️ No tab ID or URL available to close tab');
        sendResponse({ success: false, error: 'No tab ID or URL provided' });
      }
    }
    return true; // Keep message channel open for async response
  } else if (request.type === 'GET_EXTENSION_AUTH') {
    // Content script requesting extension auth data
    browserAPI.storage.local.get(['auth_token', 'user']).then((result) => {
      const user = result.user ? (typeof result.user === 'string' ? JSON.parse(result.user) : result.user) : null;
      sendResponse({
        token: result.auth_token || null,
        user: user
      });
    }).catch((error) => {
      console.error('Error getting extension auth:', error);
      sendResponse({ token: null, user: null });
    });
    return true; // Keep message channel open for async response
  } else if (request.type === 'PROTECTION_STATE_CHANGED') {
    // Protection toggle changed
    console.log('🛡️ Protection state changed:', request.enabled);
    // Update ad blocker state if protection is disabled
    if (!request.enabled) {
      updateAdBlocker(false);
    }
    sendResponse({ success: true });
  } else if (request.type === 'TOGGLE_AD_BLOCKER') {
    // Update ad blocker state
    updateAdBlocker(request.enabled).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error toggling ad blocker:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  } else if (request.type === 'GET_AD_BLOCKER_STATE') {
    // Get ad blocker state for content scripts
    browserAPI.storage.local.get(['adBlockerEnabled', 'protectionEnabled']).then((result) => {
      const adBlockerEnabled = result.adBlockerEnabled !== false; // Default to true
      const protectionEnabled = result.protectionEnabled !== false; // Default to true
      sendResponse({ 
        adBlockerEnabled: adBlockerEnabled && protectionEnabled,
        protectionEnabled: protectionEnabled
      });
    }).catch((error) => {
      console.error('Error getting ad blocker state:', error);
      sendResponse({ adBlockerEnabled: true, protectionEnabled: true }); // Default to enabled
    });
    return true; // Keep message channel open for async response
  } else if (request.type === 'GET_PROTECTION_STATE') {
    // Get current protection state
    browserAPI.storage.local.get('protectionEnabled').then((result) => {
      const enabled = result.protectionEnabled !== false; // Default to true
      sendResponse({ enabled: enabled });
    }).catch((error) => {
      console.error('Error getting protection state:', error);
      sendResponse({ enabled: true }); // Default to enabled
    });
    return true; // Keep message channel open for async response
  } else if (request.type === 'SET_PROTECTION_STATE') {
    // Set protection state from web app
    const enabled = request.enabled !== false;
    browserAPI.storage.local.set({ protectionEnabled: enabled }).then(() => {
      console.log('🛡️ Protection state set from web app:', enabled);
      
      // Also disable individual features when protection is off
      if (!enabled) {
        browserAPI.storage.local.set({
          adBlockerEnabled: false,
          downloadScanEnabled: false
        });
        updateAdBlocker(false);
      }
      
      // Notify content scripts of the change
      browserAPI.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            browserAPI.tabs.sendMessage(tab.id, {
              type: 'PROTECTION_STATE_CHANGED',
              enabled: enabled
            }).catch((error) => {
              // Tab might not have content script or tab is closed - that's okay
              // Only log if it's not the expected "Receiving end does not exist" error
              if (error.message && !error.message.includes('Receiving end does not exist') && 
                  !error.message.includes('Could not establish connection')) {
                console.log('⚠️ Could not send message to tab:', error.message);
              }
            });
          }
        });
      });
      
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error setting protection state:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  } else if (request.type === 'HIGH_THREAT_DETECTED') {
    // High threat detected from scan results
    const { url, threatLevel, result } = request;
    
    // Get threat counts from the request if available
    const critical = request.critical || request.details?.alerts?.critical || request.details?.threatCounts?.critical || 0;
    const high = request.high || request.details?.alerts?.high || request.details?.threatCounts?.high || 0;
    
    // CRITICAL: Only proceed if there are ACTUAL threats (count > 0)
    const hasCriticalThreats = critical > 0;
    const hasHighThreats = high > 0;
    
    if (!hasCriticalThreats && !hasHighThreats) {
      console.log(`ℹ️ HIGH_THREAT_DETECTED message received but no actual threats found (critical: ${critical}, high: ${high}) - ignoring`);
      sendResponse({ success: true, skipped: true, reason: 'No actual threats' });
  return true;
    }
    
    console.log(`⚠️ High threat detected: ${url} (${threatLevel}, critical: ${critical}, high: ${high})`);
    
    // Find the tab with this URL
    browserAPI.tabs.query({}, async (tabs) => {
      for (const tab of tabs) {
        if (tab.url === url && tab.id) {
          // Check if we've already shown notification for this URL
          if (notifiedThreatSites.has(url)) {
            return;
          }
          
          // Check if protection is enabled
          const protectionResult = await browserAPI.storage.local.get('protectionEnabled');
          if (protectionResult.protectionEnabled === false) {
            return;
          }
          
          // Show blocking notification
          const notificationId = `threat-block-${tab.id}-${Date.now()}`;
          
          const threatText = hasCriticalThreats ? 'CRITICAL' : 'HIGH';
          const threatCount = hasCriticalThreats ? critical : high;
          
          // Double-check: only show if threatCount > 0
          if (threatCount > 0) {
            browserAPI.notifications.create(notificationId, {
              type: 'basic',
              iconUrl: browserAPI.runtime.getURL('logo.png'),
              title: `⚠️ ${threatText} Threat Detected`,
              message: `This website has ${threatCount} ${threatText.toLowerCase()} threat(s). Block this website?`,
              buttons: [
                { title: 'Stay on Website' },
                { title: 'Block & Close Tab' }
              ],
              requireInteraction: true
            }, (createdNotificationId) => {
              if (!browserAPI.runtime.lastError && createdNotificationId) {
                highThreatSites.set(tab.id, {
                  url: url,
                  threatLevel: threatLevel,
                  notificationId: createdNotificationId,
                  tabId: tab.id,
                  criticalCount: critical,
                  highCount: high
                });
                notifiedThreatSites.add(url);
                console.log(`⚠️ High threat blocking notification shown for ${url} (${threatCount} ${threatText.toLowerCase()} threat(s))`);
              }
            });
          }
          
          break;
        }
      }
    });
    
    sendResponse({ success: true });
    return true; // Keep message channel open for async response
  } else if (request.type === 'USER_DOWNLOAD_CLICKED') {
    // User clicked a download link/button - mark this URL as user-initiated
    const { url, pageUrl, urls } = request;
    const timestamp = Date.now();
    
    // Helper function to extract base domain
    function getBaseDomain(hostname) {
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        return parts.slice(-2).join('.');
      }
      return hostname;
    }
    
    // Track all provided URLs (url, pageUrl, and urls array)
    const urlsToTrack = [];
    if (url) urlsToTrack.push(url);
    if (pageUrl) urlsToTrack.push(pageUrl);
    if (urls && Array.isArray(urls)) {
      urlsToTrack.push(...urls);
    }
    
    // Remove duplicates
    const uniqueUrls = [...new Set(urlsToTrack)];
    
    for (const urlToTrack of uniqueUrls) {
      if (!urlToTrack || !urlToTrack.startsWith('http')) continue;
      
      userInitiatedDownloads.set(urlToTrack, timestamp);
      
      // Store multiple variations for better matching
      try {
        const urlObj = new URL(urlToTrack);
        const hostnameParts = urlObj.hostname.split('.');
        
        // Store base URL (without query params)
        const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        if (baseUrl !== urlToTrack) {
          userInitiatedDownloads.set(baseUrl, timestamp);
        }
        
        // Store URL with base domain (e.g., example.com instead of www.example.com)
        if (hostnameParts.length >= 2) {
          const baseDomain = getBaseDomain(urlObj.hostname);
          const baseDomainUrl = `${urlObj.protocol}//${baseDomain}${urlObj.pathname}`;
          if (baseDomainUrl !== urlToTrack && baseDomainUrl !== baseUrl) {
            userInitiatedDownloads.set(baseDomainUrl, timestamp);
          }
          
          // Also store just the base domain root (for domain-wide matching)
          const domainRoot = `${urlObj.protocol}//${baseDomain}`;
          userInitiatedDownloads.set(domainRoot, timestamp);
        }
        
        // For project-based sites (SourceForge, GitHub, etc.), track project paths
        if (urlObj.pathname.includes('/projects/') || urlObj.pathname.includes('/project/') ||
            urlObj.pathname.includes('/repos/') || urlObj.pathname.includes('/repo/')) {
          const projectPath = urlObj.pathname.match(/\/(?:projects?|repos?)\/([^\/]+)/);
          if (projectPath) {
            const projectUrl = `${urlObj.protocol}//${urlObj.host}/projects/${projectPath[1]}/`;
            if (projectUrl !== urlToTrack && projectUrl !== baseUrl) {
              userInitiatedDownloads.set(projectUrl, timestamp);
            }
            // Also store with base domain
            if (hostnameParts.length >= 2) {
              const baseDomain = getBaseDomain(urlObj.hostname);
              const projectUrlBaseDomain = `${urlObj.protocol}//${baseDomain}/projects/${projectPath[1]}/`;
              if (projectUrlBaseDomain !== projectUrl) {
                userInitiatedDownloads.set(projectUrlBaseDomain, timestamp);
              }
            }
          }
        }
      } catch (e) {
        // Invalid URL, just use the original
        console.log('⚠️ Could not parse URL for tracking:', urlToTrack, e);
      }
    }
    
    console.log('👆 User-initiated download detected:', url || pageUrl);
    console.log('   Page URL:', pageUrl);
    console.log('   Total tracked URLs:', userInitiatedDownloads.size);
    console.log('   Recent tracked URLs:', Array.from(userInitiatedDownloads.keys()).slice(-10));
    sendResponse({ success: true });
    return true;
  }
  return true;
});

// Store pending downloads that are being scanned
const pendingDownloads = new Map();

// Store high-threat websites that need user permission to block
const highThreatSites = new Map(); // Map<tabId, {url, threatLevel, notificationId}>
const notifiedThreatSites = new Set(); // Track which URLs we've already notified about

// Store unsafe URLs that should be blocked before navigation
// Key: normalized URL, Value: { critical, high, threatLevel, timestamp }
const unsafeUrlCache = new Map();
const UNSAFE_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Store pending navigation blocks (URLs waiting for user permission)
// Key: tabId, Value: { url, critical, high, threatLevel, notificationId }
const pendingNavigationBlocks = new Map();

// Track user-initiated downloads (URLs that user clicked to download)
// Key: download URL, Value: timestamp (expires after 60 seconds)
const userInitiatedDownloads = new Map();
const USER_INITIATED_EXPIRY = 60000; // 60 seconds (increased to handle slow redirects and SourceForge)

// Track temporarily approved downloads for re-initiation
// Key: download URL (normalized), Value: timestamp (expires after 5 seconds)
// This is ONLY used for re-initiated downloads (not for regular downloads)
// Regular downloads are scanned every time - this is just to allow re-initiation to proceed
const approvedDownloads = new Map();
const REINITIATED_DOWNLOAD_APPROVAL_EXPIRY = 5000; // 5 seconds (very short - only for re-initiation)

// Auto page scan tracking
const AUTO_PAGE_SCAN_CACHE_DURATION = 60 * 1000; // 60 seconds
const AUTO_PAGE_SCAN_PENDING_EXPIRY = 2 * 60 * 1000; // 2 minutes
const SCAN_NOTIFICATION_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const autoPageScanHistory = new Map(); // normalizedUrl -> { timestamp, status, scanId?, tabId?, reason?, error? }
const pendingAutoPageScans = new Map(); // normalizedUrl -> { tabId, url, scanId?, startedAt }
let autoPageScanEnabled = false;
const notifiedScanLogs = new Map(); // logId -> timestamp

// Load initial auto page scan setting
browserAPI.storage.local
  .get('autoPageScanEnabled')
  .then((result) => {
    autoPageScanEnabled = result.autoPageScanEnabled === true;
    console.log(`⚙️ Auto page scan initial state: ${autoPageScanEnabled}`);
  })
  .catch((error) => {
    console.error('❌ Failed to load auto page scan setting:', error);
  });

function normalizeUrlForAutoScan(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString().toLowerCase();
  } catch (error) {
    return (url || '').toLowerCase();
  }
}

function isBrowserInternalUrl(url) {
  if (!url || typeof url !== 'string') {
    return true;
  }
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('moz-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('file://') ||
    url === 'chrome://newtab/' ||
    url === 'about:blank'
  );
}

function shouldSkipAutoPageScan(url) {
  if (!url || typeof url !== 'string') {
    return true;
  }
  if (isBrowserInternalUrl(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const port = parsed.port || '';
    // Skip scanning our own backend/API host to avoid recursion
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (port === '5000' || port === '5173') {
        return true;
      }
    }
  } catch (error) {
    // If URL parsing fails, skip
    return true;
  }
  return false;
}

async function handleAutoPageScanNavigation(tabId, url, reason = 'navigation') {
  if (!autoPageScanEnabled) {
    return;
  }

  if (shouldSkipAutoPageScan(url)) {
    return;
  }

  const normalizedUrl = normalizeUrlForAutoScan(url);
  const now = Date.now();
  const recentEntry = autoPageScanHistory.get(normalizedUrl);

  if (recentEntry) {
    const age = now - (recentEntry.timestamp || 0);
    const isPending = recentEntry.status === 'pending' || recentEntry.status === 'submitted';
    if (isPending && age < 10_000) {
      // Already scanning this URL right now
      return;
    }
    if (!isPending && age < AUTO_PAGE_SCAN_CACHE_DURATION) {
      // Recently scanned, skip for now
      return;
    }
  }

  try {
    const settings = await browserAPI.storage.local.get(['auth_token', 'protectionEnabled']);
    if (!settings.auth_token || settings.protectionEnabled === false) {
      return;
    }

    // Mark as pending immediately to avoid duplicates
    autoPageScanHistory.set(normalizedUrl, {
      timestamp: now,
      status: 'pending',
      tabId,
      reason,
    });
    pendingAutoPageScans.set(normalizedUrl, {
      tabId,
      url,
      startedAt: now,
    });

    try {
      browserAPI.runtime
        .sendMessage({
          type: 'AUTO_PAGE_SCAN_STARTED',
          url,
          tabId,
        })
        .catch(() => {});
    } catch (error) {
      // Ignore messaging errors (popup might not be open)
    }

    console.log(`🔍 Auto page scan triggered (${reason}): ${url}`);

    const API_BASE_URL = 'http://localhost:5000/api';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000); // 20 seconds

    let response;
    try {
      response = await fetch(`${API_BASE_URL}/scan/page`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.auth_token}`,
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    let data = null;
    try {
      data = await response.clone().json();
    } catch (error) {
      // Response might not be JSON on error
    }

    if (!response.ok || !data || data.success === false) {
      const message =
        data?.message ||
        data?.error ||
        `Scan request failed with status ${response.status}`;
      throw new Error(message);
    }

    const scanId = data.scanId || data.data?.scanId || null;

    pendingAutoPageScans.set(normalizedUrl, {
      tabId,
      url,
      scanId,
      startedAt: now,
    });
    autoPageScanHistory.set(normalizedUrl, {
      timestamp: Date.now(),
      status: 'submitted',
      tabId,
      scanId,
      reason,
    });

    console.log(`✅ Auto page scan initiated for ${url}${scanId ? ` (scanId: ${scanId})` : ''}`);
    
    // Start polling for scan results if we have a scanId
    if (scanId) {
      pollAutoPageScanStatus(normalizedUrl, url, scanId, tabId, settings.auth_token);
    }
  } catch (error) {
    let message = 'Unknown error';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        message = 'Scan request timed out';
      } else if (error.message === 'Failed to fetch') {
        message = 'Unable to reach scanning service';
      } else {
        message = error.message;
      }
    }

    autoPageScanHistory.set(normalizedUrl, {
      timestamp: Date.now(),
      status: 'error',
      tabId,
      reason,
      error: message,
    });
    pendingAutoPageScans.delete(normalizedUrl);

    console.error(`❌ Auto page scan failed for ${url}:`, message);

    try {
      browserAPI.runtime
        .sendMessage({
          type: 'AUTO_PAGE_SCAN_ERROR',
          url,
          error: message,
        })
        .catch(() => {});
    } catch (error) {
      // Ignore messaging errors
    }
  }
}

// Poll auto page scan status and show notification when complete
async function pollAutoPageScanStatus(normalizedUrl, url, scanId, tabId, authToken) {
  const MAX_POLL_ATTEMPTS = 60; // Poll for up to 2 minutes (60 * 2 seconds)
  const POLL_INTERVAL = 2000; // Poll every 2 seconds
  let pollCount = 0;
  
  const pollInterval = setInterval(async () => {
    pollCount++;
    
    // Stop polling if we've exceeded max attempts
    if (pollCount > MAX_POLL_ATTEMPTS) {
      clearInterval(pollInterval);
      console.log(`⏱️ Auto page scan polling timeout for ${url}`);
      return;
    }
    
    try {
      const API_BASE_URL = 'http://localhost:5000/api';
      
      // Check scan status using scanId
      const statusResponse = await fetch(`${API_BASE_URL}/scan/status?scanId=${scanId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (!statusResponse.ok) {
        // Scan might still be in progress
        if (pollCount % 10 === 0) { // Log every 10th attempt
          console.log(`⏳ Auto page scan still in progress for ${url} (attempt ${pollCount})`);
        }
        return;
      }
      
      const statusData = await statusResponse.json();
      
      // Check if scan is complete via status endpoint
      const isCompleteViaStatus = statusData.success && statusData.status && 
                                   statusData.status !== 'in_progress' && 
                                   statusData.status !== 'pending';
      
      // Also check logs directly to see if scan result is available
      const logsResponse = await fetch(`${API_BASE_URL}/logs?type=pages`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });
      
      let foundCompleteLog = false;
      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        if (logsData.success && logsData.logs) {
          // Find the log for this URL
          const normalizedCurrentUrl = normalizeUrlForAutoScan(url);
          const urlLogs = logsData.logs.filter((log) => {
            if (!log.source) return false;
            // Check if log has scanId matching our scan
            const logScanId = log.details?.scanId || log.scanId;
            const normalizedLogSource = normalizeUrlForAutoScan(log.source);
            return (logScanId === scanId) || 
                   (normalizedLogSource === normalizedCurrentUrl) || 
                   (log.source === url);
          }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          
          if (urlLogs.length > 0) {
            const latestLog = urlLogs[0];
            // Check if this log is recent (within last 5 minutes) and has a result
            const logAge = Date.now() - new Date(latestLog.timestamp || 0).getTime();
            if (logAge < 5 * 60 * 1000 && latestLog.result) {
              // Found a completed scan result
              foundCompleteLog = true;
              clearInterval(pollInterval);
              
              await showAutoPageScanNotification(latestLog, url, tabId);
              
              // Update history
              autoPageScanHistory.set(normalizedUrl, {
                timestamp: Date.now(),
                status: latestLog.result || 'unknown',
                tabId,
                scanId,
                reason: 'completed',
              });
              pendingAutoPageScans.delete(normalizedUrl);
              
              console.log(`✅ Auto page scan completed and notification shown for ${url}`);
              return;
            }
          }
        }
      }
      
      // If status says complete but we didn't find log, or status check failed
      if (isCompleteViaStatus && !foundCompleteLog) {
        // Status says complete but no log yet - wait a bit more
        if (pollCount % 5 === 0) {
          console.log(`⏳ Scan status says complete but log not found yet for ${url}`);
        }
      } else if (!isCompleteViaStatus && pollCount % 10 === 0) {
        // Log progress every 10 attempts
        console.log(`⏳ Auto page scan in progress for ${url} (attempt ${pollCount})`);
      }
    } catch (error) {
      // Ignore errors - scan might still be in progress
      if (pollCount % 10 === 0) {
        console.log(`⏳ Auto page scan polling error (attempt ${pollCount}):`, error.message);
      }
    }
  }, POLL_INTERVAL);
}

// Show notification for auto page scan result
async function showAutoPageScanNotification(log, url, tabId) {
  try {
    const threatLevel = log.threatLevel || 'none';
    const critical = log.details?.alerts?.critical || log.details?.threatCounts?.critical || 0;
    const high = log.details?.alerts?.high || log.details?.threatCounts?.high || 0;
    const hasCriticalThreats = critical > 0;
    const hasHighThreats = high > 0;
    
    // Unsafe if:
    // 1. Result is explicitly 'unsafe' or 'infected'
    // 2. Has critical or high threat counts
    // 3. Threat level is critical or high
    const isUnsafe = (log.result === 'unsafe') || 
                    (log.result === 'infected') ||
                    hasCriticalThreats || 
                    hasHighThreats || 
                    threatLevel === 'critical' || 
                    threatLevel === 'high';
    
    // Log unsafe detection for debugging
    console.log('🔍 Unsafe scan detection:', {
      result: log.result,
      threatLevel,
      critical,
      high,
      hasCriticalThreats,
      hasHighThreats,
      isUnsafe,
      details: log.details
    });
    
    const logId = log.id || log._id || `${log.source}:${log.timestamp || Date.now()}`;
    const notificationKey = `auto-${logId}-${log.timestamp || Date.now()}`;
    
    // CRITICAL: For unsafe scans, always show notification (even if we've notified before)
    // This ensures users see high-threat warnings every time
    // For safe scans, check if we've already notified
    if (!isUnsafe && notifiedScanLogs.has(notificationKey)) {
      console.log('ℹ️ Already notified for this safe auto page scan:', notificationKey);
      return;
    }
    
    // Mark as notified (use unique key with current timestamp for unsafe scans to allow re-notification)
    const finalNotificationKey = isUnsafe 
      ? `auto-unsafe-${logId}-${Date.now()}` // Unique key each time for unsafe scans
      : notificationKey;
    notifiedScanLogs.set(finalNotificationKey, Date.now());
    
    if (browserAPI.notifications && typeof browserAPI.notifications.create === 'function') {
      const displayUrl = url && url.length > 80 ? `${url.substring(0, 77)}...` : (url || 'Unknown site');
      const notificationId = `auto-scan-result-${Date.now()}-${logId}`;
      const notificationTitle = isUnsafe ? '⚠️ Auto Scan: Unsafe' : '✅ Auto Scan: Safe';
      const threatSummary = isUnsafe
        ? `${critical} critical / ${high} high threats detected.`
        : 'No critical or high threats detected.';
      
      const notificationOptions = {
        type: 'basic',
        iconUrl: browserAPI.runtime.getURL('logo.png'),
        title: notificationTitle,
        message: `${displayUrl}\n${threatSummary}`,
        priority: isUnsafe ? 2 : 1,
        requireInteraction: false,
      };
      
      console.log('📤 Creating auto page scan notification:', {
        notificationId,
        title: notificationTitle,
        url: displayUrl,
        result: log.result,
        isUnsafe
      });
      
      if (typeof browser !== 'undefined') {
        browserAPI.notifications.create(notificationId, notificationOptions).then((createdId) => {
          if (createdId) {
            console.log('✅✅✅ AUTO PAGE SCAN NOTIFICATION CREATED:', notificationId, notificationTitle);
          } else {
            console.error('❌ Notification creation returned no ID');
          }
        }).catch((error) => {
          console.error('❌❌❌ ERROR creating auto page scan notification:', error);
        });
      } else {
        browserAPI.notifications.create(notificationId, notificationOptions, (createdId) => {
          const lastError = chrome.runtime && chrome.runtime.lastError;
          if (lastError) {
            console.error('❌❌❌ ERROR creating auto page scan notification:', lastError.message);
          } else if (createdId) {
            console.log('✅✅✅ AUTO PAGE SCAN NOTIFICATION CREATED:', notificationId, notificationTitle);
          } else {
            console.error('❌ Notification creation returned no ID');
          }
        });
      }
    } else {
      console.error('❌ Notifications API not available');
    }
  } catch (error) {
    console.error('❌ Error showing auto page scan notification:', error);
  }
}

// Block unsafe pages BEFORE navigation completes
// We use onCommitted (fires early in navigation) to redirect unsafe pages
if (browserAPI.webNavigation && browserAPI.webNavigation.onCommitted) {
  // Store a separate listener for blocking unsafe pages
  const unsafePageBlockListener = async (details) => {
    try {
      // Only handle main frame navigation (frameId === 0)
      if (details.frameId !== 0) {
        return;
      }
      
      if (!details.url || !details.tabId) {
        return;
      }
      
      // Skip browser internal URLs
      if (isBrowserInternalUrl(details.url)) {
        return;
      }
      
      // Skip if already on about:blank (our blocking page)
      if (details.url === 'about:blank') {
        return;
      }
      
      // Check if protection is enabled
      const settings = await browserAPI.storage.local.get(['protectionEnabled', 'auth_token']);
      if (settings.protectionEnabled === false || !settings.auth_token) {
        return;
      }
      
      const normalizedUrl = normalizeUrlForAutoScan(details.url);
      
      // Check if this URL is in our unsafe cache
      const unsafeInfo = unsafeUrlCache.get(normalizedUrl);
      if (unsafeInfo) {
        const age = Date.now() - (unsafeInfo.timestamp || 0);
        if (age < UNSAFE_CACHE_DURATION) {
          // URL is unsafe - check if user has already approved it
          if (pendingNavigationBlocks.has(details.tabId)) {
            const blockInfo = pendingNavigationBlocks.get(details.tabId);
            if (blockInfo.url === details.url && blockInfo.approved) {
              // User already approved this navigation
              console.log('✅ User approved unsafe navigation:', details.url);
              pendingNavigationBlocks.delete(details.tabId);
              return; // Allow navigation
            }
          }
          
          // Check if we've already shown notification for this tab
          if (pendingNavigationBlocks.has(details.tabId)) {
            return; // Already blocking this navigation
          }
          
          // Block navigation and ask for permission
          console.log('🚫 Blocking unsafe page navigation:', details.url);
          console.log(`   Threats: ${unsafeInfo.critical} critical, ${unsafeInfo.high} high`);
          
          // Redirect to about:blank to stop page loading
          // We'll redirect to the actual URL after user approval
          try {
            await browserAPI.tabs.update(details.tabId, {
              url: 'about:blank'
            });
            
            // Show permission notification
            const threatText = unsafeInfo.critical > 0 ? 'CRITICAL' : 'HIGH';
            const threatCount = unsafeInfo.critical > 0 ? unsafeInfo.critical : unsafeInfo.high;
            const displayUrl = details.url.length > 80 ? `${details.url.substring(0, 77)}...` : details.url;
            
            const notificationId = `unsafe-page-block-${details.tabId}-${Date.now()}`;
            browserAPI.notifications.create(notificationId, {
              type: 'basic',
              iconUrl: browserAPI.runtime.getURL('logo.png'),
              title: `⚠️ ${threatText} Threat Detected`,
              message: `${displayUrl}\nThis website has ${threatCount} ${threatText.toLowerCase()} threat(s). Do you want to proceed?`,
              buttons: [
                { title: 'Yes, Open Anyway' },
                { title: 'No, Stay Safe' }
              ],
              requireInteraction: true,
              priority: 2
            }, (createdNotificationId) => {
              if (!browserAPI.runtime.lastError && createdNotificationId) {
                pendingNavigationBlocks.set(details.tabId, {
                  url: details.url,
                  critical: unsafeInfo.critical,
                  high: unsafeInfo.high,
                  threatLevel: unsafeInfo.threatLevel,
                  notificationId: createdNotificationId,
                  approved: false,
                  timestamp: Date.now()
                });
                console.log(`⚠️ Navigation blocked, permission prompt shown for ${details.url}`);
              }
            });
          } catch (error) {
            console.error('❌ Error blocking navigation:', error);
          }
        } else {
          // Cache expired, remove it
          unsafeUrlCache.delete(normalizedUrl);
        }
      }
    } catch (error) {
      console.error('❌ Error in unsafe page block listener:', error);
    }
  };
  
  // Add the unsafe page block listener BEFORE the auto page scan listener
  // This ensures unsafe pages are blocked before scanning
  browserAPI.webNavigation.onCommitted.addListener(unsafePageBlockListener);
  console.log('✅ Unsafe page navigation blocker registered (onCommitted)');
}

// Register auto page scan navigation listeners
if (browserAPI.webNavigation && browserAPI.webNavigation.onCommitted) {
  browserAPI.webNavigation.onCommitted.addListener((details) => {
    try {
      if (details.frameId !== 0) {
        return;
      }
      if (!details.url) {
        return;
      }
      handleAutoPageScanNavigation(details.tabId, details.url, details.transitionType || 'navigation');
    } catch (error) {
      console.error('❌ Error handling webNavigation event:', error);
    }
  });
  console.log('✅ Auto page scan navigation listener registered (webNavigation)');
} else if (browserAPI.tabs && browserAPI.tabs.onUpdated) {
  console.warn('⚠️ webNavigation API not available, falling back to tabs.onUpdated for auto page scan');
  browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab?.url) {
      handleAutoPageScanNavigation(tabId, tab.url, 'tabs.onUpdated');
    }
  });
}

if (browserAPI.tabs && browserAPI.tabs.onRemoved) {
  browserAPI.tabs.onRemoved.addListener((tabId) => {
    let removedPending = 0;
    for (const [normalizedUrl, info] of pendingAutoPageScans.entries()) {
      if (info.tabId === tabId) {
        pendingAutoPageScans.delete(normalizedUrl);
        removedPending++;
      }
    }
    if (removedPending > 0) {
      console.log(`🧹 Cleared ${removedPending} pending auto page scans for closed tab ${tabId}`);
    }

    let removedHistory = 0;
    for (const [normalizedUrl, info] of autoPageScanHistory.entries()) {
      if (info.tabId === tabId && Date.now() - (info.timestamp || 0) > AUTO_PAGE_SCAN_CACHE_DURATION) {
        autoPageScanHistory.delete(normalizedUrl);
        removedHistory++;
      }
    }
    if (removedHistory > 0) {
      console.log(`🧹 Removed ${removedHistory} auto page scan history entries for closed tab ${tabId}`);
    }
  });
}

// Minimum hold time before showing any UI (ms)
const MIN_HOLD_MS = 700;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Clean up expired user-initiated download entries periodically
// Store interval IDs for cleanup
let cleanupIntervalId = null;
let monitorScanIntervalId = null;

// Cleanup function to stop all intervals
function stopAllIntervals() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  if (monitorScanIntervalId) {
    clearInterval(monitorScanIntervalId);
    monitorScanIntervalId = null;
  }
}

cleanupIntervalId = setInterval(async () => {
  const now = Date.now();
  let cleaned = 0;
  for (const [url, timestamp] of userInitiatedDownloads.entries()) {
    if (now - timestamp > USER_INITIATED_EXPIRY) {
      userInitiatedDownloads.delete(url);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired download tracking entries. Remaining: ${userInitiatedDownloads.size}`);
  }
  
  // Also clean up expired temporary approvals for re-initiated downloads
  let cleanedApproved = 0;
  for (const [url, timestamp] of approvedDownloads.entries()) {
    if (now - timestamp > REINITIATED_DOWNLOAD_APPROVAL_EXPIRY) {
      approvedDownloads.delete(url);
      cleanedApproved++;
    }
  }
  if (cleanedApproved > 0) {
    console.log(`🧹 Cleaned up ${cleanedApproved} expired temporary re-initiation approvals. Remaining: ${approvedDownloads.size}`);
  }
  
  // Clean up old processed notifications (older than 1 hour) to prevent memory leaks
  // Note: processedNotifications is a Set, so we can't track timestamps directly
  // Instead, we'll just clear it periodically (every hour)
  // In practice, the Set should be small since notifications are processed quickly
  const PROCESSED_NOTIFICATIONS_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  if (processedNotifications.size > 1000) {
    // If we have too many processed notifications, clear them all
    // This shouldn't happen in normal operation, but it's a safety measure
    console.log(`🧹 Clearing processed notifications (${processedNotifications.size} entries) to prevent memory leak`);
    processedNotifications.clear();
  }

  // Clean auto page scan history (cache)
  let cleanedAutoHistory = 0;
  for (const [normalizedUrl, info] of autoPageScanHistory.entries()) {
    if (now - (info.timestamp || 0) > AUTO_PAGE_SCAN_CACHE_DURATION) {
      autoPageScanHistory.delete(normalizedUrl);
      cleanedAutoHistory++;
    }
  }
  if (cleanedAutoHistory > 0) {
    console.log(`🧹 Cleared ${cleanedAutoHistory} expired auto page scan entries. Remaining: ${autoPageScanHistory.size}`);
  }

  // Clean pending auto scans that are stuck
  let cleanedPendingAuto = 0;
  for (const [normalizedUrl, info] of pendingAutoPageScans.entries()) {
    if (now - (info.startedAt || 0) > AUTO_PAGE_SCAN_PENDING_EXPIRY) {
      pendingAutoPageScans.delete(normalizedUrl);
      cleanedPendingAuto++;
    }
  }
  if (cleanedPendingAuto > 0) {
    console.log(`🧹 Cleared ${cleanedPendingAuto} stale pending auto page scans. Remaining: ${pendingAutoPageScans.size}`);
  }

  let cleanedScanLogCache = 0;
  for (const [logId, timestamp] of notifiedScanLogs.entries()) {
    if (now - timestamp > SCAN_NOTIFICATION_CACHE_DURATION) {
      notifiedScanLogs.delete(logId);
      cleanedScanLogCache++;
    }
  }
  if (cleanedScanLogCache > 0) {
    console.log(`🧹 Cleared ${cleanedScanLogCache} cached scan result notifications. Remaining: ${notifiedScanLogs.size}`);
  }
  
  // Clean expired unsafe URL cache entries
  let cleanedUnsafeCache = 0;
  for (const [normalizedUrl, info] of unsafeUrlCache.entries()) {
    const age = now - (info.timestamp || 0);
    if (age >= UNSAFE_CACHE_DURATION) {
      unsafeUrlCache.delete(normalizedUrl);
      cleanedUnsafeCache++;
    }
  }
  if (cleanedUnsafeCache > 0) {
    console.log(`🧹 Cleared ${cleanedUnsafeCache} expired unsafe URL cache entries. Remaining: ${unsafeUrlCache.size}`);
  }
  
  // Clean old pending navigation blocks (older than 5 minutes)
  const NAVIGATION_BLOCK_EXPIRY = 5 * 60 * 1000; // 5 minutes
  let cleanedNavigationBlocks = 0;
  const navigationBlocksToClean = [];
  for (const [tabId, blockInfo] of pendingNavigationBlocks.entries()) {
    const blockAge = now - (blockInfo.timestamp || 0);
    if (blockAge > NAVIGATION_BLOCK_EXPIRY) {
      navigationBlocksToClean.push({ tabId, blockInfo });
    }
  }
  
  // Check tabs asynchronously and clean up
  for (const { tabId, blockInfo } of navigationBlocksToClean) {
    try {
      const tab = await browserAPI.tabs.get(tabId);
      if (!tab || tab.url === 'about:blank') {
        // Tab doesn't exist or is still on about:blank - clean up
        pendingNavigationBlocks.delete(tabId);
        cleanedNavigationBlocks++;
        // Clear notification if it exists
        if (blockInfo.notificationId) {
          browserAPI.notifications.clear(blockInfo.notificationId).catch(() => {});
        }
      }
    } catch (error) {
      // Tab doesn't exist - remove the block
      pendingNavigationBlocks.delete(tabId);
      cleanedNavigationBlocks++;
      if (blockInfo.notificationId) {
        browserAPI.notifications.clear(blockInfo.notificationId).catch(() => {});
      }
    }
  }
  if (cleanedNavigationBlocks > 0) {
    console.log(`🧹 Cleared ${cleanedNavigationBlocks} expired pending navigation blocks. Remaining: ${pendingNavigationBlocks.size}`);
  }
}, 15000); // Clean up every 15 seconds (less aggressive)

// Monitor scan results and block high-threat websites
async function monitorScanResults() {
  try {
    // Get current active tab
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      return;
    }
    
    const currentTab = tabs[0];
    if (!currentTab.id || !currentTab.url) {
      return;
    }
    
    // Skip browser internal pages
    if (currentTab.url.startsWith('chrome://') || 
        currentTab.url.startsWith('chrome-extension://') ||
        currentTab.url.startsWith('edge://') ||
        currentTab.url.startsWith('about:') ||
        currentTab.url.startsWith('file://')) {
      return;
    }
    
    // REMOVED: Check for notifiedThreatSites - this was preventing notifications for auto page scans
    // We want to show notifications for all auto page scans, not just high-threat sites
    // The notifiedScanLogs check later will prevent duplicates
    
    // Get auth token
    const authResult = await browserAPI.storage.local.get(['auth_token', 'protectionEnabled']);
    if (!authResult.auth_token || authResult.protectionEnabled === false) {
      return;
    }
    
    // Get latest scan result for current URL
    // Check logs directly to find scan result for this URL
    try {
      const API_BASE_URL = 'http://localhost:5000/api';
      
      // First, check if server is available with a quick health check
      // This prevents creating notifications when server is down
      try {
        const healthCheck = await fetch(`${API_BASE_URL.replace('/api', '')}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        if (!healthCheck.ok) {
          // Server is not available - don't make API calls that will fail
          return;
        }
      } catch (healthError) {
        // Server is not available or unreachable - don't proceed with scan checks
        // This prevents "scan failed" notifications when server is down
        return;
      }
      
      const logsResponse = await fetch(`${API_BASE_URL}/logs?type=pages`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authResult.auth_token}`
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (!logsResponse.ok) {
        return;
      }
      
      const logsData = await logsResponse.json();
      if (logsData.success && logsData.logs) {
        // Normalize current tab URL for matching
        const normalizedCurrentUrl = normalizeUrlForAutoScan(currentTab.url);
        
        // Find the most recent log for the current URL (using normalized matching)
        const urlLogs = logsData.logs
          .filter((log) => {
            if (!log.source) return false;
            // Try exact match first
            if (log.source === currentTab.url) return true;
            // Try normalized match
            const normalizedLogSource = normalizeUrlForAutoScan(log.source);
            return normalizedLogSource === normalizedCurrentUrl;
          })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        console.log('📋 Logs check:', {
          totalLogs: logsData.logs.length,
          matchingLogs: urlLogs.length,
          currentUrl: currentTab.url,
          normalizedCurrentUrl,
          sampleLogSources: logsData.logs.slice(0, 3).map(log => ({
            source: log.source,
            normalized: normalizeUrlForAutoScan(log.source || ''),
            matches: normalizeUrlForAutoScan(log.source || '') === normalizedCurrentUrl
          }))
        });
        
        if (urlLogs.length > 0) {
          const latestLog = urlLogs[0];
          const threatLevel = latestLog.threatLevel || 'none';

          const critical = latestLog.details?.alerts?.critical ||
                          latestLog.details?.threatCounts?.critical || 0;
          const high = latestLog.details?.alerts?.high ||
                      latestLog.details?.threatCounts?.high || 0;

          const normalizedLogUrl = normalizeUrlForAutoScan(latestLog.source);
          const normalizedCurrentUrl = normalizeUrlForAutoScan(currentTab.url);
          
          // Check both normalized URLs (log source and current tab URL) for auto page scan history
          const pendingAuto = pendingAutoPageScans.get(normalizedLogUrl) || pendingAutoPageScans.get(normalizedCurrentUrl);
          const historyEntry = autoPageScanHistory.get(normalizedLogUrl) || autoPageScanHistory.get(normalizedCurrentUrl);
          
          // Check if this is an auto page scan - if there's ANY history entry OR pending scan, it's an auto scan
          // Also check if URLs match (with normalization) - if they match and there's a history entry, it's auto
          const isAutoPageScan = Boolean(pendingAuto) || Boolean(historyEntry) || 
                                 (normalizedLogUrl === normalizedCurrentUrl && historyEntry);
          
          // For auto page scans, always notify regardless of status
          const shouldNotifyAuto =
            Boolean(pendingAuto) ||
            Boolean(historyEntry); // ANY history entry means it was an auto scan
          
          console.log('🔍 Scan result check:', {
            currentUrl: currentTab.url,
            logSource: latestLog.source,
            normalizedLogUrl,
            normalizedCurrentUrl,
            urlsMatch: normalizedLogUrl === normalizedCurrentUrl,
            hasPendingAuto: !!pendingAuto,
            hasHistoryEntry: !!historyEntry,
            historyStatus: historyEntry?.status,
            isAutoPageScan,
            shouldNotifyAuto,
            logTimestamp: latestLog.timestamp,
            logResult: latestLog.result
          });

          if (shouldNotifyAuto) {
            pendingAutoPageScans.delete(normalizedLogUrl);
            autoPageScanHistory.set(normalizedLogUrl, {
              timestamp: Date.now(),
              status: latestLog.result || 'unknown',
              tabId: (pendingAuto && pendingAuto.tabId) || historyEntry?.tabId,
              scanId: (pendingAuto && pendingAuto.scanId) || historyEntry?.scanId,
              reason: 'completed',
            });

            try {
              browserAPI.runtime
                .sendMessage({
                  type: 'AUTO_PAGE_SCAN_RESULT',
                  url: latestLog.source,
                  result: latestLog.result,
                  threatLevel: latestLog.threatLevel,
                  critical,
                  high,
                  details: latestLog.details,
                })
                .catch(() => {});
            } catch (error) {
              // Ignore messaging errors
            }
          }
          
          // Check for unsafe conditions - be more lenient to catch all unsafe scans
          const hasCriticalThreats = critical > 0;
          const hasHighThreats = high > 0;
          const logId = latestLog.id || latestLog._id || `${latestLog.source}:${latestLog.timestamp || Date.now()}`;
          
          // Unsafe if:
          // 1. Result is explicitly 'unsafe'
          // 2. Has critical or high threat counts
          // 3. Threat level is critical or high
          // 4. Result is 'infected' (for file scans)
          const isUnsafe = (latestLog.result === 'unsafe') || 
                          (latestLog.result === 'infected') ||
                          hasCriticalThreats || 
                          hasHighThreats || 
                          threatLevel === 'critical' || 
                          threatLevel === 'high';

          // ALWAYS show notification for auto page scan results (both safe and unsafe)
          // For auto page scans, FORCE notification to show (even if we've notified before)
          // For manual scans, only show if we haven't notified for this log ID
          // Use a unique key that includes timestamp to allow re-notifications for auto scans
          const notificationKey = isAutoPageScan 
            ? `auto-${logId}-${latestLog.timestamp || Date.now()}` 
            : logId;
          
          // CRITICAL: Always show notification for unsafe scans, regardless of auto/manual or previous notifications
          // For safe scans, only show for auto page scans or if not already notified
          // For unsafe auto page scans, ALWAYS show (even if we've notified before) - this ensures users see high-threat warnings
          const shouldShowNotification = logId && (
            (isUnsafe && isAutoPageScan) || // Always show unsafe auto page scans (high priority)
            (isUnsafe && !notifiedScanLogs.has(notificationKey)) || // Show unsafe manual scans if not notified
            (isAutoPageScan && !notifiedScanLogs.has(notificationKey)) // Show safe auto page scans if not notified
          );
          
          console.log('🔔 Notification check:', {
            logId,
            notificationKey,
            isAutoPageScan,
            isUnsafe,
            result: latestLog.result,
            threatLevel,
            critical,
            high,
            hasCriticalThreats,
            hasHighThreats,
            shouldShowNotification,
            alreadyNotified: notifiedScanLogs.has(notificationKey),
            willShow: shouldShowNotification,
            hasNotificationsAPI: !!browserAPI.notifications,
            notificationsCreateAvailable: !!(browserAPI.notifications && typeof browserAPI.notifications.create === 'function'),
            reason: isUnsafe && isAutoPageScan ? 'UNSAFE AUTO SCAN - FORCE SHOW' : 
                    isUnsafe ? 'UNSAFE MANUAL SCAN' : 
                    isAutoPageScan ? 'SAFE AUTO SCAN' : 'SAFE MANUAL SCAN'
          });
          
          if (shouldShowNotification) {
            // Mark as notified to prevent duplicates
            notifiedScanLogs.set(notificationKey, Date.now());

            if (browserAPI.notifications && typeof browserAPI.notifications.create === 'function') {
              const displayUrl = latestLog.source && latestLog.source.length > 80
                ? `${latestLog.source.substring(0, 77)}...`
                : (latestLog.source || 'Unknown site');
              const notificationId = `scan-result-${Date.now()}-${logId}`;
              // For auto page scans, make the notification more prominent
              const notificationTitle = isAutoPageScan 
                ? (isUnsafe ? '⚠️ Auto Scan: Unsafe' : '✅ Auto Scan: Safe')
                : (isUnsafe ? '⚠️ Site Scan: Unsafe' : '✅ Site Scan: Safe');
              const threatSummary = isUnsafe
                ? `${critical} critical / ${high} high threats detected.`
                : 'No critical or high threats detected.';
              const notificationOptions = {
                type: 'basic',
                iconUrl: browserAPI.runtime.getURL('logo.png'),
                title: notificationTitle,
                message: `${displayUrl}\n${threatSummary}${isAutoPageScan ? ' (Auto Scan)' : ''}`,
                priority: isUnsafe ? 2 : (isAutoPageScan ? 1 : 0), // Higher priority for auto scans and unsafe results
                requireInteraction: false, // Allow notification to auto-dismiss
              };

              try {
                console.log('📤 Attempting to create notification:', {
                  notificationId,
                  title: notificationTitle,
                  message: notificationOptions.message.substring(0, 50) + '...',
                  isAutoPageScan,
                  hasIcon: !!notificationOptions.iconUrl
                });
                
                if (typeof browser !== 'undefined') {
                  browserAPI.notifications.create(notificationId, notificationOptions).then((createdId) => {
                    if (createdId) {
                      console.log('✅✅✅ Page scan notification CREATED SUCCESSFULLY:', notificationId, notificationTitle);
                      console.log('   Created ID:', createdId);
                    } else {
                      console.error('❌ Notification creation returned no ID');
                    }
                  }).catch((error) => {
                    console.error('❌❌❌ ERROR creating page scan notification:', error);
                    console.error('   Error details:', error.message, error.stack);
                  });
                } else {
                  browserAPI.notifications.create(notificationId, notificationOptions, (createdId) => {
                    const lastError = chrome.runtime && chrome.runtime.lastError;
                    if (lastError) {
                      console.error('❌❌❌ ERROR creating page scan notification:', lastError.message);
                      console.error('   Chrome error code:', lastError);
                    } else if (createdId) {
                      console.log('✅✅✅ Page scan notification CREATED SUCCESSFULLY:', notificationId, notificationTitle);
                      console.log('   Created ID:', createdId);
                    } else {
                      console.error('❌ Notification creation returned no ID (Chrome callback)');
                    }
                  });
                }
              } catch (error) {
                console.error('❌❌❌ EXCEPTION creating page scan notification:', error);
                console.error('   Error type:', error.constructor.name);
                console.error('   Error message:', error.message);
                console.error('   Error stack:', error.stack);
              }
            } else {
              console.warn('⚠️ Notifications API not available');
            }
          } else if (logId && notifiedScanLogs.has(logId)) {
            console.log('ℹ️ Already notified for this scan result:', logId);
          }

          // Send message to popup about scan completion
          try {
            browserAPI.runtime
              .sendMessage({
                type: 'PAGE_SCAN_COMPLETE',
                url: latestLog.source,
                result: latestLog.result,
                threatLevel: latestLog.threatLevel,
                critical,
                high,
                auto: shouldNotifyAuto,
                logId,
                timestamp: latestLog.timestamp,
              })
              .catch(() => {});
          } catch (error) {
            // Ignore messaging errors
          }
          
          // CRITICAL: Update unsafe URL cache for future navigation blocking
          if (isUnsafe && (hasCriticalThreats || hasHighThreats)) {
            const normalizedUrl = normalizeUrlForAutoScan(currentTab.url);
            unsafeUrlCache.set(normalizedUrl, {
              critical,
              high,
              threatLevel,
              timestamp: Date.now()
            });
            console.log(`📝 Added unsafe URL to cache for future blocking: ${normalizedUrl}`);
          }
          
          if ((hasCriticalThreats || hasHighThreats) && !highThreatSites.has(currentTab.id)) {
            // Show notification asking user to block or stay
            const notificationId = `threat-block-${currentTab.id}-${Date.now()}`;
            
            const threatText = hasCriticalThreats ? 'CRITICAL' : 'HIGH';
            const threatCount = hasCriticalThreats ? critical : high;
            
            // Double-check: only show if threatCount > 0
            if (threatCount > 0) {
              browserAPI.notifications.create(notificationId, {
                type: 'basic',
                iconUrl: browserAPI.runtime.getURL('logo.png'),
                title: `⚠️ ${threatText} Threat Detected`,
                message: `This website has ${threatCount} ${threatText.toLowerCase()} threat(s). Block this website?`,
                buttons: [
                  { title: 'Stay on Website' },
                  { title: 'Block & Close Tab' }
                ],
                requireInteraction: true
              }, (createdNotificationId) => {
                if (!browserAPI.runtime.lastError && createdNotificationId) {
                  highThreatSites.set(currentTab.id, {
                    url: currentTab.url,
                    threatLevel: threatLevel,
                    notificationId: createdNotificationId,
                    tabId: currentTab.id,
                    criticalCount: critical,
                    highCount: high
                  });
                  notifiedThreatSites.add(currentTab.url);
                  console.log(`⚠️ High threat detected for ${currentTab.url} (${threatCount} ${threatText.toLowerCase()} threat(s)), showing blocking notification`);
                }
              });
            } else {
              console.log(`ℹ️ Threat level is ${threatLevel} but no actual threats found (critical: ${critical}, high: ${high}) - not showing notification`);
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors - scan might not be available or server is down
      // Don't log or create notifications for network/server errors
      // This prevents "scan failed" notifications when server is not running
      if (error.name !== 'AbortError' && error.name !== 'TypeError') {
        console.log('ℹ️ Could not check scan status (server may be unavailable):', error.message);
      }
    }
  } catch (error) {
    console.error('❌ Error monitoring scan results:', error);
  }
}

// Check for high-threat websites periodically
monitorScanIntervalId = setInterval(() => {
  monitorScanResults();
}, 5000); // Check every 5 seconds

// Stop intervals when service worker is about to be suspended
if (browserAPI.runtime && browserAPI.runtime.onSuspend) {
  browserAPI.runtime.onSuspend.addListener(() => {
    console.log('🛑 Service worker suspending - stopping intervals');
    stopAllIntervals();
    
    // Clear all notifications before suspending
    if (browserAPI.notifications && browserAPI.notifications.getAll) {
      browserAPI.notifications.getAll().then((notifications) => {
        for (const notificationId of Object.keys(notifications)) {
          browserAPI.notifications.clear(notificationId).catch(() => {});
        }
      }).catch(() => {});
    }
  });
}

// Helper function to normalize URL for approved downloads whitelist
function normalizeUrlForApproval(url) {
  try {
    const urlObj = new URL(url);
    // Remove query parameters and fragments for matching
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`.toLowerCase();
  } catch (e) {
    return url.toLowerCase();
  }
}

// Detect suspicious URLs that should be warned about (but not blocked)
// User will decide whether to download based on scan results
function isSuspiciousUrl(url) {
  if (!url || typeof url !== 'string') {
    return false; // Don't mark invalid URLs as suspicious - let scan handle it
  }
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    const search = urlObj.search.toLowerCase();
    
    // Only flag highly suspicious patterns (not all patterns)
    // These are patterns that are commonly used in malicious redirects
    const highlySuspiciousPatterns = [
      // Random character domains with suspicious TLDs (common in malicious redirects)
      /^[a-z0-9]{10,}\.(tk|ml|ga|cf|gq|xyz|top|click|download|stream)$/i,
      
      // Suspicious path patterns with random filenames (common in redirects)
      /\/[a-z0-9]{3,10}\.(htm|html|php)$/i, // Short random filenames like "/mvsY.htm"
      
      // Very long random query parameters (common in redirect chains)
      /[?&](e|k|f|j|l|s|ref|redirect|url|link)=[^&]*[a-z0-9]{30,}/i, // Very long random parameters
    ];
    
    // Check hostname patterns - only flag highly suspicious ones
    for (const pattern of highlySuspiciousPatterns) {
      if (pattern.test(hostname) || pattern.test(pathname) || pattern.test(search)) {
        console.warn(`⚠️ Suspicious URL pattern detected: ${url.substring(0, 100)}`);
        return true;
      }
    }
    
    // Check for excessive query parameters (common in redirect chains)
    const queryParams = urlObj.search.split('&').filter(p => p.includes('='));
    if (queryParams.length > 15) {
      console.warn(`⚠️ Too many query parameters (${queryParams.length}): ${url.substring(0, 100)}`);
      return true;
    }
    
    // Check for suspicious filename patterns in path (only highly suspicious ones)
    const suspiciousFilePatterns = [
      /\/[a-f0-9]{20,}\.(htm|html|php)$/i, // Very long hex-like filenames
    ];
    
    for (const pattern of suspiciousFilePatterns) {
      if (pattern.test(pathname)) {
        console.warn(`⚠️ Suspicious filename pattern: ${url.substring(0, 100)}`);
        return true;
      }
    }
    
    return false;
  } catch (e) {
    // Invalid URL - don't mark as suspicious, let scan handle it
    return false;
  }
}

// Known malicious domains (can be expanded)
const KNOWN_MALICIOUS_DOMAINS = [
  'inpmmuttbev.com',
  // Add more known malicious domains here
];

function isKnownMaliciousDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return KNOWN_MALICIOUS_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch (e) {
    return false;
  }
}

// Store pending downloads that are waiting for user approval after scan
const pendingScanResults = new Map(); // downloadId -> { url, filename, scanResult, suggestCallback }
// Track which downloads have already called suggest() to prevent duplicate calls
const suggestedDownloads = new Set(); // downloadId -> boolean (true if suggest() was called)
// Track which notifications have been processed to prevent duplicate processing
const processedNotifications = new Set(); // notificationId -> boolean (true if notification was processed)
// Track active notifications by downloadId to prevent duplicate notifications
const activeNotificationsByDownloadId = new Map(); // downloadId -> notificationId

// Monitor downloads for security scanning
// CRITICAL: Use onDeterminingFilename to intercept BEFORE download starts
// This blocks the download until we complete the scan
// Check if the API is available before using it
if (browserAPI.downloads && browserAPI.downloads.onDeterminingFilename) {
  // onDeterminingFilename is available (Chrome 94+)
  browserAPI.downloads.onDeterminingFilename.addListener(async (downloadItem, suggest) => {
  try {
    console.log('📥 Download intercepted (BEFORE start):', downloadItem.filename, downloadItem.url, 'ID:', downloadItem.id);
    
    // CRITICAL: Check if we've already handled this download to prevent duplicate suggest() calls
    if (suggestedDownloads.has(downloadItem.id)) {
      console.log('⚠️ Download already processed, ignoring duplicate onDeterminingFilename call:', downloadItem.id);
      return; // Don't call suggest() again - it was already called
    }
    
    // CRITICAL: Mark this download as being processed IMMEDIATELY (synchronously) to prevent race conditions
    // This MUST happen before any async operations so onCreated can detect it
    const downloadLockKey = `lock_${downloadItem.id}`;
    if (pendingScanResults.has(downloadLockKey)) {
      console.log('⚠️ Download already being processed, ignoring duplicate call:', downloadItem.id);
      return;
    }
    
    // Extract download URL (synchronously)
    const downloadUrl = downloadItem.url || downloadItem.finalUrl || '';
    const finalUrl = downloadItem.finalUrl || downloadItem.url || '';
    let fileName = downloadItem.filename || downloadItem.suggestedFilename || '';
    
    // CRITICAL: Store download info IMMEDIATELY (synchronously) so onCreated can detect it
    // This prevents the download from starting before we can cancel it
    pendingScanResults.set(downloadLockKey, { 
      locked: true, 
      timestamp: Date.now(),
      downloadId: downloadItem.id,
      url: downloadUrl,
      filename: fileName
    });
    
    // Also store a placeholder in pendingScanResults with the download ID
    // This allows onCreated to detect it immediately
    pendingScanResults.set(downloadItem.id, {
      url: downloadUrl,
      filename: fileName,
      suggest: null, // Will be set after we create the wrapper
      downloadInfo: { url: downloadUrl, filename: fileName, originalId: downloadItem.id },
      lockKey: downloadLockKey,
      isProcessing: true // Flag to indicate we're processing
    });
    
    // Helper function to safely call suggest() only once
    // IMPORTANT: This must be the ONLY place where suggest() is called for this download
    let suggestCallbackStored = false;
    const callSuggestOnce = (filename) => {
      if (suggestCallbackStored || suggestedDownloads.has(downloadItem.id)) {
        console.warn('⚠️ Attempted to call suggest() multiple times for download:', downloadItem.id);
        return; // Already called, don't call again
      }
      suggestCallbackStored = true;
      suggestedDownloads.add(downloadItem.id);
      try {
        suggest({ filename: filename || downloadItem.filename });
        console.log('✅ suggest() called for download:', downloadItem.id, 'filename:', filename || downloadItem.filename);
        // Remove lock after calling suggest
        pendingScanResults.delete(downloadLockKey);
      } catch (error) {
        console.error('❌ Error calling suggest():', error);
        suggestCallbackStored = false;
        suggestedDownloads.delete(downloadItem.id); // Remove on error so we can retry if needed
        pendingScanResults.delete(downloadLockKey);
      }
    };
    
    // CRITICAL: Store the suggest callback IMMEDIATELY so we can call it later
    // But DO NOT call it yet - we need to block the download until scan completes
    // Wrap it to ensure it's only called once
    let storedSuggestCalled = false;
    const storedSuggestCallback = (filename) => {
      if (storedSuggestCalled) {
        console.warn('⚠️ Stored suggest callback already called for download:', downloadItem.id);
        return;
      }
      storedSuggestCalled = true;
      callSuggestOnce(filename);
    };
    
    // Update the stored callback (we already stored the download info above)
    const existingResult = pendingScanResults.get(downloadItem.id);
    if (existingResult) {
      existingResult.suggest = storedSuggestCallback;
    } else {
      // Fallback: store it again if it wasn't stored
      pendingScanResults.set(downloadItem.id, {
        url: downloadUrl,
        filename: fileName,
        suggest: storedSuggestCallback,
        downloadInfo: { url: downloadUrl, filename: fileName, originalId: downloadItem.id },
        lockKey: downloadLockKey
      });
    }
    
    // Check settings (synchronously if possible, but async is fine - download is blocked until suggest() is called)
    const [protectionResult, scanResult, authResult] = await Promise.all([
      browserAPI.storage.local.get('protectionEnabled'),
      browserAPI.storage.local.get('downloadScanEnabled'),
      browserAPI.storage.local.get('auth_token')
    ]);
    
    // If protection or scan is disabled, allow download immediately
    if (protectionResult.protectionEnabled === false) {
      console.log('🛡️ Protection disabled, allowing download immediately');
      callSuggestOnce(downloadItem.filename);
      return;
    }
    
    if (scanResult.downloadScanEnabled === false) {
      console.log('📥 Download scan disabled, allowing download immediately');
      callSuggestOnce(downloadItem.filename);
      return;
    }
    
    // REMOVED: Approval cache check - files should be scanned EVERY time
    // The user explicitly requested that files be scanned on every download attempt
    // This ensures maximum security and allows re-scanning of files that may have changed
    // on the server or if the user wants to verify the file again
    console.log('🔍 Download will be scanned (no approval cache - scanning every time):', downloadItem.filename);
    
    // If no auth token, block download (don't call suggest())
    if (!authResult.auth_token) {
      console.log('⚠️ No auth token - download blocked');
      browserAPI.notifications.create(`auth-required-${downloadItem.id}-${Date.now()}`, {
        type: 'basic',
        iconUrl: browserAPI.runtime.getURL('logo.png'),
        title: '🔒 Authentication Required',
        message: `Download scanning requires login. Please login to the extension.`,
        buttons: [{ title: 'OK' }]
      });
      // Don't call suggest() - this blocks the download permanently
      // Also mark as handled to prevent duplicate processing
      suggestedDownloads.add(downloadItem.id); // Mark as handled even though we're not calling suggest()
      return;
    }
    
    // CRITICAL: DO NOT call suggest() yet - we need to block the download until scan completes
    // Chrome's onDeterminingFilename has a ~5-10 second timeout
    // If Chrome times out, onCreated will fire and we'll pause the download immediately
    // This ensures the download doesn't actually download until user approves
    console.log('⚠️ Download blocked (suggest() NOT called yet) - will pause if Chrome times out');
    
    // SECURITY: Check for malicious/suspicious URLs - but don't block, just warn
    // We'll let the user decide after the scan completes
    // Only block known malicious domains (hardcoded blacklist)
    if (downloadUrl && isKnownMaliciousDomain(downloadUrl)) {
      console.warn('⚠️ Known malicious domain detected:', downloadUrl);
      // For known malicious domains, we'll still scan but show a warning
      // Don't block automatically - let the scan results guide the decision
    } else if (downloadUrl && isSuspiciousUrl(downloadUrl)) {
      console.warn('⚠️ Suspicious URL pattern detected:', downloadUrl);
      // Mark as suspicious but don't block - proceed with scan
      // User will be warned in the notification
    }
    
    // Settings are already checked above
    // We only reach here if scanning is enabled, user is authenticated, and download is not already approved
    // Download is blocked (suggest() NOT called) until scan completes and user approves
    // If Chrome times out and allows download, onCreated will pause it immediately
    // Proceed with scanning
    
    // Check if this is a user-initiated download
    // Match by exact URL, base URL (without query params), domain + path, or subdomain variations
    let isUserInitiated = false;
    let matchedUrl = null;
    
    // Helper function to extract base domain (e.g., sourceforge.net from downloads.sourceforge.net)
    function getBaseDomain(hostname) {
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        // Return last two parts (e.g., sourceforge.net)
        return parts.slice(-2).join('.');
      }
      return hostname;
    }
    
    // Helper function to normalize URL for matching (protocol + base domain + path)
    function normalizeUrlForMatching(url) {
      try {
        const urlObj = new URL(url);
        const baseDomain = getBaseDomain(urlObj.hostname);
        // Remove leading/trailing slashes from pathname for better matching
        const cleanPath = urlObj.pathname.replace(/^\/+|\/+$/g, '') || '/';
        return `${urlObj.protocol}//${baseDomain}/${cleanPath}`.toLowerCase();
      } catch (e) {
        return url.toLowerCase();
      }
    }
    
    // Try exact match first
    if (userInitiatedDownloads.has(downloadUrl) || userInitiatedDownloads.has(finalUrl)) {
      isUserInitiated = true;
      matchedUrl = downloadUrl;
      console.log('✅ Matched download by exact URL');
    } else {
      // Try matching by normalized URL (handles subdomains, query params, etc.)
      const normalizedDownloadUrl = normalizeUrlForMatching(downloadUrl);
      const normalizedFinalUrl = normalizeUrlForMatching(finalUrl);
      
      // Check all tracked URLs
      const now = Date.now();
      for (const [trackedUrl, timestamp] of userInitiatedDownloads.entries()) {
        try {
          // Try exact match first
          if (trackedUrl === downloadUrl || trackedUrl === finalUrl) {
            isUserInitiated = true;
            matchedUrl = trackedUrl;
            console.log('✅ Matched download by exact tracked URL');
            break;
          }
          
          // Try normalized match (handles subdomains and query params)
          const normalizedTrackedUrl = normalizeUrlForMatching(trackedUrl);
          
          // Check if normalized URLs match (same base domain + path)
          if (normalizedDownloadUrl === normalizedTrackedUrl || normalizedFinalUrl === normalizedTrackedUrl) {
            isUserInitiated = true;
            matchedUrl = trackedUrl;
            console.log('✅ Matched download by normalized URL:', normalizedDownloadUrl);
            break;
          }
          
          // Also check if download path is contained in tracked URL (for cases like sourceforge)
          // E.g., if tracked: "sourceforge.net/projects/mingw/" and download: "downloads.sourceforge.net/project/mingw/Installer/..."
          try {
            const trackedUrlObj = new URL(trackedUrl);
            const downloadUrlObj = new URL(downloadUrl);
            
            // Check if same base domain
            const trackedBaseDomain = getBaseDomain(trackedUrlObj.hostname);
            const downloadBaseDomain = getBaseDomain(downloadUrlObj.hostname);
            
            if (trackedBaseDomain === downloadBaseDomain) {
              // Same base domain - this is likely a user-initiated download
              // This works for ALL websites, not just SourceForge
              const trackedPath = trackedUrlObj.pathname.toLowerCase();
              const downloadPath = downloadUrlObj.pathname.toLowerCase();
              
              console.log('🔍 Matching attempt (same domain):', {
                trackedPath,
                downloadPath,
                trackedBaseDomain,
                downloadBaseDomain,
                trackedUrl: trackedUrl.substring(0, 80),
                downloadUrl: downloadUrl.substring(0, 80),
                timeSinceTracked: now - timestamp
              });
              
              // If download is from a subdomain (downloads.*, cdn.*, files.*, dl.*, etc.)
              // and we tracked a click from the main domain, consider it a match
              const downloadHostname = downloadUrlObj.hostname.toLowerCase();
              const isDownloadSubdomain = downloadHostname.includes('download') || 
                                         downloadHostname.includes('cdn') ||
                                         downloadHostname.includes('files') ||
                                         downloadHostname.includes('static') ||
                                         downloadHostname.includes('assets') ||
                                         downloadHostname.includes('media') ||
                                         downloadHostname.includes('.dl.') || // CDN mirrors like cyfuture.dl.sourceforge.net
                                         downloadHostname.includes('mirror') ||
                                         downloadHostname.includes('cdn-') ||
                                         downloadHostname.startsWith('dl.') ||
                                         downloadHostname.includes('file') ||
                                         downloadHostname.includes('storage');
              
              // If download is from a download subdomain and we tracked the main domain
              if (isDownloadSubdomain) {
                isUserInitiated = true;
                matchedUrl = trackedUrl;
                console.log('✅ Matched download by download subdomain (same base domain):', trackedBaseDomain);
                console.log('   Download subdomain:', downloadHostname);
                break;
              }
              
              // For project-based sites (SourceForge, GitHub, GitLab, etc.)
              const projectMatch = trackedPath.match(/\/(?:projects?|files?|repos?)\/([^\/]+)/);
              const downloadProjectMatch = downloadPath.match(/\/(?:projects?|files?|installer|releases?|downloads?)\/([^\/]+)/);
              
              // Extract project names
              const trackedProjectName = trackedPath.match(/\/(?:projects?|files?|repos?)\/([^\/]+)/)?.[1]?.toLowerCase();
              const downloadProjectName = downloadPath.match(/\/(?:projects?|files?|installer|releases?|downloads?)\/([^\/]+)/)?.[1]?.toLowerCase();
              
              // Check if project names match
              if (trackedProjectName && downloadProjectName && trackedProjectName === downloadProjectName) {
                isUserInitiated = true;
                matchedUrl = trackedUrl;
                console.log('✅ Matched download by project name:', trackedProjectName);
                break;
              }
              
              if (projectMatch && downloadProjectMatch && 
                  projectMatch[1].toLowerCase() === downloadProjectMatch[1].toLowerCase()) {
                isUserInitiated = true;
                matchedUrl = trackedUrl;
                console.log('✅ Matched download by project identifier:', projectMatch[1]);
                break;
              }
              
              // Check if download path contains the project name from tracked URL
              if (trackedProjectName && downloadPath.toLowerCase().includes('/' + trackedProjectName + '/')) {
                isUserInitiated = true;
                matchedUrl = trackedUrl;
                console.log('✅ Matched download by project name in path:', trackedProjectName);
                break;
              }
              
              // For any website: if download path contains tracked path segments
              const trackedPathSegments = trackedPath.split('/').filter(s => s && s !== 'projects' && s !== 'project' && s !== 'files' && s !== 'file' && s !== 'repos' && s !== 'repo');
              const downloadPathSegments = downloadPath.split('/').filter(s => s && s !== 'projects' && s !== 'project' && s !== 'installer' && s !== 'files' && s !== 'file' && s !== 'repos' && s !== 'repo' && s !== 'releases' && s !== 'downloads');
              
              // Check if any significant path segments match
              const matchingSegments = trackedPathSegments.filter(seg => 
                downloadPathSegments.some(dSeg => dSeg.toLowerCase() === seg.toLowerCase())
              );
              
              if (matchingSegments.length > 0 && matchingSegments.length >= Math.min(1, trackedPathSegments.length)) {
                isUserInitiated = true;
                matchedUrl = trackedUrl;
                console.log('✅ Matched download by path segments:', matchingSegments);
                break;
              }
              
              // Generic fallback: if same domain and download happened within expiry window
              // This catches downloads from any website where we tracked a click
              // Only use this if we're confident it's from the same session
              const timeSinceTracked = now - timestamp;
              if (timeSinceTracked < 10000) { // Within 10 seconds
                // Check if the download path looks like a file download (has file extension)
                const hasFileExtension = /\.(exe|dmg|zip|pdf|doc|xls|ppt|mp4|mp3|jpg|png|iso|bin|dll|apk|ipa|msi|deb|rpm|pkg|tar|gz|rar|7z)$/i.test(downloadPath);
                if (hasFileExtension) {
                  isUserInitiated = true;
                  matchedUrl = trackedUrl;
                  console.log('✅ Matched download by same domain + file extension (within 10s):', downloadPath);
                  break;
                }
              }
              
              // Even more generic: if same domain and within 60 seconds, and download has file extension
              // This is a catch-all for any website
              if (timeSinceTracked < 60000) { // Within 60 seconds (increased from 30s)
                const hasFileExtension = /\.(exe|dmg|zip|pdf|doc|xls|ppt|mp4|mp3|jpg|png|iso|bin|dll|apk|ipa|msi|deb|rpm|pkg|tar|gz|rar|7z|txt|csv|json|xml|msix|appx|app|dmg|pkg)$/i.test(downloadPath);
                if (hasFileExtension) {
                  isUserInitiated = true;
                  matchedUrl = trackedUrl;
                  console.log('✅ Matched download by same domain + file extension (within 60s):', downloadPath);
                  console.log('   Time since click:', Math.round(timeSinceTracked / 1000), 'seconds');
                  break;
                }
              }
              
              // Ultimate fallback: if same domain and download path contains common download indicators
              // This catches downloads that might not have file extensions but are clearly downloads
              if (timeSinceTracked < 60000) { // Within 60 seconds
                const downloadPathLower = downloadPath.toLowerCase();
                const hasDownloadIndicator = downloadPathLower.includes('/download') ||
                                           downloadPathLower.includes('/file') ||
                                           downloadPathLower.includes('/get') ||
                                           downloadPathLower.includes('/dl') ||
                                           downloadPathLower.includes('/installer') ||
                                           downloadPathLower.includes('/setup') ||
                                           downloadPathLower.includes('/release') ||
                                           downloadPathLower.includes('/archive');
                
                if (hasDownloadIndicator) {
                  isUserInitiated = true;
                  matchedUrl = trackedUrl;
                  console.log('✅ Matched download by same domain + download indicator (within 60s):', downloadPath);
                  console.log('   Time since click:', Math.round(timeSinceTracked / 1000), 'seconds');
                  break;
                }
              }
            }
            
            // Also check if tracked URL is just the domain root (domain-wide tracking)
            // This allows matching any download from a domain where we tracked a click
            try {
              const trackedBaseDomainOnly = getBaseDomain(trackedUrlObj.hostname);
              const domainRoot1 = `${trackedUrlObj.protocol}//${trackedBaseDomainOnly}`;
              const domainRoot2 = `${trackedUrlObj.protocol}//${trackedBaseDomainOnly}/`;
              
              if (trackedUrl === domainRoot1 || trackedUrl === domainRoot2) {
                // We tracked a click on the domain root - match any download from that domain
                if (trackedBaseDomain === downloadBaseDomain) {
                  const timeSinceTracked = now - timestamp;
                  if (timeSinceTracked < 60000) { // Within 60 seconds (increased from 30s)
                    // Check if download has file extension or download indicator
                    const hasFileExtension = /\.(exe|dmg|zip|pdf|doc|xls|ppt|mp4|mp3|jpg|png|iso|bin|dll|apk|ipa|msi|deb|rpm|pkg|tar|gz|rar|7z|txt|csv|json|xml|msix|appx|app)$/i.test(downloadPath);
                    const downloadPathLower = downloadPath.toLowerCase();
                    const hasDownloadIndicator = downloadPathLower.includes('/download') ||
                                               downloadPathLower.includes('/file') ||
                                               downloadPathLower.includes('/get') ||
                                               downloadPathLower.includes('/dl') ||
                                               downloadPathLower.includes('/installer') ||
                                               downloadPathLower.includes('/setup');
                    
                    if (hasFileExtension || hasDownloadIndicator) {
                      isUserInitiated = true;
                      matchedUrl = trackedUrl;
                      console.log('✅ Matched download by domain root tracking (within 60s):', trackedBaseDomain);
                      console.log('   Time since click:', Math.round(timeSinceTracked / 1000), 'seconds');
                      break;
                    }
                  }
                }
              }
            } catch (e) {
              // Ignore errors in domain root check
              console.log('⚠️ Error in domain root check:', e);
            }
          } catch (e) {
            // URL parsing failed, skip this check
            continue;
          }
        } catch (e) {
          // Invalid URL in tracking, skip
          continue;
        }
      }
    }
    
    if (!isUserInitiated) {
      // This might be an automatic download, but let's be more aggressive in matching
      // Check if we have any tracked URLs from the same domain
      try {
        const downloadUrlObj = new URL(downloadUrl);
        const downloadBaseDomain = getBaseDomain(downloadUrlObj.hostname);
        const downloadPath = downloadUrlObj.pathname.toLowerCase();
        
        // Check if any tracked URL is from the same domain
        const sameDomainTracked = Array.from(userInitiatedDownloads.entries()).find(([trackedUrl, timestamp]) => {
          try {
            const trackedUrlObj = new URL(trackedUrl);
            const trackedBaseDomain = getBaseDomain(trackedUrlObj.hostname);
            return trackedBaseDomain === downloadBaseDomain;
          } catch (e) {
            return false;
          }
        });
        
        // If we found a same-domain tracked URL and it's recent (within 60 seconds)
        if (sameDomainTracked) {
          const [trackedUrl, timestamp] = sameDomainTracked;
          const timeSinceTracked = Date.now() - timestamp;
          
          if (timeSinceTracked < 60000) { // Within 60 seconds
            // Check if download has a file extension (likely a real download)
            const hasFileExtension = /\.(exe|dmg|zip|pdf|doc|xls|ppt|mp4|mp3|jpg|png|iso|bin|dll|apk|ipa|msi|deb|rpm|pkg|tar|gz|rar|7z|txt|csv|json|xml|msix|appx|app)$/i.test(downloadPath);
            
            if (hasFileExtension) {
              // This is likely a user-initiated download from the same domain
              isUserInitiated = true;
              matchedUrl = trackedUrl;
              console.log('✅ Matched download by same domain + file extension (aggressive matching):', downloadBaseDomain);
              console.log('   Time since click:', Math.round(timeSinceTracked / 1000), 'seconds');
            }
          }
        }
      } catch (e) {
        // URL parsing failed, continue with normal flow
        console.log('⚠️ Could not parse download URL for aggressive matching:', e);
      }
    }
    
    if (!isUserInitiated) {
      // Automatic download: proceed with the same hold-and-scan flow (no interim UI)
      console.log('ℹ️ Automatic download detected (not user-initiated), scanning silently:', downloadItem.filename);
      // Do not return here—fall through to the scanning pipeline
    }
    
    // Remove from user-initiated set (already processed)
    // Remove all variations that might match
    if (matchedUrl) {
      userInitiatedDownloads.delete(matchedUrl);
      // Also try to remove variations
      try {
        const urlObj = new URL(matchedUrl);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        userInitiatedDownloads.delete(baseUrl);
        const hostnameParts = urlObj.hostname.split('.');
        if (hostnameParts.length >= 2) {
          const baseDomain = hostnameParts.slice(-2).join('.');
          const baseDomainUrl = `${urlObj.protocol}//${baseDomain}${urlObj.pathname}`;
          userInitiatedDownloads.delete(baseDomainUrl);
        }
      } catch (e) {
        // Ignore
      }
    } else {
      userInitiatedDownloads.delete(downloadUrl);
      userInitiatedDownloads.delete(finalUrl);
    }
    
    console.log('✅ Proceeding with download scan');
    
    // Extract and validate download item data
    // Note: fileName was already declared above (line 671) - reuse it
    // CRITICAL: Prefer finalUrl over url - finalUrl is the actual file URL after redirects
    // url might be a redirect URL that points to an HTML page
    let fileUrl = downloadItem.finalUrl || downloadItem.url;
    // fileName is already declared above and will be sanitized below
    const mimeType = downloadItem.mime || '';
    
    // Begin a silent hold period; scan will complete before we show any UI
    const holdStartedAt = Date.now();

    // Prepare download info for later use
    // Store both url and finalUrl so we can use the best one when re-initiating
    const downloadInfo = {
      url: fileUrl, // Use finalUrl if available (actual file URL after redirects)
      originalUrl: downloadItem.url, // Store original URL for reference
      finalUrl: downloadItem.finalUrl, // Store final URL (after redirects)
      filename: fileName,
      originalId: downloadItem.id
    };
    
    // Check if URL is valid (must be HTTP/HTTPS, not blob: or data:)
    if (!fileUrl || (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://'))) {
      console.log('⚠️ Cannot scan non-HTTP download:', fileUrl);
      // For non-HTTP downloads, show notification asking user to allow/block
      // Store a safe wrapped suggest callback to call later after user decision
      let nonHttpSuggestCalled = false;
      const safeNonHttpSuggest = (filename) => {
        if (nonHttpSuggestCalled || suggestedDownloads.has(downloadItem.id)) {
          console.warn('⚠️ Attempted to call non-HTTP suggest() multiple times:', downloadItem.id);
          return;
        }
        nonHttpSuggestCalled = true;
        suggestedDownloads.add(downloadItem.id);
        try {
          suggest({ filename: filename || downloadItem.filename });
          console.log('✅ Non-HTTP suggest() called for download:', downloadItem.id);
        } catch (error) {
          console.error('❌ Error calling non-HTTP suggest():', error);
          nonHttpSuggestCalled = false;
          suggestedDownloads.delete(downloadItem.id);
        }
      };
      
      const notificationId = `download-nonhttp-${downloadItem.id}-${Date.now()}`;
      pendingScanResults.set(downloadItem.id, {
        url: fileUrl,
        filename: downloadItem.filename,
        suggest: safeNonHttpSuggest,
        notificationId: notificationId
      });
      browserAPI.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: browserAPI.runtime.getURL('logo.png'),
        title: '⚠️ Cannot Scan Download',
        message: `Cannot scan "${downloadItem.filename}" (non-HTTP download). Allow download?`,
        buttons: [
          { title: 'Yes, Allow' },
          { title: 'No, Block' }
        ],
        requireInteraction: true
      }, (createdNotificationId) => {
        if (!browserAPI.runtime.lastError && createdNotificationId) {
          pendingDownloads.set(createdNotificationId, {
            downloadId: downloadItem.id,
            url: fileUrl,
            filename: downloadItem.filename,
            needsUserPermission: true,
            nonHttpDownload: true
          });
        }
      });
      // Don't call suggest() yet - wait for user decision
      return;
    }
    
    // Detect and skip intermediate HTML/text files (download pages, redirects, etc.)
    // These are typically not the actual files users want to download
    const isIntermediateFile = (() => {
      const lowerFileName = (fileName || '').toLowerCase();
      const lowerUrl = (fileUrl || '').toLowerCase();
      const lowerMime = (mimeType || '').toLowerCase();
      
      // Check filename patterns for intermediate pages
      const intermediatePatterns = [
        'download.htm', 'download.html', 'download.php', 'download.asp', 'download.aspx',
        'download.jsp', 'download.cgi', 'file.htm', 'file.html', 'redirect.htm', 'redirect.html',
        'link.htm', 'link.html', 'getfile.htm', 'getfile.html', 'getdownload.htm', 'getdownload.html'
      ];
      
      // Check if filename matches intermediate patterns
      if (intermediatePatterns.some(pattern => lowerFileName.includes(pattern))) {
        return true;
      }
      
      // Check MIME type - skip HTML/text files that are likely intermediate pages
      // But allow actual HTML/text files that users might want (like .html, .txt, .xml, etc.)
      if (lowerMime.includes('text/html') && (
        lowerFileName.endsWith('.htm') || 
        lowerFileName.endsWith('.html') ||
        lowerFileName === '' || 
        !lowerFileName.includes('.')
      )) {
        // It's an HTML file, but check if it's clearly an intermediate page
        // If filename is generic like "download" or URL contains download redirect patterns
        if (lowerFileName === 'download' || 
            lowerFileName === 'file' ||
            lowerUrl.includes('/download') ||
            lowerUrl.includes('/getfile') ||
            lowerUrl.includes('/redirect')) {
          return true;
        }
      }
      
      // Allow all other files to be scanned (PDF, MP4, MOV, EXE, ZIP, etc.)
      return false;
    })();
    
    if (isIntermediateFile) {
      console.log('⚠️ Skipping intermediate file (likely download page):', fileName);
      console.log('   URL:', fileUrl);
      console.log('   MIME:', mimeType);
      // Allow intermediate files to proceed without scanning
      // The actual file download will be caught separately
      callSuggestOnce(downloadItem.filename);
      return;
    }
    
    // Extract and sanitize filename
    // Filename might be a full path on Windows/Mac, extract just the name
    if (fileName) {
      // Extract filename from path (handle Windows \ and Unix / paths)
      const pathParts = fileName.replace(/\\/g, '/').split('/');
      fileName = pathParts[pathParts.length - 1];
    }
    
    // If still no filename, extract from URL
    if (!fileName || fileName.trim() === '' || fileName === 'unknown_file') {
      console.warn('⚠️ Download has no filename, extracting from URL');
      try {
        const urlObj = new URL(fileUrl);
        const urlPath = urlObj.pathname;
        const urlFileName = urlPath.split('/').pop() || 'download';
        // Decode URL-encoded filename
        fileName = decodeURIComponent(urlFileName);
        // If still no extension, try to get from Content-Disposition header or use default
        if (!fileName.includes('.') && !fileName.includes('%')) {
          fileName = urlFileName.includes('.') ? urlFileName : 'download.bin';
        }
      } catch (e) {
        console.warn('⚠️ Could not extract filename from URL:', e);
        fileName = 'download.bin';
      }
    }
    
    // Sanitize filename: remove invalid characters and limit length
    // Remove path separators and invalid filename characters
    fileName = fileName.replace(/[<>:"|?*\x00-\x1f]/g, '_');
    // Limit filename length (max 255 chars)
    if (fileName.length > 255) {
      const ext = fileName.substring(fileName.lastIndexOf('.'));
      const name = fileName.substring(0, 255 - ext.length);
      fileName = name + ext;
    }
    
    // Ensure filename is not empty
    if (!fileName || fileName.trim() === '') {
      fileName = 'download.bin';
    }
    
    // Validate URL is properly formatted
    try {
      new URL(fileUrl);
    } catch (e) {
      console.error('❌ Invalid file URL format:', fileUrl);
      // For invalid URLs, show notification asking user to allow/block
      // Store a safe wrapped suggest callback to call later after user decision
      let invalidUrlSuggestCalled = false;
      const safeInvalidUrlSuggest = (filename) => {
        if (invalidUrlSuggestCalled || suggestedDownloads.has(downloadItem.id)) {
          console.warn('⚠️ Attempted to call invalid URL suggest() multiple times:', downloadItem.id);
          return;
        }
        invalidUrlSuggestCalled = true;
        suggestedDownloads.add(downloadItem.id);
        try {
          suggest({ filename: filename || downloadItem.filename });
          console.log('✅ Invalid URL suggest() called for download:', downloadItem.id);
        } catch (error) {
          console.error('❌ Error calling invalid URL suggest():', error);
          invalidUrlSuggestCalled = false;
          suggestedDownloads.delete(downloadItem.id);
        }
      };
      
      const notificationId = `download-invalid-${downloadItem.id}-${Date.now()}`;
      pendingScanResults.set(downloadItem.id, {
        url: fileUrl,
        filename: downloadItem.filename,
        suggest: safeInvalidUrlSuggest,
        notificationId: notificationId
      });
      browserAPI.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: browserAPI.runtime.getURL('logo.png'),
        title: '⚠️ Cannot Scan Download',
        message: `Invalid URL for "${downloadItem.filename}". Allow download?`,
        buttons: [
          { title: 'Yes, Allow' },
          { title: 'No, Block' }
        ],
        requireInteraction: true
      }, (createdNotificationId) => {
        if (!browserAPI.runtime.lastError && createdNotificationId) {
          pendingDownloads.set(createdNotificationId, {
            downloadId: downloadItem.id,
            url: fileUrl,
            filename: downloadItem.filename,
            needsUserPermission: true,
            invalidUrl: true
          });
        }
      });
      // Don't call suggest() yet - wait for user decision
      return;
    }
    
    console.log('🔍 Validated download:', {
      url: fileUrl.substring(0, 100),
      filename: fileName,
      size: downloadItem.totalBytes || 'unknown',
      mime: downloadItem.mime || 'unknown'
    });
    
    // Update download info with final values
    downloadInfo.url = fileUrl;
    downloadInfo.filename = fileName;
    
    // Store a wrapped suggest callback that can only be called once
    // This prevents the "suggestCallback may not be called more than once" error
    let suggestCalled = false;
    const safeSuggest = (filename) => {
      if (suggestCalled) {
        console.warn('⚠️ Attempted to call stored suggest() callback multiple times for download:', downloadItem.id);
        return;
      }
      if (suggestedDownloads.has(downloadItem.id)) {
        console.warn('⚠️ Download already marked as suggested, ignoring callback:', downloadItem.id);
        return;
      }
      suggestCalled = true;
      suggestedDownloads.add(downloadItem.id);
      try {
        suggest({ filename: filename || fileName || downloadItem.filename });
        console.log('✅ Stored suggest() callback called for download:', downloadItem.id);
      } catch (error) {
        console.error('❌ Error calling stored suggest() callback:', error);
        suggestCalled = false; // Allow retry on error
        suggestedDownloads.delete(downloadItem.id);
      }
    };
    
    // Store the wrapped suggest callback so we can call it after scan completes and user approves
    // CRITICAL: Mark scan as in progress IMMEDIATELY so onCreated knows it's been triggered
    pendingScanResults.set(downloadItem.id, {
      url: fileUrl,
      filename: fileName,
      suggest: safeSuggest,
      downloadInfo: downloadInfo,
      scanInProgress: false, // Will be set to true when scan API is called
      scanCompleted: false
    });
    
    // Store fileName in a way that's accessible in catch block
    const finalFileName = fileName;
    
    // Call scan API
    const API_BASE_URL = 'http://localhost:5000/api';
    
    // Auth token is already retrieved above (line 636) - use it directly
    // Note: authResult is from the Promise.all() call at line 633
    const authToken = authResult.auth_token;
        
    try {
      // CRITICAL: Mark scan as in progress BEFORE making the API call
      // This ensures onCreated knows the scan was triggered even if Chrome times out
      const currentScanResult = pendingScanResults.get(downloadItem.id);
      if (currentScanResult) {
        currentScanResult.scanInProgress = true;
        pendingScanResults.set(downloadItem.id, currentScanResult);
      }
      
      // First, check if server is available before attempting scan
      // This prevents "scan failed" notifications when server is not running
      try {
        const healthCheck = await fetch(`${API_BASE_URL.replace('/api', '')}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        if (!healthCheck.ok) {
          // Server is not available - don't attempt scan, just allow download
          console.warn('⚠️ Server not available, allowing download without scan');
          if (safeSuggest) {
            safeSuggest();
          }
          pendingScanResults.delete(downloadItem.id);
          return;
        }
      } catch (healthError) {
        // Server is not available or unreachable - don't attempt scan
        console.warn('⚠️ Server not reachable, allowing download without scan:', healthError.message);
        if (safeSuggest) {
          safeSuggest();
        }
        pendingScanResults.delete(downloadItem.id);
        return;
      }
      
      console.log('📡 Sending scan request:', { fileUrl: fileUrl.substring(0, 100), fileName: finalFileName });
      
      // Create AbortController for timeout
      // Scan can take up to 90 seconds (30s download + 60s scan for very large files)
      const SCAN_REQUEST_TIMEOUT = 120000; // 120 seconds (2 minutes) - enough for download + scan
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error(`⏱️ Scan request timeout after ${SCAN_REQUEST_TIMEOUT/1000}s`);
        controller.abort();
      }, SCAN_REQUEST_TIMEOUT);
      
      const response = await fetch(`${API_BASE_URL}/scan/download`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            fileUrl: fileUrl,
            fileName: fileName
          }),
          signal: controller.signal // Add abort signal for timeout
      });
      
      // Clear timeout if request completes
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Handle 401 Unauthorized specifically
        if (response.status === 401) {
          console.error('❌ Authentication error: 401 - Token may be invalid or expired');
          
          // Clear invalid token
          try {
            await browserAPI.storage.local.remove(['auth_token', 'user']);
            console.log('🔒 Cleared invalid auth token');
          } catch (e) {
            console.error('❌ Error clearing auth token:', e);
          }
          
          // Show user-friendly notification
          const notificationId = `auth-error-${downloadItem.id}-${Date.now()}`;
          browserAPI.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: browserAPI.runtime.getURL('logo.png'),
            title: '🔒 Authentication Required',
            message: `Please login to the extension to enable download scanning. Download will be blocked for security.`,
            buttons: [{ title: 'OK' }],
            requireInteraction: true
          });
          
          // Block download for security (can't scan without auth)
          // Don't call suggest() - this blocks the download permanently
          pendingScanResults.delete(downloadItem.id);
          return;
        }
        
        // Try to get error message from response
        let errorMessage = `Scan API returned ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          console.error('❌ API Error Response:', errorData);
        } catch (e) {
          // Response might not be JSON
          const text = await response.text();
          console.error('❌ API Error Response (text):', text);
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('🔍 Scan result received:');
      console.log('   Status:', data.status);
      console.log('   Success:', data.success);
      console.log('   Message:', data.message);
      console.log('   Threats:', data.threats || 'none');
      console.log('   Allow download:', data.allowDownload !== false);
      console.log('   Full response:', JSON.stringify(data, null, 2));
      
      // Get the stored suggest callback
      const scanResult = pendingScanResults.get(downloadItem.id);
      if (!scanResult) {
        console.error('❌ No scan result found for download:', downloadItem.id);
        return;
      }
      
      // If suggest callback is null, it means the download was cancelled and needs re-initiation
      // The scan should still continue - we'll handle re-initiation after user approves
      if (!scanResult.suggest && !scanResult.needsReinitiate) {
        console.error('❌ No suggest callback and not marked for re-initiation:', downloadItem.id);
        // Mark as needing re-initiation
        scanResult.needsReinitiate = true;
      }
      
      // Check if this is an intermediate file (download page)
      if (data.isIntermediate) {
        console.log('ℹ️ Intermediate file detected, allowing download automatically');
        // Allow intermediate files to proceed without user interaction
        // These are just download pages, not the actual files
        if (scanResult.suggest) {
          // Use the stored safe suggest callback if available
          scanResult.suggest(downloadItem.filename);
        } else if (scanResult.needsReinitiate) {
          // Download was cancelled, re-initiate it
          if (scanResult.url && browserAPI.downloads && browserAPI.downloads.download) {
            try {
              const downloadParams = { url: scanResult.url, saveAs: false };
              if (scanResult.filename) downloadParams.filename = scanResult.filename;
              
              if (typeof browser !== 'undefined') {
                await browserAPI.downloads.download(downloadParams);
              } else {
                await new Promise((resolve, reject) => {
                  browserAPI.downloads.download(downloadParams, (downloadId) => {
                    const lastError = chrome.runtime.lastError;
                    if (lastError) {
                      // Filter out the harmless HEAD request warning
                      const errorMsg = lastError.message;
                      if (errorMsg && errorMsg.includes('Could not determine file size from HEAD request')) {
                        console.log('   ℹ️ Chrome warning about HEAD request (harmless - using default timeout)');
                        // This is just a warning, not an error - continue with download
                        if (downloadId !== undefined) {
                          resolve(downloadId);
                          return;
                        }
                      }
                      reject(new Error(errorMsg));
                    } else {
                      resolve(downloadId);
                    }
                  });
                });
              }
              console.log('✅ Re-initiated intermediate file download');
            } catch (error) {
              console.error('❌ Could not re-initiate intermediate file download:', error);
            }
          }
        }
        pendingScanResults.delete(downloadItem.id);
        if (scanResult.lockKey) {
          pendingScanResults.delete(scanResult.lockKey);
        }
        return;
      }
      
      // Handle scan result
      // Ensure minimum hold time before showing result UI
      {
        const elapsed = Date.now() - holdStartedAt;
        const remaining = MIN_HOLD_MS - elapsed;
        if (remaining > 0) {
          try { await delay(remaining); } catch {}
        }
      }

      // Check if URL was suspicious
      const wasSuspiciousUrl = downloadUrl && (isKnownMaliciousDomain(downloadUrl) || isSuspiciousUrl(downloadUrl));
      
      if (data.status === 'infected' || data.status === 'unsafe') {
        // File is infected/unsafe - ASK USER what to do (don't auto-block)
        // CRITICAL: Check if notification already exists for this download to prevent duplicates
        if (activeNotificationsByDownloadId.has(downloadItem.id)) {
          console.log('⚠️ Notification already exists for this download, skipping duplicate:', downloadItem.id);
          return; // Don't create duplicate notification
        }
        
        const threatList = data.threats && data.threats.length > 0 
          ? data.threats.join(', ') 
          : 'malware/threats';
        
        const notificationId = `download-unsafe-${downloadItem.id}-${Date.now()}`;
        
        // Use finalFileName for display (properly extracted filename)
        const displayFileName = finalFileName || scanResult?.filename || downloadItem.filename || 'file';
        
        // Build warning message
        let warningMessage = `"${displayFileName}" has been scanned and found to be UNSAFE. Threats detected: ${threatList}.`;
        if (wasSuspiciousUrl) {
          warningMessage += ' The download URL also appears suspicious.';
        }
        warningMessage += ' Do you want to download this file anyway?';
        
        try {
          browserAPI.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: browserAPI.runtime.getURL('logo.png'),
            title: '⚠️ File Scanned: UNSAFE',
            message: warningMessage,
            buttons: [
              { title: 'Yes, Download Anyway' },
              { title: 'No, Block Download' }
            ],
            requireInteraction: true
          }, (createdNotificationId) => {
            const lastError = (typeof browser !== 'undefined' ? browser.runtime.lastError : chrome.runtime.lastError);
            if (!lastError && createdNotificationId) {
              // Track active notification to prevent duplicates
              activeNotificationsByDownloadId.set(downloadItem.id, createdNotificationId);
              
              // Store notification ID mapping to download ID for button click handling
              pendingDownloads.set(createdNotificationId, {
                downloadId: downloadItem.id,
                url: downloadInfo.url || scanResult?.url || fileUrl,
                filename: displayFileName,
                scanStatus: 'unsafe',
                threats: threatList,
                wasSuspiciousUrl: wasSuspiciousUrl
              });
              console.log('✅ Unsafe notification created:', createdNotificationId);
              console.log('   Filename:', displayFileName);
            } else {
              // If notification fails, ask user what to do (don't auto-block)
              console.warn('⚠️ Notification creation failed, but not blocking - user should decide');
            }
          });
        } catch (error) {
          console.error('❌ Error creating unsafe notification:', error);
          // Don't auto-block - show a simpler notification or log error
          console.warn('⚠️ Could not create notification, but download is still pending user decision');
        }
        
        console.log('⚠️ Download marked as UNSAFE - asking user:', threatList);
        
        // Notify popup that download scan completed (so it can refresh logs)
        try {
          browserAPI.runtime.sendMessage({
            type: 'DOWNLOAD_SCAN_COMPLETE',
            status: 'unsafe',
            filename: displayFileName
          }).catch(() => {
            // Ignore errors - popup might not be open
          });
        } catch (e) {
          // Ignore - popup might not be open
        }
      } else if (data.status === 'timeout') {
        // Scan timeout - scan is taking too long
        // Allow download but warn user that scan may not be complete
        // CRITICAL: Check if notification already exists for this download to prevent duplicates
        if (activeNotificationsByDownloadId.has(downloadItem.id)) {
          console.log('⚠️ Notification already exists for this download, skipping duplicate:', downloadItem.id);
          return; // Don't create duplicate notification
        }
        
        console.log('⏱️ Scan timeout - allowing download with warning');
        const notificationId = `download-timeout-${downloadItem.id}-${Date.now()}`;
        
        // Get the filename to display
        const displayFileName = finalFileName || 
                                scanResult.filename ||
                                downloadItem.filename || 
                                downloadItem.suggestedFilename || 
                                'file';
        
        try {
          browserAPI.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: browserAPI.runtime.getURL('logo.png'),
            title: '⏱️ Scan Timeout',
            message: `Scan is taking longer than expected for "${displayFileName}". Download allowed but file may not be fully scanned. Do you want to download?`,
            buttons: [
              { title: 'Yes, Download' },
              { title: 'No, Cancel' }
            ],
            requireInteraction: true
          }, (createdNotificationId) => {
            const lastError = (typeof browser !== 'undefined' ? browser.runtime.lastError : chrome.runtime.lastError);
            if (!lastError && createdNotificationId) {
              // Track active notification to prevent duplicates
              activeNotificationsByDownloadId.set(downloadItem.id, createdNotificationId);
              pendingDownloads.set(createdNotificationId, {
                downloadId: downloadItem.id,
                url: downloadInfo.url || scanResult.url,
                filename: displayFileName,
                scanTimeout: true,
                scanStatus: 'timeout'
              });
            } else {
              console.warn('⚠️ Notification creation failed for timeout, blocking download for safety');
              pendingScanResults.delete(downloadItem.id);
            }
          });
        } catch (error) {
          console.error('❌ Error creating timeout notification:', error);
          // Don't call suggest() - block download if notification fails
          console.warn('⚠️ Could not create timeout notification, blocking download for safety');
          pendingScanResults.delete(downloadItem.id);
        }
      } else if (data.status === 'error') {
        // Scan failed - ask user what to do
        // CRITICAL: Check if notification already exists for this download to prevent duplicates
        if (activeNotificationsByDownloadId.has(downloadItem.id)) {
          console.log('⚠️ Notification already exists for this download, skipping duplicate:', downloadItem.id);
          return; // Don't create duplicate notification
        }
        
        console.log('⚠️ Scan failed:', data.error);
        console.log('📢 Creating error notification for user decision');
        
        // Notify popup that download scan completed (even if failed, so it can refresh logs)
        try {
          browserAPI.runtime.sendMessage({
            type: 'DOWNLOAD_SCAN_COMPLETE',
            status: 'error',
            filename: downloadItem.filename
          }).catch(() => {
            // Ignore errors - popup might not be open
          });
        } catch (e) {
          // Ignore - popup might not be open
        }
        const notificationId = `download-error-${downloadItem.id}-${Date.now()}`;
        
        // Get the filename to display
        const displayFileName = finalFileName || 
                                scanResult.filename ||
                                downloadItem.filename || 
                                downloadItem.suggestedFilename || 
                                'file';
        
        console.log('📢 Creating error notification:', {
          notificationId,
          filename: displayFileName,
          error: data.error,
          downloadId: downloadItem.id
        });
        
        try {
          browserAPI.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: browserAPI.runtime.getURL('logo.png'),
            title: '⚠️ Scan Failed',
            message: `Could not scan "${displayFileName}". ${data.message || 'Scan service unavailable'}. Allow download anyway?`,
            buttons: [
              { title: 'Yes, Allow' },
              { title: 'No, Block' }
            ],
            requireInteraction: true
          }, (createdNotificationId) => {
            const lastError = (typeof browser !== 'undefined' ? browser.runtime.lastError : chrome.runtime.lastError);
            if (lastError) {
              console.error('❌ Error creating error notification:', lastError.message);
              pendingScanResults.delete(downloadItem.id);
            } else {
              console.log('✅ Error notification created successfully:', createdNotificationId);
            }
            if (!lastError && createdNotificationId) {
              // Track active notification to prevent duplicates
              activeNotificationsByDownloadId.set(downloadItem.id, createdNotificationId);
              pendingDownloads.set(createdNotificationId, {
                downloadId: downloadItem.id,
                url: downloadInfo.url || scanResult.url || downloadItem.url || downloadItem.finalUrl,
                filename: displayFileName,
                scanFailed: true,
                error: data.error,
                scanStatus: 'error'
              });
            } else {
              // If notification fails, don't call suggest() - block download for safety
              console.warn('⚠️ Notification creation failed, blocking download for safety');
              pendingScanResults.delete(downloadItem.id);
            }
          });
        } catch (error) {
          console.error('❌ Error creating error notification:', error);
          // Don't call suggest() - block download if notification fails
          console.warn('⚠️ Could not create error notification, blocking download for safety');
          pendingScanResults.delete(downloadItem.id);
        }
      } else if (data.status === 'clean' || data.status === 'safe') {
        // File is safe - ask user for permission with clear status (don't auto-resume)
        // CRITICAL: Check if notification already exists for this download to prevent duplicates
        if (activeNotificationsByDownloadId.has(downloadItem.id)) {
          console.log('⚠️ Notification already exists for this download, skipping duplicate:', downloadItem.id);
          return; // Don't create duplicate notification
        }
        
        const notificationId = `download-safe-${downloadItem.id}-${Date.now()}`;
        
        // Use finalFileName for display (properly extracted filename)
        const displayFileName = finalFileName || scanResult?.filename || downloadItem.filename || 'file';
        
        try {
          browserAPI.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: browserAPI.runtime.getURL('logo.png'),
            title: '✅ File Scanned: SAFE',
            message: `"${displayFileName}" has been scanned and found to be SAFE. Do you want to download this file?`,
            buttons: [
              { title: 'Yes, Download' },
              { title: 'No, Cancel' }
            ],
            requireInteraction: true
          }, (createdNotificationId) => {
            // Store mapping for button click
            const lastError = (typeof browser !== 'undefined' ? browser.runtime.lastError : chrome.runtime.lastError);
            if (!lastError && createdNotificationId) {
              // Track active notification to prevent duplicates
              activeNotificationsByDownloadId.set(downloadItem.id, createdNotificationId);
              pendingDownloads.set(createdNotificationId, {
                downloadId: downloadItem.id,
                url: downloadInfo.url || scanResult?.url || fileUrl || downloadItem.url || downloadItem.finalUrl,
                filename: displayFileName,
                scanPassed: true,
                scanStatus: 'safe'
              });
              console.log('📋 Safe file permission notification created:', createdNotificationId);
              console.log('   Filename:', displayFileName);
            } else {
              console.error('❌ Error creating notification:', lastError);
              // If notification creation fails, don't call suggest() - block download for safety
              console.log('⚠️ Notification creation failed, blocking download for safety');
              pendingScanResults.delete(downloadItem.id);
            }
          });
        } catch (error) {
          console.error('❌ Error creating safe notification:', error);
          // Don't call suggest() - block download if notification fails
          console.warn('⚠️ Could not create safe notification, blocking download for safety');
          pendingScanResults.delete(downloadItem.id);
        }
        
        // Don't automatically call suggest() - wait for user permission
        console.log('✅ File scanned and found SAFE - waiting for user permission to download');
        
        // Notify popup that download scan completed (so it can refresh logs)
        try {
          browserAPI.runtime.sendMessage({
            type: 'DOWNLOAD_SCAN_COMPLETE',
            status: 'clean',
            filename: displayFileName
          }).catch(() => {
            // Ignore errors - popup might not be open
          });
        } catch (e) {
          // Ignore - popup might not be open
        }
      }
    } catch (error) {
      console.error('❌ Download scan failed (network/API error):', error);
      console.error('   Error type:', error.name);
      console.error('   Error message:', error.message);
      console.error('   Download ID:', downloadItem.id);
      
      // Get the stored scan result (may not have suggest callback if download was cancelled)
      const scanResult = pendingScanResults.get(downloadItem.id);
      
      // Get the filename to display - use multiple fallbacks
      let displayFileName = finalFileName;
      if (!displayFileName || displayFileName.trim() === '' || displayFileName === 'download.bin') {
        displayFileName = scanResult?.filename || 
                         downloadItem.filename || 
                         downloadItem.suggestedFilename ||
                         (fileUrl ? fileUrl.split('/').pop() : null);
      }
      // If still no filename, extract from URL
      if (!displayFileName || displayFileName.trim() === '' || displayFileName === 'download.bin') {
        try {
          const urlObj = new URL(fileUrl);
          const urlPath = urlObj.pathname;
          const urlFileName = urlPath.split('/').pop() || 'download';
          displayFileName = decodeURIComponent(urlFileName);
        } catch (e) {
          displayFileName = fileUrl ? fileUrl.split('/').pop() : 'file';
        }
      }
      // Final fallback
      if (!displayFileName || displayFileName.trim() === '') {
        displayFileName = 'file';
      }
      
      console.log('📝 Using filename for error notification:', displayFileName);
      
      // Ensure minimum hold time before showing result UI
      {
        const elapsed = Date.now() - holdStartedAt;
        const remaining = MIN_HOLD_MS - elapsed;
        if (remaining > 0) {
          try { await delay(remaining); } catch {}
        }
      }
      
      // Provide user-friendly error message based on error type
      let errorMessage = error.message || 'Network or API error';
      let userFriendlyMessage = errorMessage;
      
      // Check for specific error types
      let isNetworkError = false;
      let isTimeoutError = false;
      
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('Network request failed')) {
        // Network error - scan may have completed on server but response wasn't received
        // This is common when scan takes longer than expected
        isNetworkError = true;
        isTimeoutError = true;
        userFriendlyMessage = 'Network connection issue. The scan may have completed on the server, but the response was not received. Download allowed, but file may not be fully scanned.';
      } else if (errorMessage.includes('CORS') || errorMessage.includes('cross-origin')) {
        userFriendlyMessage = 'CORS error. Check server CORS configuration.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout') || errorMessage.includes('aborted')) {
        isTimeoutError = true;
        userFriendlyMessage = 'Scan request timed out. The scan may have completed on the server, but the response was not received in time. Download allowed, but file may not be fully scanned.';
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        userFriendlyMessage = 'Authentication required. Please login to the extension.';
        
        // Clear invalid token on 401 error
        try {
          await browserAPI.storage.local.remove(['auth_token', 'user']);
          console.log('🔒 Cleared invalid auth token due to 401 error in catch block');
        } catch (e) {
          console.error('❌ Error clearing auth token:', e);
        }
      } else if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
        userFriendlyMessage = 'Server error. Check server logs for details.';
      }

      // For network/timeout errors, treat similar to timeout - allow download with warning
      // The scan may have actually completed on the server (we see logs being saved)
      const notificationTitle = isTimeoutError ? '⏱️ Scan Timeout/Network Error' : '⚠️ Scan Failed';
      const notificationMessage = isTimeoutError 
        ? `Could not receive scan result for "${displayFileName}". ${userFriendlyMessage} Do you want to download?`
        : `Could not scan "${displayFileName}". ${userFriendlyMessage}. Allow download anyway?`;

      // On error, ask user what to do (network error, API error, etc.)
      // Even if suggest callback is missing, we should still show the notification
      // The download might have been cancelled, so we'll re-initiate it after user approval
      // CRITICAL: Check if notification already exists for this download to prevent duplicates
      if (activeNotificationsByDownloadId.has(downloadItem.id)) {
        console.log('⚠️ Notification already exists for this download, skipping duplicate:', downloadItem.id);
        return; // Don't create duplicate notification
      }
      
      const errorNotificationId = `download-error-${downloadItem.id}-${Date.now()}`;
      
      // Ensure scanResult exists (create if it doesn't)
      if (!scanResult) {
        console.warn('⚠️ No scan result found for download, creating placeholder');
        pendingScanResults.set(downloadItem.id, {
          url: fileUrl,
          filename: displayFileName,
          suggest: null, // Callback might be lost
          downloadInfo: { url: fileUrl, filename: displayFileName, originalId: downloadItem.id },
          needsReinitiate: true, // Mark as needing re-initiation
          wasCancelled: true // Likely cancelled if scanResult doesn't exist
        });
      } else {
        // Update scanResult with proper filename if missing
        if (!scanResult.filename || scanResult.filename.trim() === '') {
          scanResult.filename = displayFileName;
        }
        if (!scanResult.url) {
          scanResult.url = fileUrl;
        }
        // Mark as needing re-initiation if suggest callback is missing
        if (!scanResult.suggest) {
          scanResult.needsReinitiate = true;
          scanResult.wasCancelled = true;
        }
        pendingScanResults.set(downloadItem.id, scanResult);
      }
      
      const finalScanResult = pendingScanResults.get(downloadItem.id);
      
      try {
        browserAPI.notifications.create(errorNotificationId, {
          type: 'basic',
          iconUrl: browserAPI.runtime.getURL('logo.png'),
          title: notificationTitle,
          message: notificationMessage,
          buttons: [
            { title: 'Yes, Download' },
            { title: 'No, Cancel' }
          ],
          requireInteraction: true
        }, (createdNotificationId) => {
          const lastError = (typeof browser !== 'undefined' ? browser.runtime.lastError : chrome.runtime.lastError);
          if (!lastError && createdNotificationId) {
            // Track active notification to prevent duplicates
            activeNotificationsByDownloadId.set(downloadItem.id, createdNotificationId);
            // Store notification ID mapping to download ID for button click handling
            // Ensure we have all required fields
            pendingDownloads.set(createdNotificationId, {
              downloadId: downloadItem.id,
              url: finalScanResult?.url || fileUrl || downloadItem.url || downloadItem.finalUrl,
              filename: displayFileName,
              scanFailed: true,
              error: errorMessage,
              scanStatus: isTimeoutError ? 'timeout' : 'error',
              isNetworkError: isNetworkError
            });
            console.log('✅ Error notification created:', createdNotificationId);
            console.log('   Download ID:', downloadItem.id);
            console.log('   Filename:', displayFileName);
            console.log('   URL:', (finalScanResult?.url || fileUrl || downloadItem.url)?.substring(0, 100));
          } else {
            // If notification fails, log it but don't block download
            console.error('❌ Notification creation failed:', lastError?.message || 'unknown error');
            // Don't delete scanResult - user might still want to download
          }
        });
      } catch (notifError) {
        console.error('❌ Error creating error notification:', notifError);
        // Don't delete scanResult - user might still want to download
        // Just log the error
      }
    }
  } catch (error) {
    console.error('❌ Error in download listener:', error);
    // Clean up pending scan result on unexpected error
    try {
      pendingScanResults.delete(downloadItem.id);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  });
  
  console.log('✅ onDeterminingFilename listener registered successfully');
  
  // CRITICAL: Listen to onCreated to CANCEL downloads that started without approval
  // onDeterminingFilename has a timeout - if suggest() isn't called quickly, Chrome allows the download
  // We MUST cancel it immediately and re-initiate after scan + user approval
  if (browserAPI.downloads && browserAPI.downloads.onCreated) {
    browserAPI.downloads.onCreated.addListener(async (downloadItem) => {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔴 onCreated FIRED');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('   Download ID:', downloadItem.id);
      console.log('   Filename:', downloadItem.filename);
      console.log('   URL:', downloadItem.url?.substring(0, 100));
      console.log('   State:', downloadItem.state);
      console.log('   Timestamp:', new Date().toISOString());
      console.log('═══════════════════════════════════════════════════════════');
      
      try {
        // Check if this download was already approved (suggest() was called)
        console.log('🔴 CHECK 1: Is download in suggestedDownloads?');
        console.log('   suggestedDownloads.has(downloadItem.id):', suggestedDownloads.has(downloadItem.id));
        if (suggestedDownloads.has(downloadItem.id)) {
          // Download was approved - allow it to proceed
          console.log('✅ Download already approved via suggest() - ALLOWING:', downloadItem.id);
          console.log('🔴 onCreated EXITING: Download approved');
          return;
        }
        
        // CRITICAL: Check if this is a re-initiated download (temporarily approved URL)
        // Re-initiated downloads are marked as approved for 5 seconds to allow them to proceed
        // This is NOT a permanent approval - it only works for the re-initiation
        const downloadUrlForApproval = downloadItem.url || downloadItem.finalUrl || '';
        let isReinitiatedDownload = false;
        if (downloadUrlForApproval) {
          const normalizedUrl = normalizeUrlForApproval(downloadUrlForApproval);
          const approvalTimestamp = approvedDownloads.get(normalizedUrl);
          if (approvalTimestamp) {
            const approvalAge = Date.now() - approvalTimestamp;
            // Only allow if approved within the last 5 seconds (short window for re-initiation)
            if (approvalAge < 5000) {
              isReinitiatedDownload = true;
              console.log('✅ Download is a re-initiated download (temporarily approved URL)');
              console.log('   URL:', normalizedUrl);
              console.log('   Approval age:', approvalAge, 'ms');
              // Mark as suggested and allow it to proceed
              suggestedDownloads.add(downloadItem.id);
              // Also mark in pendingScanResults so we don't process it again
              pendingScanResults.set(downloadItem.id, {
                url: downloadUrlForApproval,
                filename: downloadItem.filename || downloadItem.suggestedFilename || '',
                suggest: null,
                downloadInfo: { url: downloadUrlForApproval, filename: downloadItem.filename || downloadItem.suggestedFilename || '', originalId: downloadItem.id },
                wasApproved: true,
                isReinitiated: true
              });
              // Remove the temporary approval (one-time use)
              approvedDownloads.delete(normalizedUrl);
              console.log('🔴 onCreated EXITING: Re-initiated download approved');
              return;
            } else {
              // Approval expired - remove it
              approvedDownloads.delete(normalizedUrl);
              console.log('   Temporary approval expired (age:', approvalAge, 'ms) - will scan normally');
            }
          }
        }
        
        // Check if we're already handling this download in onDeterminingFilename
        console.log('🔴 CHECK 3: Is download in pendingScanResults?');
        console.log('   pendingScanResults.has(downloadItem.id):', pendingScanResults.has(downloadItem.id));
        console.log('   downloadItem.id:', downloadItem.id);
        console.log('   downloadItem.url:', downloadItem.url?.substring(0, 100));
        console.log('   downloadItem.finalUrl:', downloadItem.finalUrl?.substring(0, 100));
        
        // Check by download ID first
        if (pendingScanResults.has(downloadItem.id)) {
          const existingScanResult = pendingScanResults.get(downloadItem.id);
          console.log('   Scan result found by ID:', !!existingScanResult);
          if (existingScanResult) {
            console.log('   Scan result keys:', Object.keys(existingScanResult));
            console.log('   wasApproved:', existingScanResult.wasApproved);
            console.log('   isReinitiated:', existingScanResult.isReinitiated);
            console.log('   stored URL:', existingScanResult.url?.substring(0, 100));
            console.log('   stored finalUrl:', existingScanResult.finalUrl?.substring(0, 100));
          }
          
          // CRITICAL: Check if this download was already approved (re-initiated after user approval)
          // If it was approved, don't cancel it - allow it to proceed
          if (existingScanResult && (existingScanResult.wasApproved || existingScanResult.isReinitiated)) {
            console.log('✅✅✅ Download is re-initiated and approved - ALLOWING:', downloadItem.id);
            // Mark as suggested so we don't process it again
            suggestedDownloads.add(downloadItem.id);
            console.log('🔴 onCreated EXITING: Download re-initiated and approved');
            return;
          }
        }
        
        // Also check by URL in case the download ID changed but URL matches
        const downloadUrl = downloadItem.url || downloadItem.finalUrl || '';
        if (downloadUrl) {
          // Check all pending scan results to see if any match this URL and are approved
          for (const [scanId, scanResult] of pendingScanResults.entries()) {
            const scanUrl = scanResult.url || scanResult.finalUrl || '';
            if (scanUrl && (scanUrl === downloadUrl || scanUrl === downloadItem.url || scanUrl === downloadItem.finalUrl)) {
              if (scanResult.wasApproved || scanResult.isReinitiated) {
                console.log('✅✅✅ Found approved download by URL match - ALLOWING:', downloadItem.id);
                console.log('   Matched scan ID:', scanId);
                console.log('   Matched URL:', scanUrl.substring(0, 100));
                // Mark this download ID as suggested
                suggestedDownloads.add(downloadItem.id);
                // Also store it in pendingScanResults with approval flags
                pendingScanResults.set(downloadItem.id, {
                  ...scanResult,
                  wasApproved: true,
                  isReinitiated: true
                });
                console.log('🔴 onCreated EXITING: Download approved by URL match');
                return;
              }
            }
          }
        }
        
        // We're handling it in onDeterminingFilename
        // BUT if the download started, it means Chrome timed out and allowed it
        // CRITICAL: Cancel it immediately to prevent it from downloading
        // We'll re-initiate it after user approval
        console.warn('═══════════════════════════════════════════════════════════');
        console.warn('⚠️ DOWNLOAD STARTED BUT NOT YET APPROVED');
        console.warn('═══════════════════════════════════════════════════════════');
        console.warn('   Download ID:', downloadItem.id);
        console.warn('   Filename:', downloadItem.filename);
        console.warn('   URL:', downloadItem.url?.substring(0, 100));
        console.warn('   State:', downloadItem.state);
        console.warn('   Reason: Chrome timed out onDeterminingFilename and allowed download');
        console.warn('   Action: CANCELING to block until scan completes');
        console.warn('═══════════════════════════════════════════════════════════');
        
        try {
          // Cancel the download immediately - don't try to pause
          // Pausing might not work if the download has already started downloading bytes
          // Canceling ensures it's completely stopped
          console.log('🔴 Attempting to cancel download...');
          await browserAPI.downloads.cancel(downloadItem.id);
          console.log('✅ Canceled download that started before approval:', downloadItem.id);
          
          // Mark as needing re-initiation
          const scanResult = pendingScanResults.get(downloadItem.id);
          if (scanResult) {
            scanResult.wasCancelled = true;
            scanResult.needsReinitiate = true;
            scanResult.suggest = null; // Can't use suggest() on cancelled download
            
            // CRITICAL: Check if scan was actually triggered
            // If scanResult doesn't have scanInProgress flag, the scan might not have started
            // Trigger the scan now if it hasn't been triggered yet
            if (!scanResult.scanInProgress && !scanResult.scanCompleted) {
              console.log('🔄 Scan was not triggered in onDeterminingFilename - triggering scan now');
              const downloadUrl = scanResult.url || downloadItem.url || downloadItem.finalUrl || '';
              const fileName = scanResult.filename || downloadItem.filename || downloadItem.suggestedFilename || '';
              
              // Get auth token first
              const authResult = await browserAPI.storage.local.get('auth_token');
              if (!authResult.auth_token) {
                console.error('❌ No auth token available for scan');
                // Show error notification
                const errorNotificationId = `download-error-${downloadItem.id}-${Date.now()}`;
                browserAPI.notifications.create(errorNotificationId, {
                  type: 'basic',
                  iconUrl: browserAPI.runtime.getURL('logo.png'),
                  title: '⚠️ Scan Failed',
                  message: `Could not scan "${fileName}". Authentication required. Please login to the extension.`,
                  buttons: [{ title: 'OK' }]
                });
                return;
              }
              
              // Mark scan as in progress
              scanResult.scanInProgress = true;
              pendingScanResults.set(downloadItem.id, scanResult);
              
              // Trigger scan asynchronously (don't await - let it run in background)
              // Use the same scan API call pattern as onDeterminingFilename
              const API_BASE_URL = 'http://localhost:5000/api';
              fetch(`${API_BASE_URL}/scan/download`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${authResult.auth_token}`
                },
                body: JSON.stringify({
                  fileUrl: downloadUrl,
                  fileName: fileName
                })
              }).then(async (response) => {
                if (!response.ok) {
                  throw new Error(`Scan API returned ${response.status}`);
                }
                const data = await response.json();
                
                // Mark scan as completed
                scanResult.scanCompleted = true;
                pendingScanResults.set(downloadItem.id, scanResult);
                
                // Handle scan result - show notification (similar to onDeterminingFilename)
                // CRITICAL: Check if notification already exists to prevent duplicates
                if (activeNotificationsByDownloadId.has(downloadItem.id)) {
                  console.log('⚠️ Notification already exists for this download, skipping duplicate:', downloadItem.id);
                  return; // Don't create duplicate notification
                }
                
                const notificationId = data.status === 'infected' 
                  ? `download-unsafe-${downloadItem.id}-${Date.now()}`
                  : data.status === 'clean' || data.status === 'safe'
                  ? `download-safe-${downloadItem.id}-${Date.now()}`
                  : `download-error-${downloadItem.id}-${Date.now()}`;
                
                const threatList = data.threats && data.threats.length > 0 
                  ? data.threats.join(', ') 
                  : 'unknown';
                
                const title = data.status === 'infected' 
                  ? '⚠️ File Scanned: UNSAFE'
                  : data.status === 'clean' || data.status === 'safe'
                  ? '✅ File Scanned: SAFE'
                  : '⚠️ Scan Failed';
                
                const message = data.status === 'infected'
                  ? `"${fileName}" has been scanned and found to be UNSAFE. Threats detected: ${threatList}. Do you want to download this file anyway?`
                  : data.status === 'clean' || data.status === 'safe'
                  ? `"${fileName}" has been scanned and found to be SAFE. Do you want to download this file?`
                  : `Could not scan "${fileName}". ${data.message || 'Scan service unavailable'}. Allow download anyway?`;
                
                browserAPI.notifications.create(notificationId, {
                  type: 'basic',
                  iconUrl: browserAPI.runtime.getURL('logo.png'),
                  title: title,
                  message: message,
                  buttons: data.status === 'infected'
                    ? [{ title: 'Yes, Download Anyway' }, { title: 'No, Block Download' }]
                    : [{ title: 'Yes, Download' }, { title: 'No, Cancel' }],
                  requireInteraction: true
                }, (createdNotificationId) => {
                  if (!browserAPI.runtime.lastError && createdNotificationId) {
                    // Track active notification to prevent duplicates
                    activeNotificationsByDownloadId.set(downloadItem.id, createdNotificationId);
                    // Normalize status: 'infected' or 'unsafe' should both be 'unsafe' for consistency
                    const normalizedStatus = (data.status === 'infected' || data.status === 'unsafe') ? 'unsafe' : data.status;
                    pendingDownloads.set(createdNotificationId, {
                      downloadId: downloadItem.id,
                      url: downloadUrl,
                      filename: fileName,
                      scanStatus: normalizedStatus,
                      threats: data.threats || null
                    });
                  }
                });
                
                // Notify popup that download scan completed
                try {
                  browserAPI.runtime.sendMessage({
                    type: 'DOWNLOAD_SCAN_COMPLETE',
                    status: data.status,
                    filename: fileName
                  }).catch(() => {
                    // Ignore errors - popup might not be open
                  });
                } catch (e) {
                  // Ignore - popup might not be open
                }
              }).catch((error) => {
                console.error('❌ Error triggering scan in onCreated:', error);
                // Mark scan as completed (with error)
                scanResult.scanCompleted = true;
                pendingScanResults.set(downloadItem.id, scanResult);
                
                // Show error notification
                const errorNotificationId = `download-error-${downloadItem.id}-${Date.now()}`;
                browserAPI.notifications.create(errorNotificationId, {
                  type: 'basic',
                  iconUrl: browserAPI.runtime.getURL('logo.png'),
                  title: '⚠️ Scan Failed',
                  message: `Could not scan "${fileName}". ${error.message || 'Scan service unavailable'}. Allow download anyway?`,
                  buttons: [
                    { title: 'Yes, Allow' },
                    { title: 'No, Block' }
                  ],
                  requireInteraction: true
                }, (createdNotificationId) => {
                  if (!browserAPI.runtime.lastError && createdNotificationId) {
                    pendingDownloads.set(createdNotificationId, {
                      downloadId: downloadItem.id,
                      url: downloadUrl,
                      filename: fileName,
                      scanStatus: 'error',
                      scanFailed: true
                    });
                  }
                });
              });
            } else {
              console.log('✅ Scan already in progress or completed - waiting for results');
            }
            
            console.log('✅ Marked scan result for re-initiation after user approval');
            console.log('   wasCancelled:', scanResult.wasCancelled);
            console.log('   needsReinitiate:', scanResult.needsReinitiate);
          } else {
            // If no scan result exists, create one and trigger scan
            const downloadUrl = downloadItem.url || downloadItem.finalUrl || '';
            const fileName = downloadItem.filename || downloadItem.suggestedFilename || '';
            
            // Get auth token first
            const authResult = await browserAPI.storage.local.get('auth_token');
            if (!authResult.auth_token) {
              console.error('❌ No auth token available for scan');
              // Show error notification
              const errorNotificationId = `download-error-${downloadItem.id}-${Date.now()}`;
              browserAPI.notifications.create(errorNotificationId, {
                type: 'basic',
                iconUrl: browserAPI.runtime.getURL('logo.png'),
                title: '⚠️ Scan Failed',
                message: `Could not scan "${fileName}". Authentication required. Please login to the extension.`,
                buttons: [{ title: 'OK' }]
              });
              return;
            }
            
            const newScanResult = {
              url: downloadUrl,
              filename: fileName,
              suggest: null,
              downloadInfo: { url: downloadUrl, filename: fileName, originalId: downloadItem.id },
              wasCancelled: true,
              needsReinitiate: true,
              scanInProgress: true,
              scanCompleted: false,
              lockKey: `lock_${downloadItem.id}`
            };
            
            pendingScanResults.set(downloadItem.id, newScanResult);
            console.log('✅ Created scan result for cancelled download (will trigger scan and re-initiate after approval)');
            
            // Trigger scan asynchronously (don't await - let it run in background)
            // Use the same scan API call pattern as onDeterminingFilename
            const API_BASE_URL = 'http://localhost:5000/api';
            fetch(`${API_BASE_URL}/scan/download`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authResult.auth_token}`
              },
              body: JSON.stringify({
                fileUrl: downloadUrl,
                fileName: fileName
              })
            }).then(async (response) => {
              if (!response.ok) {
                throw new Error(`Scan API returned ${response.status}`);
              }
              const data = await response.json();
              
              // Mark scan as completed
              newScanResult.scanCompleted = true;
              pendingScanResults.set(downloadItem.id, newScanResult);
              
              // Handle scan result - show notification (similar to onDeterminingFilename)
              // CRITICAL: Check if notification already exists to prevent duplicates
              if (activeNotificationsByDownloadId.has(downloadItem.id)) {
                console.log('⚠️ Notification already exists for this download, skipping duplicate:', downloadItem.id);
                return; // Don't create duplicate notification
              }
              
              const notificationId = data.status === 'infected' 
                ? `download-unsafe-${downloadItem.id}-${Date.now()}`
                : data.status === 'clean' || data.status === 'safe'
                ? `download-safe-${downloadItem.id}-${Date.now()}`
                : `download-error-${downloadItem.id}-${Date.now()}`;
              
              const threatList = data.threats && data.threats.length > 0 
                ? data.threats.join(', ') 
                : 'unknown';
              
              const title = data.status === 'infected' 
                ? '⚠️ File Scanned: UNSAFE'
                : data.status === 'clean' || data.status === 'safe'
                ? '✅ File Scanned: SAFE'
                : '⚠️ Scan Failed';
              
              const message = data.status === 'infected'
                ? `"${fileName}" has been scanned and found to be UNSAFE. Threats detected: ${threatList}. Do you want to download this file anyway?`
                : data.status === 'clean' || data.status === 'safe'
                ? `"${fileName}" has been scanned and found to be SAFE. Do you want to download this file?`
                : `Could not scan "${fileName}". ${data.message || 'Scan service unavailable'}. Allow download anyway?`;
              
              browserAPI.notifications.create(notificationId, {
                type: 'basic',
                iconUrl: browserAPI.runtime.getURL('logo.png'),
                title: title,
                message: message,
                buttons: data.status === 'infected'
                  ? [{ title: 'Yes, Download Anyway' }, { title: 'No, Block Download' }]
                  : [{ title: 'Yes, Download' }, { title: 'No, Cancel' }],
                requireInteraction: true
              }, (createdNotificationId) => {
                if (!browserAPI.runtime.lastError && createdNotificationId) {
                  // Track active notification to prevent duplicates
                  activeNotificationsByDownloadId.set(downloadItem.id, createdNotificationId);
                  // Normalize status: 'infected' or 'unsafe' should both be 'unsafe' for consistency
                  const normalizedStatus = (data.status === 'infected' || data.status === 'unsafe') ? 'unsafe' : data.status;
                  pendingDownloads.set(createdNotificationId, {
                    downloadId: downloadItem.id,
                    url: downloadUrl,
                    filename: fileName,
                    scanStatus: normalizedStatus,
                    threats: data.threats || null
                  });
                }
              });
              
              // Notify popup that download scan completed
              try {
                browserAPI.runtime.sendMessage({
                  type: 'DOWNLOAD_SCAN_COMPLETE',
                  status: data.status,
                  filename: fileName
                }).catch(() => {
                  // Ignore errors - popup might not be open
                });
              } catch (e) {
                // Ignore - popup might not be open
              }
            }).catch((error) => {
              console.error('❌ Error triggering scan in onCreated:', error);
              // Mark scan as completed (with error)
              newScanResult.scanCompleted = true;
              pendingScanResults.set(downloadItem.id, newScanResult);
              
              // Show error notification
              const errorNotificationId = `download-error-${downloadItem.id}-${Date.now()}`;
              browserAPI.notifications.create(errorNotificationId, {
                type: 'basic',
                iconUrl: browserAPI.runtime.getURL('logo.png'),
                title: '⚠️ Scan Failed',
                message: `Could not scan "${fileName}". ${error.message || 'Scan service unavailable'}. Allow download anyway?`,
                buttons: [
                  { title: 'Yes, Allow' },
                  { title: 'No, Block' }
                ],
                requireInteraction: true
              }, (createdNotificationId) => {
                if (!browserAPI.runtime.lastError && createdNotificationId) {
                  pendingDownloads.set(createdNotificationId, {
                    downloadId: downloadItem.id,
                    url: downloadUrl,
                    filename: fileName,
                    scanStatus: 'error',
                    scanFailed: true
                  });
                }
              });
            });
          }
          console.log('🔴 onCreated EXITING: Download cancelled, scan triggered, waiting for user approval');
          return;
        } catch (cancelError) {
          console.error('❌ Could not cancel download:', cancelError);
          console.error('   Cancel error message:', cancelError.message);
          console.error('   Cancel error stack:', cancelError.stack);
          // If cancel fails, try to pause as fallback
          try {
            if (browserAPI.downloads.pause) {
              console.log('🔴 Attempting to pause download (cancel failed)...');
              await browserAPI.downloads.pause(downloadItem.id);
              console.log('✅ Paused download (cancel failed):', downloadItem.id);
              const scanResult = pendingScanResults.get(downloadItem.id);
              if (scanResult) {
                scanResult.wasPaused = true;
                scanResult.needsResume = true;
              }
            }
          } catch (pauseError) {
            console.error('❌ Could not pause download either:', pauseError);
            console.error('   Pause error message:', pauseError.message);
            // Download will proceed - we can't block it, but we'll still show the notification
          }
          return;
        }
        
        // If we reach here, the download started but wasn't caught by onDeterminingFilename
        // This can happen if:
        // 1. The download bypassed onDeterminingFilename (some downloads do this)
        // 2. The listener isn't registered properly
        // 3. The download is from a different source
        
        // CRITICAL: Check if we're already handling this download to prevent duplicate processing
        if (activeNotificationsByDownloadId.has(downloadItem.id) || pendingScanResults.has(downloadItem.id)) {
          console.log('ℹ️ Download already being processed (bypassed onDeterminingFilename), skipping duplicate:', downloadItem.id);
          return;
        }
        
        // Check if we should scan this download
        const [protectionResult, scanResult, authResult] = await Promise.all([
          browserAPI.storage.local.get('protectionEnabled'),
          browserAPI.storage.local.get('downloadScanEnabled'),
          browserAPI.storage.local.get('auth_token')
        ]);
        
        // If protection/scan is disabled or no auth, allow it
        if (protectionResult.protectionEnabled === false || 
            scanResult.downloadScanEnabled === false || 
            !authResult.auth_token) {
          console.log('ℹ️ Download bypassed onDeterminingFilename but protection/scan is disabled - allowing');
          return;
        }
        
        // This download bypassed onDeterminingFilename - we need to handle it
        // NOTE: This is expected behavior for some downloads (redirects, programmatic downloads, etc.)
        // The fallback mechanism will intercept via onCreated and scan the file properly
        console.log('ℹ️ Download bypassed onDeterminingFilename - using fallback interception via onCreated (this is normal)');
        console.log('   Download ID:', downloadItem.id);
        console.log('   Filename:', downloadItem.filename);
        console.log('   URL:', downloadItem.url?.substring(0, 100));
        
        // Cancel the download immediately
        try {
          await browserAPI.downloads.cancel(downloadItem.id);
          console.log('✅ Canceled download that bypassed onDeterminingFilename:', downloadItem.id);
          
          // Now handle it as if onDeterminingFilename fired
          // Store download info for scanning
          const downloadUrl = downloadItem.url || downloadItem.finalUrl || '';
          const fileName = downloadItem.filename || downloadItem.suggestedFilename || '';
          
          // Mark as needing re-initiation
          pendingScanResults.set(downloadItem.id, {
            url: downloadUrl,
            filename: fileName,
            suggest: null, // Can't use suggest() on cancelled download
            downloadInfo: { url: downloadUrl, filename: fileName, originalId: downloadItem.id },
            wasCancelled: true,
            needsReinitiate: true,
            lockKey: `lock_${downloadItem.id}`
          });
          
          // Now trigger the scan (we'll need to replicate the scan logic here)
          // For now, we'll start the scan asynchronously
          console.log('🔄 Starting scan for download that bypassed onDeterminingFilename');
          console.log('   Download URL:', downloadUrl?.substring(0, 100));
          console.log('   Filename:', fileName);
          console.log('   Download ID:', downloadItem.id);
          
          // Trigger scan by calling the scan API
          // We'll handle the result in the notification handlers
          const API_BASE_URL = 'http://localhost:5000/api';
          const authToken = authResult.auth_token;
          
          if (!authToken) {
            console.error('❌ No auth token available for scan');
            return;
          }
          
          if (!downloadUrl) {
            console.error('❌ No download URL available for scan');
            return;
          }
          
          console.log('📡 Sending scan request to:', `${API_BASE_URL}/scan/download`);
          
          // Start scan in background
          fetch(`${API_BASE_URL}/scan/download`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
              fileUrl: downloadUrl,
              fileName: fileName
            })
          }).then(async (response) => {
            console.log('📥 Scan API response received:', response.status, response.statusText);
            if (!response.ok) {
              const errorText = await response.text();
              console.error('❌ Scan API error response:', errorText);
              throw new Error(`Scan API returned ${response.status}: ${errorText}`);
            }
            const data = await response.json();
            console.log('✅ Scan result received:', {
              status: data.status,
              success: data.success,
              threats: data.threats?.length || 0,
              message: data.message?.substring(0, 100)
            });
            
            // Handle scan result (similar to onDeterminingFilename handler)
            // Show notification and wait for user approval
            // CRITICAL: Check if notification already exists to prevent duplicates
            if (activeNotificationsByDownloadId.has(downloadItem.id)) {
              console.log('⚠️ Notification already exists for this download, skipping duplicate:', downloadItem.id);
              return; // Don't create duplicate notification
            }
            
            const notificationId = data.status === 'infected' 
              ? `download-unsafe-${downloadItem.id}-${Date.now()}`
              : data.status === 'clean' || data.status === 'safe'
              ? `download-safe-${downloadItem.id}-${Date.now()}`
              : `download-error-${downloadItem.id}-${Date.now()}`;
            
            const threatList = data.threats && data.threats.length > 0 
              ? data.threats.join(', ') 
              : 'unknown';
            
            const title = data.status === 'infected' 
              ? '⚠️ File Scanned: UNSAFE'
              : data.status === 'clean' || data.status === 'safe'
              ? '✅ File Scanned: SAFE'
              : '⚠️ Scan Failed';
            
            const message = data.status === 'infected'
              ? `"${fileName}" has been scanned and found to be UNSAFE. Threats detected: ${threatList}. Do you want to download this file anyway?`
              : data.status === 'clean' || data.status === 'safe'
              ? `"${fileName}" has been scanned and found to be SAFE. Do you want to download this file?`
              : `Could not scan "${fileName}". ${data.message || 'Scan service unavailable'}. Allow download anyway?`;
            
            console.log('📢 Creating notification:', notificationId);
            console.log('   Title:', title);
            console.log('   Message:', message.substring(0, 100));
            
            browserAPI.notifications.create(notificationId, {
              type: 'basic',
              iconUrl: browserAPI.runtime.getURL('logo.png'),
              title: title,
              message: message,
              buttons: data.status === 'infected'
                ? [{ title: 'Yes, Download Anyway' }, { title: 'No, Block Download' }]
                : [{ title: 'Yes, Download' }, { title: 'No, Cancel' }],
              requireInteraction: true
            }, (createdNotificationId) => {
              if (browserAPI.runtime.lastError) {
                console.error('❌ Error creating notification:', browserAPI.runtime.lastError.message);
              } else if (createdNotificationId) {
                console.log('✅ Notification created successfully:', createdNotificationId);
                // Track active notification to prevent duplicates
                activeNotificationsByDownloadId.set(downloadItem.id, createdNotificationId);
                // Normalize status: 'infected' or 'unsafe' should both be 'unsafe' for consistency
                const normalizedStatus = (data.status === 'infected' || data.status === 'unsafe') ? 'unsafe' : data.status;
                pendingDownloads.set(createdNotificationId, {
                  downloadId: downloadItem.id,
                  url: downloadUrl,
                  filename: fileName,
                  scanStatus: normalizedStatus,
                  threats: data.threats || null
                });
                console.log('✅ Download info stored in pendingDownloads for notification:', createdNotificationId);
              } else {
                console.error('❌ Notification creation returned null/undefined');
              }
            });
          }).catch((error) => {
            console.error('❌ Scan failed for bypassed download:', error);
            console.error('   Error name:', error.name);
            console.error('   Error message:', error.message);
            console.error('   Error stack:', error.stack);
            // Show error notification
            const notificationId = `download-error-${downloadItem.id}-${Date.now()}`;
            console.log('📢 Creating error notification:', notificationId);
            browserAPI.notifications.create(notificationId, {
              type: 'basic',
              iconUrl: browserAPI.runtime.getURL('logo.png'),
              title: '⚠️ Scan Failed',
              message: `Could not scan "${fileName}". ${error.message || 'Scan service unavailable'}. Allow download anyway?`,
              buttons: [
                { title: 'Yes, Allow' },
                { title: 'No, Block' }
              ],
              requireInteraction: true
            }, (createdNotificationId) => {
              if (browserAPI.runtime.lastError) {
                console.error('❌ Error creating error notification:', browserAPI.runtime.lastError.message);
              } else if (createdNotificationId) {
                console.log('✅ Error notification created successfully:', createdNotificationId);
                pendingDownloads.set(createdNotificationId, {
                  downloadId: downloadItem.id,
                  url: downloadUrl,
                  filename: fileName,
                  scanStatus: 'error',
                  scanFailed: true
                });
                console.log('✅ Error download info stored in pendingDownloads');
              } else {
                console.error('❌ Error notification creation returned null/undefined');
              }
            });
          });
        } catch (cancelError) {
          console.error('❌ Could not cancel bypassed download:', cancelError);
        }
      } catch (error) {
        console.error('❌ Error in onCreated listener:', error);
        console.error('   Error name:', error.name);
        console.error('   Error message:', error.message);
        console.error('   Error stack:', error.stack);
      }
    });
  }
}

// Fallback: Use onCreated if onDeterminingFilename is not available
if (!browserAPI.downloads || !browserAPI.downloads.onDeterminingFilename) {
  // onDeterminingFilename is not available (Chrome < 94 or API not accessible)
  console.warn('⚠️ onDeterminingFilename API is not available');
  console.warn('   Download scanning will use onCreated as fallback (less reliable)');
  console.warn('   Please update to Chrome 94+ for best download protection');
  
  // Fallback: Use onCreated (download has already started, but we can still scan)
  // This is less ideal but works on older Chrome versions
  if (browserAPI.downloads && browserAPI.downloads.onCreated) {
    browserAPI.downloads.onCreated.addListener(async (downloadItem) => {
      try {
        console.log('📥 Download detected (fallback mode):', downloadItem.filename, downloadItem.url);
        
        // Check if we should scan this download
        const [protectionResult, scanResult, authResult] = await Promise.all([
          browserAPI.storage.local.get('protectionEnabled'),
          browserAPI.storage.local.get('downloadScanEnabled'),
          browserAPI.storage.local.get('auth_token')
        ]);
        
        // If protection/scan is disabled or no auth, allow it
        if (protectionResult.protectionEnabled === false || 
            scanResult.downloadScanEnabled === false || 
            !authResult.auth_token) {
          return; // Let it proceed
        }
        
        // In fallback mode, we can't block the download (it's already started)
        // So we'll scan it and notify the user, but can't prevent it
        console.warn('⚠️ Download scanning in fallback mode - download has already started');
        console.warn('   Please update to Chrome 94+ for proper download blocking');
        
        // TODO: Implement scan and notification (without blocking)
        // For now, just log that we detected it
      } catch (error) {
        console.error('❌ Error in fallback onCreated listener:', error);
      }
    });
  }
}

// Clean up when downloads are removed or completed
// Only register these listeners if downloads API is available
if (browserAPI.downloads) {
  if (browserAPI.downloads.onRemoved) {
    browserAPI.downloads.onRemoved.addListener((downloadId) => {
      // Clean up tracking data when download is removed
      const scanResult = pendingScanResults.get(downloadId);
      pendingScanResults.delete(downloadId);
      suggestedDownloads.delete(downloadId);
      // Clean up lock if exists
      if (scanResult && scanResult.lockKey) {
        pendingScanResults.delete(scanResult.lockKey);
      }
      // Also clean up lock by ID pattern
      const lockKey = `lock_${downloadId}`;
      pendingScanResults.delete(lockKey);
        // Also clean up from pendingDownloads (notification mappings)
        for (const [notificationId, downloadInfo] of pendingDownloads.entries()) {
          if (downloadInfo.downloadId === downloadId) {
            pendingDownloads.delete(notificationId);
            break;
          }
        }
        // Clean up active notification tracking
        activeNotificationsByDownloadId.delete(downloadId);
    });
  }
  
  if (browserAPI.downloads.onChanged) {
    browserAPI.downloads.onChanged.addListener((downloadDelta) => {
      // Clean up when download completes or is interrupted
      if (downloadDelta.state && 
          (downloadDelta.state.current === 'complete' || 
           downloadDelta.state.current === 'interrupted')) {
        const downloadId = downloadDelta.id;
        const scanResult = pendingScanResults.get(downloadId);
        pendingScanResults.delete(downloadId);
        suggestedDownloads.delete(downloadId);
        // Clean up lock if exists
        if (scanResult && scanResult.lockKey) {
          pendingScanResults.delete(scanResult.lockKey);
        }
        // Also clean up lock by ID pattern
        const lockKey = `lock_${downloadId}`;
        pendingScanResults.delete(lockKey);
        // Also clean up from pendingDownloads
        for (const [notificationId, downloadInfo] of pendingDownloads.entries()) {
          if (downloadInfo.downloadId === downloadId) {
            pendingDownloads.delete(notificationId);
            break;
          }
        }
        // Clean up active notification tracking
        activeNotificationsByDownloadId.delete(downloadId);
      }
    });
  }
}

// Handle notification button clicks
// Only register if notifications API is available
if (browserAPI.notifications && browserAPI.notifications.onButtonClicked) {
  browserAPI.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  console.log('🔔 NOTIFICATION BUTTON CLICKED');
  console.log('   Notification ID:', notificationId);
  console.log('   Button Index:', buttonIndex, buttonIndex === 0 ? '(Allow)' : '(Block)');
  console.log('   Timestamp:', new Date().toISOString());
  
  // First check if this is a navigation block notification (unsafe page before navigation)
  let navigationBlockInfo = null;
  for (const [tabId, info] of pendingNavigationBlocks.entries()) {
    if (info.notificationId === notificationId) {
      navigationBlockInfo = { tabId, ...info };
      break;
    }
  }
  
  if (navigationBlockInfo) {
    // Handle unsafe page navigation block notification
    if (buttonIndex === 0) {
      // User chose "Yes, Open Anyway" - allow navigation
      console.log('✅ User approved unsafe page navigation:', navigationBlockInfo.url);
      
      // Mark as approved so onBeforeNavigate allows it
      navigationBlockInfo.approved = true;
      pendingNavigationBlocks.set(navigationBlockInfo.tabId, navigationBlockInfo);
      
      // Navigate to the actual URL
      try {
        await browserAPI.tabs.update(navigationBlockInfo.tabId, {
          url: navigationBlockInfo.url
        });
        console.log('✅ Navigated to unsafe page after user approval');
      } catch (error) {
        console.error('❌ Error navigating to unsafe page:', error);
      }
      
      // Clean up after a short delay to allow navigation
      setTimeout(() => {
        pendingNavigationBlocks.delete(navigationBlockInfo.tabId);
      }, 2000);
      
      browserAPI.notifications.clear(notificationId);
    } else if (buttonIndex === 1) {
      // User chose "No, Stay Safe" - keep on about:blank or navigate back
      console.log('🚫 User denied unsafe page navigation:', navigationBlockInfo.url);
      
      // Optionally navigate to a safe page or keep on about:blank
      // For now, we'll just keep it on about:blank
      
      pendingNavigationBlocks.delete(navigationBlockInfo.tabId);
      browserAPI.notifications.clear(notificationId);
    }
    return;
  }
  
  // Check if this is a high-threat blocking notification (after page loads)
  let threatSiteInfo = null;
  for (const [tabId, info] of highThreatSites.entries()) {
    if (info.notificationId === notificationId) {
      threatSiteInfo = info;
      break;
    }
  }
  
  if (threatSiteInfo) {
    // Handle high-threat website blocking notification
    if (buttonIndex === 0) {
      // User chose "Stay on Website"
      console.log('✅ User chose to stay on high-threat website:', threatSiteInfo.url);
      highThreatSites.delete(threatSiteInfo.tabId);
      browserAPI.notifications.clear(notificationId);
    } else if (buttonIndex === 1) {
      // User chose "Block & Close Tab"
      console.log('🚫 User chose to block high-threat website:', threatSiteInfo.url);
      
      try {
        // Close the tab
        if (threatSiteInfo.tabId) {
          await browserAPI.tabs.remove(threatSiteInfo.tabId);
          console.log('✅ High-threat website tab closed');
        }
      } catch (error) {
        console.error('❌ Error closing high-threat website tab:', error);
      }
      
      highThreatSites.delete(threatSiteInfo.tabId);
      browserAPI.notifications.clear(notificationId);
    }
    return;
  }
  
  // Otherwise, handle download notification
  const downloadInfo = pendingDownloads.get(notificationId);
  
  if (!downloadInfo) {
    console.log('⚠️ No download info found for notification:', notificationId);
    return;
  }
  
  // CRITICAL: Check if this notification has already been processed
  // This prevents duplicate processing when multiple handlers fire
  if (processedNotifications.has(notificationId)) {
    console.log('⚠️ Notification already processed, ignoring duplicate:', notificationId);
    return;
  }
  
  // Mark notification as processed BEFORE processing to prevent race conditions
  processedNotifications.add(notificationId);
  
  // Clean up from pendingDownloads AFTER marking as processed
  pendingDownloads.delete(notificationId);
  
  if (buttonIndex === 0) {
    // Allow download (first button - "Yes, Download" or "Yes, Download Anyway")
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔵 BUTTON CLICKED: "Yes, Download"');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Download Info:', {
      filename: downloadInfo.filename,
      scanStatus: downloadInfo.scanStatus || 'unknown',
      downloadId: downloadInfo.downloadId,
      url: downloadInfo.url?.substring(0, 100),
      hasUrl: !!downloadInfo.url,
      hasDownloadId: !!downloadInfo.downloadId
    });
    console.log('═══════════════════════════════════════════════════════════');
    
    try {
      // REMOVED: URL-based approval - files should be scanned EVERY time
      // We no longer mark URLs as approved in approvedDownloads Map
      // Instead, we only use download ID-based flags (wasApproved/isReinitiated) to allow
      // re-initiated downloads to proceed without being cancelled again
      // This ensures that every new download of the same file will be scanned again
      
      // Get the scan result to check download state
      console.log('🔵 STEP 2: Getting scan result from pendingScanResults');
      console.log('   Looking for downloadId:', downloadInfo.downloadId);
      console.log('   pendingScanResults size:', pendingScanResults.size);
      const scanResult = pendingScanResults.get(downloadInfo.downloadId);
      console.log('   Scan result found:', !!scanResult);
      if (scanResult) {
        console.log('   Scan result keys:', Object.keys(scanResult));
        console.log('   has suggest callback:', !!scanResult.suggest);
        console.log('   wasCancelled:', scanResult.wasCancelled);
        console.log('   needsReinitiate:', scanResult.needsReinitiate);
        console.log('   wasApproved:', scanResult.wasApproved);
        console.log('   isReinitiated:', scanResult.isReinitiated);
      }
      
      // CRITICAL: Check if download was cancelled FIRST
      // If cancelled, we MUST re-initiate (can't use suggest() on cancelled downloads)
      // ALSO: For unsafe files (scanStatus === 'unsafe' or 'infected'), always re-initiate because downloads are always cancelled for unsafe files
      const wasCancelled = scanResult && (scanResult.wasCancelled || scanResult.needsReinitiate);
      const isUnsafeFile = downloadInfo.scanStatus === 'unsafe' || downloadInfo.scanStatus === 'infected';
      console.log('🔵 STEP 3: Checking if download was cancelled or is unsafe');
      console.log('   wasCancelled:', wasCancelled);
      console.log('   isUnsafeFile:', isUnsafeFile);
      console.log('   scanResult.wasCancelled:', scanResult?.wasCancelled);
      console.log('   scanResult.needsReinitiate:', scanResult?.needsReinitiate);
      console.log('   downloadInfo.scanStatus:', downloadInfo.scanStatus);
      console.log('   downloadInfo.url:', downloadInfo.url ? downloadInfo.url.substring(0, 100) : 'MISSING');
      console.log('   downloadInfo.filename:', downloadInfo.filename || 'MISSING');
      
      // For unsafe files, the download is always cancelled, so we must always re-initiate
      if (wasCancelled || isUnsafeFile) {
        console.log('🔄 Download was cancelled or is unsafe file - must re-initiate (cannot use suggest() on cancelled downloads)');
        console.log('   Reason:', isUnsafeFile ? 'Unsafe file (always re-initiate)' : 'Download was cancelled');
        console.log('   Skipping suggest() checks, going straight to re-initiation');
        // Mark as needing re-initiation if scanResult exists
        if (scanResult) {
          scanResult.wasCancelled = true;
          scanResult.needsReinitiate = true;
          scanResult.suggest = null; // Can't use suggest() on cancelled/unsafe downloads
          pendingScanResults.set(downloadInfo.downloadId, scanResult);
        } else if (!scanResult && isUnsafeFile) {
          // For unsafe files, create scanResult if it doesn't exist
          pendingScanResults.set(downloadInfo.downloadId, {
            url: downloadInfo.url,
            filename: downloadInfo.filename,
            suggest: null,
            downloadInfo: { url: downloadInfo.url, filename: downloadInfo.filename, originalId: downloadInfo.downloadId },
            wasCancelled: true,
            needsReinitiate: true
          });
        }
        // Skip all checks below and go straight to re-initiation
        // Don't return here - continue to STEP 7 and STEP 8 for re-initiation
      } else {
        // Download was NOT cancelled - check if it's still active and can be resumed or use suggest()
        
        // CRITICAL: Check if suggest() was already called for this download
        // If it was, don't try to call it again - the download should already be proceeding
        console.log('🔵 STEP 4: Checking if suggest() was already called');
        console.log('   suggestedDownloads.has(downloadInfo.downloadId):', suggestedDownloads.has(downloadInfo.downloadId));
        console.log('   suggestedDownloads size:', suggestedDownloads.size);
        if (suggestedDownloads.has(downloadInfo.downloadId)) {
          console.log('✅ Download already approved via suggest() - no action needed');
          // Clean up
          if (scanResult && scanResult.lockKey) {
            pendingScanResults.delete(scanResult.lockKey);
          }
          pendingScanResults.delete(downloadInfo.downloadId);
          console.log('🔵 EXITING: Download already handled via suggest()');
          return; // Already handled
        }
        
        // Check if download still exists and is in a resumable state
        console.log('🔵 STEP 5: Checking download state');
        console.log('   downloadInfo.downloadId:', downloadInfo.downloadId);
        console.log('   browserAPI.downloads available:', !!browserAPI.downloads);
        console.log('   browserAPI.downloads.search available:', !!browserAPI.downloads?.search);
        if (downloadInfo.downloadId && browserAPI.downloads && browserAPI.downloads.search) {
          try {
            console.log('   Searching for download with ID:', downloadInfo.downloadId);
            const downloads = await browserAPI.downloads.search({ id: downloadInfo.downloadId });
            console.log('   Search results:', downloads?.length || 0, 'download(s) found');
            if (downloads && downloads.length > 0) {
              const download = downloads[0];
              console.log('📥 Download state check:', {
                id: download.id,
                state: download.state,
                paused: download.paused,
                url: download.url?.substring(0, 100),
                bytesReceived: download.bytesReceived,
                totalBytes: download.totalBytes
              });
              
              // If download is in progress and paused, try to resume it
              if (download.state === 'in_progress' && download.paused && browserAPI.downloads.resume) {
                console.log('🔵 STEP 5.1: Attempting to resume paused download');
                try {
                  await browserAPI.downloads.resume(downloadInfo.downloadId);
                  console.log('✅ Resumed paused download after user approval');
                  // Clean up
                  if (scanResult && scanResult.lockKey) {
                    pendingScanResults.delete(scanResult.lockKey);
                  }
                  pendingScanResults.delete(downloadInfo.downloadId);
                  suggestedDownloads.add(downloadInfo.downloadId); // Mark as handled
                  console.log('🔵 EXITING: Download resumed successfully');
                  return; // Success - no need to re-initiate
                } catch (resumeError) {
                  console.error('❌ Could not resume paused download:', resumeError);
                  console.error('   Resume error message:', resumeError.message);
                  console.error('   Resume error stack:', resumeError.stack);
                  // Download might be in wrong state - continue to re-initiation
                }
              }
              
              // If download is already complete, nothing to do
              if (download.state === 'complete') {
                console.log('✅ Download already completed');
                // Clean up
                if (scanResult && scanResult.lockKey) {
                  pendingScanResults.delete(scanResult.lockKey);
                }
                pendingScanResults.delete(downloadInfo.downloadId);
                suggestedDownloads.add(downloadInfo.downloadId);
                console.log('🔵 EXITING: Download already completed');
                return; // Already done
              }
              
              // If download is in progress and not paused, it's already downloading
              if (download.state === 'in_progress' && !download.paused) {
                console.log('✅ Download already in progress');
                // Clean up
                if (scanResult && scanResult.lockKey) {
                  pendingScanResults.delete(scanResult.lockKey);
                }
                pendingScanResults.delete(downloadInfo.downloadId);
                suggestedDownloads.add(downloadInfo.downloadId);
                console.log('🔵 EXITING: Download already in progress');
                return; // Already downloading
              }
              
              console.log('   Download state does not allow resume - will re-initiate');
            } else {
              // Download not found - might have been cancelled or removed
              console.log('⚠️ Download not found in search - might have been cancelled, will re-initiate');
            }
          } catch (searchError) {
            console.error('❌ Error searching for download:', searchError);
            console.error('   Search error message:', searchError.message);
            console.error('   Search error stack:', searchError.stack);
            // Continue to re-initiation
          }
        } else {
          console.log('   Cannot check download state - missing downloadId or downloads API');
        }
        
        // Check if we can use suggest() callback (download wasn't cancelled and callback exists)
        // ONLY try suggest() if download was NOT cancelled AND suggest() hasn't been called yet
        console.log('🔵 STEP 6: Checking if we can use suggest() callback');
        console.log('   scanResult exists:', !!scanResult);
        console.log('   scanResult.suggest exists:', !!scanResult?.suggest);
        console.log('   wasCancelled:', wasCancelled);
        console.log('   suggestedDownloads.has(downloadInfo.downloadId):', suggestedDownloads.has(downloadInfo.downloadId));
        
        // CRITICAL: Don't call suggest() if it was already called for this download
        if (suggestedDownloads.has(downloadInfo.downloadId)) {
          console.log('   ⚠️ suggest() already called for this download - skipping');
        } else if (scanResult && scanResult.suggest && !wasCancelled) {
          // Try to use suggest() callback (only if download is still blocked)
          console.log('🔵 STEP 6.1: Attempting to use suggest() callback');
          try {
            // Mark as called BEFORE calling to prevent race conditions
            suggestedDownloads.add(downloadInfo.downloadId);
            
            const filenameToUse = downloadInfo.filename || downloadInfo.url?.split('/').pop() || 'download.bin';
            console.log('   Calling suggest() with filename:', filenameToUse);
            console.log('   suggest() callback type:', typeof scanResult.suggest);
            
            // Clear the suggest callback after calling to prevent double-call
            const suggestCallback = scanResult.suggest;
            scanResult.suggest = null; // Clear immediately to prevent reuse
            
            suggestCallback(filenameToUse);
            console.log('✅ Download allowed via suggest() callback');
            
            // Clean up
            if (scanResult.lockKey) {
              pendingScanResults.delete(scanResult.lockKey);
            }
            pendingScanResults.delete(downloadInfo.downloadId);
            console.log('🔵 EXITING: suggest() called successfully');
            return; // Success - don't re-initiate
          } catch (suggestError) {
            console.error('❌ Error calling suggest() callback:', suggestError);
            console.error('   Error name:', suggestError.name);
            console.error('   Error message:', suggestError.message);
            console.error('   Error stack:', suggestError.stack);
            
            // Remove from suggestedDownloads on error so we can retry via re-initiation
            suggestedDownloads.delete(downloadInfo.downloadId);
            
            // Callback might be invalid (service worker restarted) or already called
            // Continue to re-initiation as fallback
          }
        } else {
          console.log('   Cannot use suggest() - missing callback or download was cancelled');
          if (!scanResult) console.log('     Reason: No scanResult');
          if (!scanResult?.suggest) console.log('     Reason: No suggest callback');
          if (wasCancelled) console.log('     Reason: Download was cancelled');
          if (suggestedDownloads.has(downloadInfo.downloadId)) console.log('     Reason: suggest() already called');
        }
      }
      
      // Final check: If suggest() was already called, don't re-initiate
      // EXCEPTION: For unsafe files or cancelled downloads, we MUST re-initiate even if marked
      console.log('🔵 STEP 7: Final check before re-initiation');
      console.log('   suggestedDownloads.has(downloadInfo.downloadId):', suggestedDownloads.has(downloadInfo.downloadId));
      console.log('   isUnsafeFile:', isUnsafeFile);
      console.log('   wasCancelled:', wasCancelled);
      
      // For unsafe files or cancelled downloads, always re-initiate (remove from suggestedDownloads if present)
      if ((isUnsafeFile || wasCancelled) && suggestedDownloads.has(downloadInfo.downloadId)) {
        console.log('🔄 Removing download from suggestedDownloads to allow re-initiation (unsafe/cancelled)');
        suggestedDownloads.delete(downloadInfo.downloadId);
      }
      
      // Only skip re-initiation if download was NOT cancelled/unsafe AND suggest() was already called
      if (suggestedDownloads.has(downloadInfo.downloadId) && !isUnsafeFile && !wasCancelled) {
        console.log('✅ Download already approved via suggest() - skipping re-initiation');
        console.log('🔵 EXITING: Download already handled');
        return; // Already handled
      }
      
      // Re-initiate download (for cancelled downloads or when suggest() fails/unavailable)
      // NOTE: Files are scanned every time - no URL-based approval cache
      console.log('🔵 STEP 8: Re-initiating download');
      console.log('   downloadInfo.url:', downloadInfo.url ? downloadInfo.url.substring(0, 100) : 'MISSING - THIS IS A PROBLEM!');
      console.log('   downloadInfo.filename:', downloadInfo.filename || 'MISSING');
      console.log('   downloadInfo.scanStatus:', downloadInfo.scanStatus || 'unknown');
      console.log('   browserAPI.downloads available:', !!browserAPI.downloads);
      console.log('   browserAPI.downloads.download available:', !!browserAPI.downloads?.download);
      
      // CRITICAL: Ensure we have a URL before attempting re-initiation
      if (!downloadInfo.url) {
        console.error('❌ CRITICAL ERROR: Cannot re-initiate download - URL is missing!');
        console.error('   downloadInfo keys:', Object.keys(downloadInfo));
        console.error('   This should not happen - URL should always be present in downloadInfo');
        // Try to get URL from scanResult as fallback
        if (scanResult && scanResult.url) {
          console.log('   Using URL from scanResult as fallback:', scanResult.url.substring(0, 100));
          downloadInfo.url = scanResult.url;
        } else {
          console.error('   No URL available anywhere - cannot re-initiate download');
          // Show error notification to user
          if (browserAPI.notifications && browserAPI.notifications.create) {
            try {
              browserAPI.notifications.create(`download-error-missing-url-${Date.now()}`, {
                type: 'basic',
                iconUrl: browserAPI.runtime.getURL('logo.png'),
                title: '⚠️ Download Error',
                message: `Could not re-initiate download for "${downloadInfo.filename || 'file'}". URL is missing. Please try downloading again from the website.`,
                buttons: [{ title: 'OK' }]
              });
            } catch (notifError) {
              console.error('❌ Could not create error notification:', notifError);
            }
          }
          return; // Can't proceed without URL
        }
      }
      
      if (downloadInfo.url && browserAPI.downloads && browserAPI.downloads.download) {
        try {
          // CRITICAL: Prefer finalUrl over url when re-initiating
          // finalUrl is the actual file URL after redirects, url might be an HTML redirect page
          let urlToUse = downloadInfo.finalUrl || downloadInfo.url;
          
          // If we have both URLs and they're different, log it
          if (downloadInfo.finalUrl && downloadInfo.url && downloadInfo.finalUrl !== downloadInfo.url) {
            console.log('📋 Using finalUrl (after redirects) instead of original URL');
            console.log('   Original URL:', downloadInfo.url.substring(0, 100));
            console.log('   Final URL:', downloadInfo.finalUrl.substring(0, 100));
          }
          
          // Check if URL might be an HTML page (common issue with redirects)
          const urlLower = urlToUse.toLowerCase();
          const isLikelyHtml = urlLower.endsWith('.htm') || 
                              urlLower.endsWith('.html') || 
                              (urlLower.includes('/download') && !urlLower.match(/\.(exe|zip|pdf|doc|xls|ppt|mp4|mp3|jpg|png|iso|bin|dll|apk|ipa|msi|deb|rpm|pkg|tar|gz|rar|7z|txt|csv|json|xml|msix|appx|app|dmg|pkg)$/i));
          
          if (isLikelyHtml) {
            console.warn('⚠️ WARNING: URL might be an HTML page instead of a file:', urlToUse.substring(0, 100));
            console.warn('   This can happen if the download URL redirects to an HTML page');
            console.warn('   Chrome should follow redirects to get the actual file, but if it doesn\'t, you may get an HTML file');
            console.warn('   If this happens, try downloading directly from the website without the extension');
          }
          
          // CRITICAL: Mark URL as temporarily approved BEFORE calling downloads.download()
          // This allows onCreated to recognize it immediately when it fires
          // Use a short expiry (5 seconds) so it only works for this re-initiation
          const normalizedUrl = normalizeUrlForApproval(urlToUse);
          approvedDownloads.set(normalizedUrl, Date.now());
          console.log('✅ Marked URL as temporarily approved for re-initiation:', normalizedUrl);
          console.log('   This approval expires in 5 seconds (only for this re-initiation)');
          
          console.log('🔵 STEP 8.1: Preparing download parameters');
          const downloadParams = {
            url: urlToUse,
            saveAs: false
          };
          
          // Ensure we have a valid filename - sanitize it for Chrome's requirements
          let filenameToUse = downloadInfo.filename || downloadInfo.url.split('/').pop() || 'download.bin';
          
          // Extract filename from path if it contains path separators
          if (filenameToUse.includes('/') || filenameToUse.includes('\\')) {
            const pathParts = filenameToUse.replace(/\\/g, '/').split('/');
            filenameToUse = pathParts[pathParts.length - 1];
          }
          
          // Sanitize filename: remove invalid characters for Windows/Chrome
          // Chrome doesn't allow: < > : " | ? * \x00-\x1f
          filenameToUse = filenameToUse.replace(/[<>:"|?*\x00-\x1f]/g, '_');
          
          // Remove leading/trailing dots and spaces (Windows doesn't allow these)
          filenameToUse = filenameToUse.replace(/^[.\s]+|[.\s]+$/g, '');
          
          // Limit filename length (max 255 chars)
          if (filenameToUse.length > 255) {
            const lastDot = filenameToUse.lastIndexOf('.');
            if (lastDot > 0) {
              const ext = filenameToUse.substring(lastDot);
              const name = filenameToUse.substring(0, 255 - ext.length);
              filenameToUse = name + ext;
            } else {
              filenameToUse = filenameToUse.substring(0, 255);
            }
          }
          
          // Ensure filename is not empty after sanitization
          if (!filenameToUse || filenameToUse.trim() === '' || filenameToUse === 'download.bin') {
            // Try to extract from URL
            try {
              const urlObj = new URL(downloadInfo.url);
              const urlPath = urlObj.pathname;
              const urlFileName = urlPath.split('/').pop() || 'download';
              filenameToUse = decodeURIComponent(urlFileName);
              // Sanitize again
              filenameToUse = filenameToUse.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
              if (!filenameToUse || filenameToUse.trim() === '') {
                filenameToUse = 'download.bin';
              }
            } catch (e) {
              filenameToUse = 'download.bin';
            }
          }
          
          // Only add filename parameter if it's valid and not the default
          // Chrome's downloads.download() will determine the filename from the URL if we don't provide it
          if (filenameToUse && filenameToUse !== 'download.bin' && filenameToUse.trim() !== '') {
            downloadParams.filename = filenameToUse;
          } else {
            // Don't set filename parameter - let Chrome determine it from the URL
            // This avoids "Invalid filename" errors
            console.log('   Not setting filename parameter - Chrome will determine from URL');
          }
          
          console.log('   Download parameters:', {
            url: downloadInfo.url.substring(0, 100),
            filename: filenameToUse,
            saveAs: downloadParams.saveAs,
            hasFilename: !!downloadParams.filename
          });
          
          // Chrome API uses callback, browser API uses Promise
          console.log('🔵 STEP 8.2: Calling downloads.download()');
          console.log('   Browser type:', typeof browser !== 'undefined' ? 'Firefox (Promise)' : 'Chrome (Callback)');
          console.log('   Note: If you see "Could not determine file size from HEAD request, using default timeout"');
          console.log('   This is a harmless Chrome warning - Chrome will use a default timeout for the download.');
          let newDownloadId;
          if (typeof browser !== 'undefined') {
            // Firefox - Promise-based
            console.log('   Using Firefox Promise-based API');
            try {
              newDownloadId = await browserAPI.downloads.download(downloadParams);
              console.log('   Firefox API returned downloadId:', newDownloadId);
            } catch (error) {
              console.error('   Firefox download error:', error);
              throw error;
            }
          } else {
            // Chrome - Callback-based, promisify it
            console.log('   Using Chrome Callback-based API');
            newDownloadId = await new Promise((resolve, reject) => {
              console.log('   Setting up Chrome callback...');
              try {
                browserAPI.downloads.download(downloadParams, (downloadId) => {
                  const lastError = chrome.runtime.lastError;
                  if (lastError) {
                    // Filter out the harmless HEAD request warning
                    const errorMsg = lastError.message;
                    if (errorMsg && errorMsg.includes('Could not determine file size from HEAD request')) {
                      console.log('   ℹ️ Chrome warning about HEAD request (harmless - using default timeout)');
                      // This is just a warning, not an error - continue with download
                      // Chrome will still attempt the download with default timeout
                      if (downloadId !== undefined) {
                        console.log('   Chrome callback success (despite warning), downloadId:', downloadId);
                        resolve(downloadId);
                        return;
                      }
                    }
                    console.error('   Chrome callback error:', errorMsg);
                    reject(new Error(errorMsg));
                  } else {
                    console.log('   Chrome callback success, downloadId:', downloadId);
                    resolve(downloadId);
                  }
                });
              } catch (error) {
                console.error('   Chrome download exception:', error);
                reject(error);
              }
            });
          }
          
          console.log('✅ Download re-initiated after user approval, new ID:', newDownloadId);
          console.log('   Download is marked with wasApproved/isReinitiated flags to allow re-initiation');
          console.log('   Note: Subsequent downloads of the same file will be scanned again (no URL-based approval)');
          console.log('   Original download ID:', downloadInfo.downloadId);
          console.log('   Re-initiated download URL:', downloadInfo.url?.substring(0, 100));
          
          // CRITICAL: Mark new download ID as suggested IMMEDIATELY to prevent onCreated from cancelling it
          // This must happen before onCreated fires (which can happen very quickly)
          suggestedDownloads.add(newDownloadId);
          console.log('✅ Marked new download ID as suggested:', newDownloadId);
          
          // CRITICAL: Store placeholder in pendingScanResults IMMEDIATELY (synchronously) 
          // This must happen BEFORE onCreated fires to prevent it from cancelling the download
          // Use urlToUse (which might be finalUrl) instead of downloadInfo.url
          pendingScanResults.set(newDownloadId, {
            url: urlToUse, // Use the actual URL we're downloading (might be finalUrl)
            finalUrl: urlToUse, // Store finalUrl as well
            filename: downloadInfo.filename || filenameToUse,
            suggest: null, // Not needed - download is already approved
            downloadInfo: { url: urlToUse, filename: downloadInfo.filename || filenameToUse, originalId: newDownloadId },
            wasApproved: true, // Flag to indicate this was user-approved
            isReinitiated: true // Flag to indicate this is a re-initiated download
          });
          console.log('✅ Created placeholder in pendingScanResults for new download ID (BEFORE onCreated can fire)');
          console.log('   Stored URL:', urlToUse.substring(0, 100));
          console.log('   Stored filename:', downloadInfo.filename || filenameToUse);
          
          // Clean up old entry and lock
          if (scanResult && scanResult.lockKey) {
            pendingScanResults.delete(scanResult.lockKey);
            console.log('✅ Cleaned up old lock key:', scanResult.lockKey);
          }
          pendingScanResults.delete(downloadInfo.downloadId);
          console.log('✅ Cleaned up old download ID from pendingScanResults:', downloadInfo.downloadId);
          // Also mark old download ID as suggested (for cleanup)
          suggestedDownloads.add(downloadInfo.downloadId);
          console.log('✅ Marked old download ID as suggested (for cleanup):', downloadInfo.downloadId);
          
          // Verify download started successfully
          console.log('🔵 STEP 8.3: Verifying download started');
          try {
            // Wait a tiny bit to let the download initialize
            console.log('   Waiting 100ms for download to initialize...');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if download exists and is in progress
            if (browserAPI.downloads && browserAPI.downloads.search) {
              console.log('   Searching for re-initiated download with ID:', newDownloadId);
              const downloads = await browserAPI.downloads.search({ id: newDownloadId });
              console.log('   Verification search results:', downloads?.length || 0, 'download(s) found');
              if (downloads && downloads.length > 0) {
                const download = downloads[0];
                console.log('✅ Verified re-initiated download exists:', {
                  id: download.id,
                  state: download.state,
                  url: download.url?.substring(0, 100),
                  bytesReceived: download.bytesReceived,
                  totalBytes: download.totalBytes,
                  paused: download.paused
                });
                
                if (download.state === 'in_progress' || download.state === 'complete') {
                  console.log('✅ Download is proceeding successfully');
                  console.log('═══════════════════════════════════════════════════════════');
                  console.log('🔵 SUCCESS: Download re-initiated and verified');
                  console.log('═══════════════════════════════════════════════════════════');
                } else if (download.state === 'interrupted') {
                  console.warn('⚠️ Download was interrupted - might need to resume');
                  console.warn('   Download state:', download.state);
                } else {
                  console.warn('⚠️ Download exists but state is unexpected:', download.state);
                }
              } else {
                console.warn('⚠️ Re-initiated download not found in search - might have failed');
                console.warn('   This could mean the download was blocked or failed to start');
              }
            } else {
              console.warn('   Cannot verify download - downloads.search not available');
            }
          } catch (verifyError) {
            console.error('❌ Error verifying re-initiated download:', verifyError);
            console.error('   Verify error message:', verifyError.message);
            console.error('   Verify error stack:', verifyError.stack);
            // Don't throw - download might still be starting
          }
          console.log('🔵 STEP 8 COMPLETE: Download re-initiation flow finished');
        } catch (downloadError) {
          console.error('═══════════════════════════════════════════════════════════');
          console.error('❌ ERROR: Could not re-initiate download');
          console.error('═══════════════════════════════════════════════════════════');
          console.error('   Error name:', downloadError.name);
          console.error('   Error message:', downloadError.message);
          console.error('   Error stack:', downloadError.stack);
          console.error('   Error details:', {
            message: downloadError.message,
            name: downloadError.name,
            url: downloadInfo.url?.substring(0, 100),
            filename: downloadInfo.filename
          });
          console.error('═══════════════════════════════════════════════════════════');
          
          // Show user-friendly error
          if (browserAPI.notifications && browserAPI.notifications.create) {
            try {
              console.log('   Showing error notification to user');
              browserAPI.notifications.create(`download-fallback-failed-${Date.now()}`, {
                type: 'basic',
                iconUrl: browserAPI.runtime.getURL('logo.png'),
                title: '⚠️ Download Error',
                message: `Could not start download for "${downloadInfo.filename || 'file'}". The download may have been blocked or the URL is invalid. Please try downloading again from the website.`,
                buttons: [{ title: 'OK' }]
              });
              console.log('   Error notification created');
            } catch (notifError) {
              console.error('❌ Could not create error notification:', notifError);
            }
          }
        }
      } else {
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ ERROR: Cannot re-initiate download - missing requirements');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('   downloadInfo.url:', downloadInfo.url);
        console.error('   browserAPI.downloads available:', !!browserAPI.downloads);
        console.error('   browserAPI.downloads.download available:', !!browserAPI.downloads?.download);
        if (!downloadInfo.url) {
          console.error('   ❌ Missing URL in downloadInfo');
        }
        if (!browserAPI.downloads || !browserAPI.downloads.download) {
          console.error('   ❌ Downloads API not available');
        }
        console.error('═══════════════════════════════════════════════════════════');
      }
    } catch (error) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ FATAL ERROR: Exception in button click handler');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('   Error name:', error.name);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      console.error('═══════════════════════════════════════════════════════════');
    }
  } else if (buttonIndex === 1) {
    // Block/Cancel download (second button - "No, Cancel" or "No, Block Download")
    console.log('🚫 User cancelled/blocked download:', downloadInfo.filename);
    console.log('   Scan status:', downloadInfo.scanStatus || 'unknown');
    // Don't call suggest() - this blocks the download permanently
    // Clean up pending scan result and lock
    if (downloadInfo.downloadId) {
      const scanResult = pendingScanResults.get(downloadInfo.downloadId);
      pendingScanResults.delete(downloadInfo.downloadId);
      // Clean up lock if exists
      if (scanResult && scanResult.lockKey) {
        pendingScanResults.delete(scanResult.lockKey);
      }
      // Clean up active notification tracking
      activeNotificationsByDownloadId.delete(downloadInfo.downloadId);
      console.log('🚫 Download blocked by user (suggest() not called)');
    }
  }
  
  // Clear notification and clean up tracking
  if (browserAPI.notifications && browserAPI.notifications.clear) {
    browserAPI.notifications.clear(notificationId);
  }
  // Clean up active notification tracking
  if (downloadInfo && downloadInfo.downloadId) {
    activeNotificationsByDownloadId.delete(downloadInfo.downloadId);
  }
  });
} else {
  console.warn('⚠️ Notifications API (onButtonClicked) is not available');
}

// Handle notification clicks (clicking notification body = allow if scan passed)
// Only register if notifications API is available
// NOTE: This is a fallback - button clicks are handled by onButtonClicked above
if (browserAPI.notifications && browserAPI.notifications.onClicked) {
  browserAPI.notifications.onClicked.addListener(async (notificationId) => {
  // CRITICAL: Check if this notification was already processed by onButtonClicked
  // If it was, don't process it again (prevents duplicate handling)
  if (processedNotifications.has(notificationId)) {
    console.log('⚠️ Notification already processed by button handler, ignoring onClicked:', notificationId);
    return;
  }
  
  const downloadInfo = pendingDownloads.get(notificationId);
  
  if (!downloadInfo) {
    return;
  }
  
  // CRITICAL: Mark as processed to prevent duplicate handling
  processedNotifications.add(notificationId);
  
  // Only auto-allow if scan passed (not if scan failed)
  if (downloadInfo.scanFailed) {
    console.log('⚠️ Scan failed, not auto-allowing download');
    return;
  }
  
  // If scan passed and user clicks notification, allow download
  if (downloadInfo.url && downloadInfo.scanPassed && downloadInfo.downloadId) {
    console.log('✅ User clicked notification - allowing download');
    pendingDownloads.delete(notificationId);
    
    try {
      // REMOVED: URL-based approval - files should be scanned EVERY time
      // We no longer mark URLs as approved - only use download ID-based flags
      
      // Get the suggest callback from pendingScanResults
      const scanResult = pendingScanResults.get(downloadInfo.downloadId);
      
      // CRITICAL: Always re-initiate downloads when user approves
      // Don't try to use suggest() or resume - just start a new download
      // This avoids "Download must be in progress" errors
      console.log('🔄 Starting download after user approval');
      if (downloadInfo.url && browserAPI.downloads && browserAPI.downloads.download) {
        try {
          // CRITICAL: Prefer finalUrl over url when re-initiating
          // finalUrl is the actual file URL after redirects, url might be an HTML redirect page
          let urlToUse = downloadInfo.finalUrl || downloadInfo.url;
          
          // If we have both URLs and they're different, log it
          if (downloadInfo.finalUrl && downloadInfo.url && downloadInfo.finalUrl !== downloadInfo.url) {
            console.log('📋 Using finalUrl (after redirects) instead of original URL');
            console.log('   Original URL:', downloadInfo.url.substring(0, 100));
            console.log('   Final URL:', downloadInfo.finalUrl.substring(0, 100));
          }
          
          // Check if URL might be an HTML page
          const urlLower = urlToUse.toLowerCase();
          const isLikelyHtml = urlLower.endsWith('.htm') || 
                              urlLower.endsWith('.html') || 
                              (urlLower.includes('/download') && !urlLower.match(/\.(exe|zip|pdf|doc|xls|ppt|mp4|mp3|jpg|png|iso|bin|dll|apk|ipa|msi|deb|rpm|pkg|tar|gz|rar|7z|txt|csv|json|xml|msix|appx|app|dmg|pkg)$/i));
          
          if (isLikelyHtml) {
            console.warn('⚠️ WARNING: URL might be an HTML page:', urlToUse.substring(0, 100));
            console.warn('   Chrome will follow redirects to get the actual file');
          }
          
          const downloadParams = {
            url: urlToUse,
            saveAs: false
          };
          // Sanitize filename before adding to downloadParams
          if (downloadInfo.filename) {
            let sanitizedFilename = downloadInfo.filename;
            
            // Extract filename from path if it contains path separators
            if (sanitizedFilename.includes('/') || sanitizedFilename.includes('\\')) {
              const pathParts = sanitizedFilename.replace(/\\/g, '/').split('/');
              sanitizedFilename = pathParts[pathParts.length - 1];
            }
            
            // Sanitize filename: remove invalid characters for Windows/Chrome
            sanitizedFilename = sanitizedFilename.replace(/[<>:"|?*\x00-\x1f]/g, '_');
            sanitizedFilename = sanitizedFilename.replace(/^[.\s]+|[.\s]+$/g, '');
            
            // Limit filename length
            if (sanitizedFilename.length > 255) {
              const lastDot = sanitizedFilename.lastIndexOf('.');
              if (lastDot > 0) {
                const ext = sanitizedFilename.substring(lastDot);
                const name = sanitizedFilename.substring(0, 255 - ext.length);
                sanitizedFilename = name + ext;
              } else {
                sanitizedFilename = sanitizedFilename.substring(0, 255);
              }
            }
            
            // Only add if valid
            if (sanitizedFilename && sanitizedFilename.trim() !== '' && sanitizedFilename !== 'download.bin') {
              downloadParams.filename = sanitizedFilename;
            }
          }
          
          // Chrome API uses callback, browser API uses Promise
          // Note: Chrome may show "Could not determine file size from HEAD request" warning
          // This is harmless - Chrome will use a default timeout for the download
          let newDownloadId;
          if (typeof browser !== 'undefined') {
            // Firefox - Promise-based
            newDownloadId = await browserAPI.downloads.download(downloadParams);
          } else {
            // Chrome - Callback-based, promisify it
            newDownloadId = await new Promise((resolve, reject) => {
              browserAPI.downloads.download(downloadParams, (downloadId) => {
                const lastError = chrome.runtime.lastError;
                if (lastError) {
                  // Filter out the harmless HEAD request warning
                  const errorMsg = lastError.message;
                  if (errorMsg && errorMsg.includes('Could not determine file size from HEAD request')) {
                    console.log('   ℹ️ Chrome warning about HEAD request (harmless - using default timeout)');
                    // This is just a warning, not an error - continue with download
                    if (downloadId !== undefined) {
                      resolve(downloadId);
                      return;
                    }
                  }
                  reject(new Error(errorMsg));
                } else {
                  resolve(downloadId);
                }
              });
            });
          }
          
          console.log('✅ Download started after user approval, new ID:', newDownloadId);
          // Clean up old entry and lock
          if (scanResult && scanResult.lockKey) {
            pendingScanResults.delete(scanResult.lockKey);
          }
          pendingScanResults.delete(downloadInfo.downloadId);
          return; // Success
        } catch (downloadError) {
          console.error('❌ Could not start download:', downloadError);
          // Show error notification
          if (browserAPI.notifications && browserAPI.notifications.create) {
            try {
              browserAPI.notifications.create(`download-reinit-failed-${Date.now()}`, {
                type: 'basic',
                iconUrl: browserAPI.runtime.getURL('logo.png'),
                title: '⚠️ Download Error',
                message: `Could not start download for "${downloadInfo.filename}". Please try downloading again from the website.`,
                buttons: [{ title: 'OK' }]
              });
            } catch (notifError) {
              console.error('❌ Could not create error notification:', notifError);
            }
          }
          return;
        }
      } else {
        console.error('❌ No download URL or downloads API available');
        if (!downloadInfo.url) {
          console.error('   Missing URL in downloadInfo');
        }
        if (!browserAPI.downloads || !browserAPI.downloads.download) {
          console.error('   Downloads API not available');
        }
      }
    } catch (error) {
      console.error('❌ Error allowing download:', error);
    }
    
    if (browserAPI.notifications && browserAPI.notifications.clear) {
      browserAPI.notifications.clear(notificationId);
    }
  }
  });
} else {
  console.warn('⚠️ Notifications API (onClicked) is not available');
}

// REMOVED: All old ad blocker code (loadFilterListsFromAPI, parseFilterListSimple, createYouTubeAdBlockerRules, etc.)
// REMOVED: All old ad blocker code removed - replaced with uBlock-style ad blocker using declarativeNetRequest API

// Listen for storage changes
browserAPI.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    // If auth token changed, toggle features accordingly
    if (changes.auth_token) {
      const newToken = changes.auth_token.newValue;
      if (!newToken) {
        console.log('🔒 Logged out: disabling features');
        // Turn off protection and feature toggles, and remove rules
        browserAPI.storage.local.set({
          protectionEnabled: false,
          adBlockerEnabled: false,
          downloadScanEnabled: false
        });
        // Inform all tabs that protection is now off
        try {
          browserAPI.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
              if (tab.id) {
                browserAPI.tabs.sendMessage(tab.id, {
                  type: 'PROTECTION_STATE_CHANGED',
                  enabled: false
                }).catch((error) => {
                  // Tab might not have content script or tab is closed - that's okay
                  // Silently ignore "Receiving end does not exist" and connection errors
                  if (error.message && !error.message.includes('Receiving end does not exist') && 
                      !error.message.includes('Could not establish connection')) {
                    console.log('⚠️ Could not send message to tab:', error.message);
                  }
                });
              }
            });
          });
        } catch (e) {
          // Ignore errors
        }
        updateAdBlocker(false);
      } else {
        // Logged in: re-evaluate current settings and protection state
        browserAPI.storage.local.get(['protectionEnabled', 'adBlockerEnabled']).then(({ protectionEnabled, adBlockerEnabled }) => {
          const shouldEnable = (protectionEnabled !== false) && (adBlockerEnabled !== false);
          updateAdBlocker(shouldEnable);
        });
      }
    }

    // Check protection state first
    if (changes.protectionEnabled) {
      const protectionEnabled = changes.protectionEnabled.newValue !== false;
      console.log('🛡️ Protection state changed in storage:', protectionEnabled);
      if (!protectionEnabled) {
        // Protection disabled, disable ad blocker
        updateAdBlocker(false);
        autoPageScanEnabled = false;
        pendingAutoPageScans.clear();
      } else {
        // Protection enabled, check ad blocker setting
        browserAPI.storage.local.get('adBlockerEnabled').then((result) => {
          const enabled = result.adBlockerEnabled !== false;
          updateAdBlocker(enabled);
        });
      }
    } else if (changes.adBlockerEnabled) {
      // Check if protection is enabled before updating ad blocker
      browserAPI.storage.local.get('protectionEnabled').then((result) => {
        if (result.protectionEnabled !== false) {
          const enabled = changes.adBlockerEnabled.newValue !== false;
          updateAdBlocker(enabled);
        } else {
          // Protection is disabled, don't enable ad blocker
          console.log('🛡️ Protection disabled, ignoring ad blocker toggle');
          updateAdBlocker(false);
        }
      });
    }
    if (changes.autoPageScanEnabled) {
      autoPageScanEnabled = changes.autoPageScanEnabled.newValue === true;
      console.log('⚙️ Auto page scan setting updated:', autoPageScanEnabled);
      if (!autoPageScanEnabled) {
        pendingAutoPageScans.clear();
      }
    }
  }
});


