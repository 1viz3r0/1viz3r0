/// <reference types="chrome" />

/**
 * Content script to bridge communication between extension and web page
 * This allows sharing authentication state between the extension and web app
 */

// Type declaration for Firefox browser API (if not available, TypeScript will use chrome types)
declare const browser: typeof chrome | undefined;

// Cross-browser compatibility: Use 'browser' API (Firefox) or 'chrome' API (Chrome/Edge)
// Firefox uses 'browser' namespace, Chrome/Edge use 'chrome' namespace
const browserAPI: typeof chrome = typeof browser !== 'undefined' ? browser : chrome;

// Helper function to get the last error from runtime API (cross-browser)
function getRuntimeLastError(): { message?: string } | null {
  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.lastError) {
    return browser.runtime.lastError;
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
    return chrome.runtime.lastError;
  }
  return null;
}

// Helper function to check if extension context is valid
function isExtensionContextValid(): boolean {
  try {
    // Check for both browser and chrome APIs
    if (typeof browser !== 'undefined' && browser.runtime) {
      return browser.runtime.id !== undefined;
    }
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime.id !== undefined;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Listen for messages from the extension
// Wrap in try-catch to handle extension reload gracefully
try {
  if (browserAPI && browserAPI.runtime && browserAPI.runtime.onMessage) {
    browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Check if context is still valid
      if (!isExtensionContextValid()) {
        // Silently ignore - extension may have been reloaded
        return false;
      }
      
      try {
        if (request.type === 'GET_AUTH_TOKEN') {
          // Get auth token from web app's localStorage
          const token = localStorage.getItem('auth_token');
          const userStr = localStorage.getItem('user');
          const user = userStr ? JSON.parse(userStr) : null;
          
          sendResponse({ token, user });
        } else if (request.type === 'SET_AUTH_TOKEN') {
          // Set auth token in web app's localStorage
          if (request.token) {
            localStorage.setItem('auth_token', request.token);
          }
          if (request.user) {
            localStorage.setItem('user', JSON.stringify(request.user));
          }
          
          // Dispatch custom event to notify web app of auth change
          window.dispatchEvent(new CustomEvent('auth-sync', { 
            detail: { token: request.token, user: request.user } 
          }));
          
          sendResponse({ success: true });
        } else if (request.type === 'CLEAR_AUTH') {
          // Clear auth from web app's localStorage
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          
          // Dispatch custom event to notify web app
          window.dispatchEvent(new CustomEvent('auth-sync', { 
            detail: { cleared: true } 
          }));
          
          sendResponse({ success: true });
        } else if (request.type === 'PROTECTION_STATE_CHANGED') {
          // Extension protection state changed, notify web app
          window.dispatchEvent(new CustomEvent('extension-state-change', {
            detail: { protectionEnabled: request.enabled }
          }));
          sendResponse({ success: true });
        }
      } catch (error) {
        // Only log non-invalidation errors
        if (!error.message || !error.message.includes('Extension context invalidated')) {
          console.error('Error handling message:', error);
        }
        sendResponse({ success: false, error: error.message });
      }
      
      return true; // Keep message channel open for async response
    });
  }
} catch (error) {
  // Extension context invalidated during listener setup - this is expected when extension reloads
  // Silently handle - the extension will reconnect when it reloads
}

