/// <reference types="chrome" />

/**
 * Auth sync utility to share authentication between extension and web app
 */

export const authSync = {
  /**
   * Sync auth from web app to extension
   */
  async syncFromWebApp(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        // Query active tab to get auth token from webpage
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab.id) {
          const response = await chrome.tabs.sendMessage(tab.id, { 
            type: 'GET_AUTH_TOKEN' 
          });
          
          if (response?.token && response?.user) {
            await chrome.storage.local.set({ 
              auth_token: response.token,
              user: JSON.stringify(response.user)
            });
          }
        }
      } catch (error) {
        // No web app tab open or content script not available - this is normal
        // Silently handle - this is expected when extension popup is opened without web app tab
      }
    }
  },

  /**
   * Sync auth from extension to web app
   */
  async syncToWebApp(token: string, user: any): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab.id) {
          await chrome.tabs.sendMessage(tab.id, { 
            type: 'SET_AUTH_TOKEN',
            token,
            user
          });
        }
      } catch (error) {
        // No web app tab open or content script not available - this is normal
        // Silently handle - this is expected when extension popup is opened without web app tab
      }
    }
  },

  /**
   * Clear auth from both extension and web app
   */
  async clearAuth(): Promise<void> {
    // Clear extension storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove(['auth_token', 'user']);
    }
    
    // Clear web app storage
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab.id) {
          await chrome.tabs.sendMessage(tab.id, { 
            type: 'CLEAR_AUTH'
          });
        }
      } catch (error) {
        // No web app tab open or content script not available - this is normal
        // Silently handle - this is expected when extension popup is opened without web app tab
      }
    }
  }
};