// Listen for messages from web app (via window.postMessage)
window.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.origin !== window.location.origin) return;
  
  // Check if extension context is valid before using chrome APIs
  if (!isExtensionContextValid()) {
    // Silently ignore - extension may have been reloaded
    return;
  }
  
  // Ensure browserAPI is available
  if (!browserAPI || !browserAPI.runtime) {
    console.warn('⚠️ Content script: browserAPI not available');
    return;
  }
  
  try {
    if (event.data.type === 'GET_EXTENSION_PROTECTION_STATE') {
      // Request protection state from extension
      safeBrowserCall(
        () => {
          browserAPI.runtime.sendMessage({ type: 'GET_PROTECTION_STATE' }, (response) => {
            const lastError = getRuntimeLastError();
            if (lastError) {
              // Check if error is due to invalidated context
              if (lastError.message && lastError.message.includes('Extension context invalidated')) {
                // Silently handle - extension may have been reloaded
                window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
                return;
              }
              // Extension not available - send default state
              window.dispatchEvent(new CustomEvent('extension-state-change', {
                detail: { protectionEnabled: true }
              }));
            } else {
              window.dispatchEvent(new CustomEvent('extension-state-change', {
                detail: { protectionEnabled: response?.enabled !== false }
              }));
            }
          });
          return true;
        },
        (error) => {
          // Silently handle - extension may have been reloaded
          window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
        }
      );
    } else if (event.data.type === 'SET_EXTENSION_PROTECTION_STATE') {
      // Set protection state in extension
      safeBrowserCall(
        () => {
          browserAPI.runtime.sendMessage({
            type: 'SET_PROTECTION_STATE',
            enabled: event.data.enabled
          }, (response) => {
            const lastError = getRuntimeLastError();
            if (lastError) {
              // Check if error is due to invalidated context
              if (lastError.message && lastError.message.includes('Extension context invalidated')) {
                // Silently handle - extension may have been reloaded
                window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
                return;
              }
              // Only log non-invalidation errors
              if (!lastError.message || !lastError.message.includes('Extension context invalidated')) {
                console.error('Failed to update extension protection state:', lastError);
              }
            } else {
              console.log('✅ Extension protection state updated:', event.data.enabled);
            }
          });
          return true;
        },
        (error) => {
          // Silently handle - extension may have been reloaded
          window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
        }
      );
    } else if (event.data.type === 'SYNC_AUTH_TO_EXTENSION') {
      // Sync auth from web app to extension (via content script bridge)
      // Don't try to get tab ID here - let background script get it from sender
      safeBrowserCall(
        () => {
          browserAPI.runtime.sendMessage({
            type: 'SET_AUTH_TOKEN',
            token: event.data.token,
            user: event.data.user
            // tabId will be extracted from sender in background script
          }, (response) => {
            const lastError = getRuntimeLastError();
            if (lastError) {
              console.error('❌ Error syncing auth to extension:', lastError);
            } else {
              console.log('✅ Auth synced to extension via content script, tab will close automatically');
            }
          });
          return true;
        },
        (error) => {
          console.error('Error syncing auth to extension:', error);
        }
      );
    } else if (event.data.type === 'CLOSE_TAB_REQUEST') {
      // Request to close tab (via content script bridge)
      // Don't try to get tab ID here - let background script get it from sender
      safeBrowserCall(
        () => {
          browserAPI.runtime.sendMessage({
            type: 'CLOSE_TAB'
            // tabId will be extracted from sender in background script
          }, (response) => {
            const lastError = getRuntimeLastError();
            if (lastError) {
              console.error('❌ Error closing tab:', lastError);
            } else {
              console.log('✅ Tab close request sent');
            }
          });
          return true;
        },
        (error) => {
          console.error('Error closing tab:', error);
        }
      );
    }
  } catch (error) {
    // Better error handling - check if it's a tabs API error (shouldn't happen but handle gracefully)
    if (error instanceof TypeError && error.message && error.message.includes('query')) {
      console.error('❌ Content script error: Attempted to access tabs API (not available in content scripts). This may be a cached version. Please reload the extension.');
      // Don't throw - just log and continue
    } else {
      console.error('Error processing postMessage:', error);
    }
  }
});

// Listen for auth changes in web app and sync to extension
window.addEventListener('storage', (e) => {
  if (e.key === 'auth_token' || e.key === 'user') {
    // Check if extension context is valid before sending message
    if (!isExtensionContextValid()) {
      return;
    }
    
    try {
      const token = localStorage.getItem('auth_token');
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      
      // Notify extension of auth change
      safeBrowserCall(
        () => {
          browserAPI.runtime.sendMessage({
            type: 'WEBAPP_AUTH_CHANGE',
            token,
            user
          }, (response) => {
            const lastError = getRuntimeLastError();
            if (lastError) {
              // Check if error is due to invalidated context
              if (lastError.message && lastError.message.includes('Extension context invalidated')) {
                // Silently handle - extension may have been reloaded
                window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
                return;
              }
              // Extension might not be listening, that's okay - don't log
            }
          });
          return true;
        },
        (error) => {
          // Extension context invalidated, silently fail
        }
      );
    } catch (error) {
      // Ignore errors if extension context is invalid
      if (error.message && !error.message.includes('Extension context invalidated')) {
        console.error('Error syncing auth to extension:', error);
      }
    }
  }
});

// Proactively sync auth from extension to web app when page loads
// This ensures the web app has the latest auth state when opened from extension
(async () => {
  try {
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      console.log('Content script: Extension context not available');
      return;
    }
    
    // Request auth from extension via background script
    // Content scripts should use messaging to communicate with extension
    safeBrowserCall(
        () => {
        browserAPI.runtime.sendMessage({ type: 'GET_EXTENSION_AUTH' }, (response) => {
          const lastError = getRuntimeLastError();
          if (lastError) {
            // Check if error is due to invalidated context
            if (lastError.message && lastError.message.includes('Extension context invalidated')) {
              // Silently handle - extension may have been reloaded, will reconnect automatically
              window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
              return;
            }
            // Extension not available - this is okay if extension is disabled or not installed
            return;
          }
          
          if (response && response.token && response.user) {
            // Set auth in web app's localStorage
            const userData = typeof response.user === 'string' ? JSON.parse(response.user) : response.user;
            localStorage.setItem('auth_token', response.token);
            localStorage.setItem('user', JSON.stringify(userData));
            
            // Dispatch event to notify web app of auth sync
            window.dispatchEvent(new CustomEvent('auth-sync', {
              detail: { token: response.token, user: userData }
            }));
            
            console.log('✅ Content script: Synced auth from extension to web app', userData.name || userData.email);
          }
        });
        return true;
      },
      (error) => {
        // Silently handle - extension may have been reloaded, will reconnect automatically
        window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
      }
    );
  } catch (error) {
    // Extension might not be available (this is okay if web app is used standalone)
    if (error.message && !error.message.includes('Extension context invalidated')) {
      console.log('Content script: Could not sync from extension:', error);
    }
  }
})();

// Wrap all browser API calls in a safe function that handles invalidated context
// Works with both Chrome and Firefox APIs
function safeBrowserCall<T>(
  apiCall: () => T,
  onError?: (error: Error) => void
): T | null {
  try {
    if (!isExtensionContextValid()) {
      if (onError) {
        onError(new Error('Extension context invalidated'));
      }
      return null;
    }
    return apiCall();
  } catch (error) {
    if (error instanceof Error && error.message.includes('Extension context invalidated')) {
      if (onError) {
        onError(error);
      }
      return null;
    }
    throw error;
  }
}

// Monitor extension context validity (less aggressive check)
let lastContextCheck = Date.now();
let contextInvalidatedNotified = false; // Track if we've already notified about invalidated context
const CONTEXT_CHECK_INTERVAL = 30000; // Check every 30 seconds (less frequent)

function checkExtensionContext() {
  // If context was already invalidated and we've notified, stop checking
  if (contextInvalidatedNotified) {
    return;
  }
  
  const now = Date.now();
  if (now - lastContextCheck < CONTEXT_CHECK_INTERVAL) {
    return;
  }
  lastContextCheck = now;
  
  // Check if browser API is available (Firefox or Chrome)
  if (typeof browser === 'undefined' && typeof chrome === 'undefined') {
    return;
  }
  
  if (!browserAPI || !browserAPI.runtime) {
    return;
  }
  
  try {
    // Just access runtime.id to verify context is valid (works for both browser and chrome APIs)
    const id = browserAPI.runtime.id;
    if (id) {
      // Context is valid, reset the notification flag if it was set
      contextInvalidatedNotified = false;
    }
  } catch (error) {
    // Context is invalidated
    if (!contextInvalidatedNotified) {
      contextInvalidatedNotified = true;
      // Only dispatch event, don't log warning (this is expected when extension reloads)
      window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
    }
  }
}

// Check context validity periodically (less frequent, and stop after first invalidation)
if (typeof window !== 'undefined') {
  setInterval(checkExtensionContext, CONTEXT_CHECK_INTERVAL);
}

console.log('ONE-Go Security: Content script loaded');

// Track user clicks on download links/buttons
// This allows us to distinguish user-initiated downloads from automatic ones
(function() {
  'use strict';
  
  // Function to check if an element is a download link/button
  // Made more aggressive to catch downloads on all websites
  function isDownloadElement(element) {
    if (!element) return false;
    
    // Check for download attribute (most reliable indicator)
    if (element.hasAttribute && element.hasAttribute('download')) {
      return true;
    }
    
    // Check for download-related href patterns
    if (element.href) {
      const href = element.href.toLowerCase();
      const downloadExtensions = [
        '.exe', '.dmg', '.pkg', '.deb', '.rpm', '.msi', '.zip', '.rar', '.7z', '.tar', '.gz',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm',
        '.mp3', '.wav', '.flac', '.aac', '.ogg',
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
        '.iso', '.img', '.bin', '.dll', '.so', '.dylib',
        '.apk', '.ipa', '.dmg', '.pkg', '.app', '.msix', '.appx'
      ];
      
      // Check if href points to a downloadable file
      if (downloadExtensions.some(ext => href.includes(ext))) {
        return true;
      }
      
      // Check for download-related URL patterns (more comprehensive)
      const downloadPatterns = [
        '/download', '/getfile', '/file', '/dl', '/get', '/fetch',
        '/save', '/export', '/backup', '/install', '/setup', '/installer',
        'download=true', 'download=1', 'dl=true', 'dl=1',
        'action=download', 'action=save', 'action=export'
      ];
      
      if (downloadPatterns.some(pattern => href.includes(pattern))) {
        return true;
      }
    }
    
    // Check for download-related classes/IDs (more comprehensive)
    const rawClassName = element.className;
    let classNameValue = '';
    if (typeof rawClassName === 'string') {
      classNameValue = rawClassName;
    } else if (rawClassName && typeof rawClassName === 'object') {
      if (typeof (rawClassName as any).baseVal === 'string') {
        classNameValue = (rawClassName as any).baseVal;
      } else if (typeof rawClassName.toString === 'function') {
        classNameValue = rawClassName.toString();
      }
    } else if (element.classList && typeof element.classList.value === 'string') {
      classNameValue = element.classList.value;
    }
    const className = classNameValue.toLowerCase();
    const id = (element.id || '').toLowerCase();
    const text = (element.textContent || '').toLowerCase().trim();
    const ariaLabel = (element.getAttribute && element.getAttribute('aria-label') || '').toLowerCase();
    const title = (element.getAttribute && element.getAttribute('title') || '').toLowerCase();
    
    // More comprehensive download-related keywords
    const downloadKeywords = [
      'download', 'dl', 'get file', 'save file', 'export', 'backup',
      'install', 'installer', 'setup', 'get software', 'get app',
      'save as', 'save file', 'download now', 'download file',
      'click to download', 'download here', 'get download'
    ];
    
    if (downloadKeywords.some(keyword => 
      className.includes(keyword) || 
      id.includes(keyword) ||
      text.includes(keyword) ||
      ariaLabel.includes(keyword) ||
      title.includes(keyword)
    )) {
      return true;
    }
    
    // Check if element is a button with download-related text
    const tagName = (element.tagName || '').toLowerCase();
    if ((tagName === 'button' || tagName === 'a') && text) {
      // Check for common download button text patterns
      const buttonTextPatterns = [
        /^download$/i,
        /^download\s+now$/i,
        /^get\s+download$/i,
        /^save$/i,
        /^install$/i,
        /^get\s+file$/i,
        /^download\s+file$/i
      ];
      
      if (buttonTextPatterns.some(pattern => pattern.test(text))) {
        return true;
      }
    }
    
    return false;
  }
  
  // Function to get the download URL from an element
  function getDownloadUrl(element) {
    // Check href first (most common)
    if (element.href && element.href.startsWith('http')) {
      return element.href;
    }
    
    // Check for data attributes (common in modern web apps)
    if (element.dataset) {
      if (element.dataset.url && element.dataset.url.startsWith('http')) {
        return element.dataset.url;
      }
      if (element.dataset.downloadUrl && element.dataset.downloadUrl.startsWith('http')) {
        return element.dataset.downloadUrl;
      }
      if (element.dataset.href && element.dataset.href.startsWith('http')) {
        return element.dataset.href;
      }
    }
    
    // Check for onclick handlers that might contain URLs
    if (element.onclick) {
      const onclickStr = element.onclick.toString();
      const urlMatch = onclickStr.match(/['"](https?:\/\/[^'"]+)['"]/);
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
      }
    }
    
    // Check for data-href attribute
    const dataHref = element.getAttribute && element.getAttribute('data-href');
    if (dataHref && dataHref.startsWith('http')) {
      return dataHref;
    }
    
    // If no specific URL found, return current page URL
    // This allows tracking downloads that are triggered by button clicks
    // but download from the same page or a related endpoint
    return window.location.href;
  }
  
  // Listen for clicks on download links/buttons
  // This tracks when users click download buttons/links so we can scan the file before allowing download
  // Made more aggressive to work on all websites
  document.addEventListener('click', function(event) {
    try {
      if (!isExtensionContextValid()) {
        return;
      }
      
      let target = event.target as HTMLElement | null;
      const currentPageUrl = window.location.href;
      
      // Walk up the DOM tree to find a download link/button (check up to 15 levels for nested elements)
      for (let i = 0; i < 15 && target; i++) {
        if (isDownloadElement(target)) {
          const downloadUrl = getDownloadUrl(target);
          
          // Track both the specific download URL (if available) and the current page URL
          // This ensures we can match downloads that come from the same page
          const urlsToTrack = [];
          
          if (downloadUrl && (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://'))) {
            urlsToTrack.push(downloadUrl);
          }
          
          // Always track the current page URL (important for downloads triggered by buttons)
          // This allows matching downloads from the same domain even if URL differs
          if (currentPageUrl && (currentPageUrl.startsWith('http://') || currentPageUrl.startsWith('https://'))) {
            urlsToTrack.push(currentPageUrl);
          }
          
          if (urlsToTrack.length > 0) {
            console.log('👆 Download click detected on:', currentPageUrl);
            if (downloadUrl && downloadUrl !== currentPageUrl) {
              console.log('   Potential download URL:', downloadUrl.substring(0, 100));
            }
            
            // Notify background script that user clicked a download link
            // Send all URLs to track (both specific download URL and page URL)
            if (browserAPI && browserAPI.runtime && browserAPI.runtime.sendMessage) {
              // For Firefox, sendMessage returns a Promise
              // For Chrome, it uses callbacks but we can wrap it
              const message = {
                type: 'USER_DOWNLOAD_CLICKED',
                url: downloadUrl || currentPageUrl, // Primary URL
                pageUrl: currentPageUrl, // Always include page URL for domain matching
                urls: urlsToTrack // All URLs to track
              };
              
              if (typeof browser !== 'undefined') {
                // Firefox - Promise-based API
                browserAPI.runtime.sendMessage(message).then(() => {
                  console.log('✅ Download click tracked in background script');
                }).catch((error) => {
                  // Extension context might be invalidated, that's okay
                  console.log('⚠️ Could not send download click message:', error);
                });
              } else {
                // Chrome - Callback-based API
                browserAPI.runtime.sendMessage(message, () => {
                  const lastError = getRuntimeLastError();
                  if (lastError) {
                    console.log('⚠️ Could not send download click message:', lastError.message);
                  } else {
                    console.log('✅ Download click tracked in background script');
                  }
                });
              }
            }
          }
          
          break;
        }
        
        target = target.parentElement;
      }
    } catch (error) {
      // Silently ignore errors - don't break the page
      console.log('⚠️ Error tracking download click:', error);
    }
  }, true); // Use capture phase to catch clicks early, before they're handled by the browser
})();
