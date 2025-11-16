/// <reference types="chrome" />
import React, { useState, useEffect, useRef } from 'react';
import { Shield, Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/apiClient';

interface Log {
  id: string;
  timestamp: string;
  type: string;
  result: 'safe' | 'unsafe' | 'clean' | 'infected';
  threatLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
  source: string;
  details?: any;
}

interface ProtectionTabProps {
  protectionEnabled: boolean;
}

export default function ProtectionTab({ protectionEnabled }: ProtectionTabProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [adBlockerEnabled, setAdBlockerEnabled] = useState(false);
  const [downloadScanEnabled, setDownloadScanEnabled] = useState(false);
  const [autoPageScanEnabled, setAutoPageScanEnabled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [recentLogs, setRecentLogs] = useState<Log[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [scanningUrl, setScanningUrl] = useState<string | null>(null); // Track current scan URL for UI
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const aggressivePollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastScanUrlRef = useRef<string | null>(null);
  const scanStartTimeRef = useRef<number | null>(null);
  const { toast } = useToast();

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        try {
          const result = await chrome.storage.local.get(['auth_token', 'user']);
          const hasAuth = !!(result.auth_token && result.user);
          setIsAuthenticated(hasAuth);
          
          // If not authenticated, disable all features
          if (!hasAuth) {
            setAdBlockerEnabled(false);
            setDownloadScanEnabled(false);
            setAutoPageScanEnabled(false);
          }
        } catch (error) {
          console.error('Error checking auth:', error);
          setIsAuthenticated(false);
        }
      }
    };
    
    checkAuth();
    
    // Listen for auth changes
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
        if (changes.auth_token || changes.user) {
          checkAuth();
        }
      };
      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }
  }, []);
  
  // Load feature states from storage
  useEffect(() => {
    const loadFeatureStates = async () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        try {
          const result = await chrome.storage.local.get(['adBlockerEnabled', 'downloadScanEnabled', 'autoPageScanEnabled', 'auth_token']);
          const hasAuth = !!result.auth_token;
          
          // Only enable features if authenticated AND protection is enabled AND feature was previously enabled
          if (hasAuth) {
            setAdBlockerEnabled(protectionEnabled && (result.adBlockerEnabled !== false));
            setDownloadScanEnabled(protectionEnabled && (result.downloadScanEnabled !== false));
            setAutoPageScanEnabled(protectionEnabled && result.autoPageScanEnabled === true);
          } else {
            // Not authenticated - disable all features
            setAdBlockerEnabled(false);
            setDownloadScanEnabled(false);
            setAutoPageScanEnabled(false);
          }
        } catch (error) {
          console.error('Error loading feature states:', error);
        }
      }
    };
    
    loadFeatureStates();
  }, [protectionEnabled, isAuthenticated]);

  // Update feature states when protection is toggled
  useEffect(() => {
    if (!protectionEnabled) {
      // When protection is disabled, disable all features
      setAdBlockerEnabled(false);
      setDownloadScanEnabled(false);
      setAutoPageScanEnabled(false);
      
      // Save to storage
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({
          adBlockerEnabled: false,
          downloadScanEnabled: false,
          autoPageScanEnabled: false
        }).catch(console.error);
      }
      
      // Disable ad blocker in background
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'TOGGLE_AD_BLOCKER',
          enabled: false
        }).catch(console.error);
      }
    }
  }, [protectionEnabled]);

  // Load recent activity logs - ONLY on mount and when scans complete
  useEffect(() => {
    // Load logs immediately when component mounts (initial load only)
    loadRecentLogs();
    
    // Listen for scan completion events from background script and log clearing events
    const handleMessage = (message: any) => {
      if (message.type === 'PAGE_SCAN_COMPLETE' || message.type === 'DOWNLOAD_SCAN_COMPLETE' || message.type === 'AUTO_PAGE_SCAN_RESULT') {
        console.log('🔄 Scan completed - refreshing logs');
        // Refresh logs after a short delay to ensure server has saved the log
        setTimeout(() => {
          loadRecentLogs();
        }, 500);
        if (message.url) {
          setScanningUrl((prev) => (prev === message.url ? null : prev));
        }

        if (message.type === 'PAGE_SCAN_COMPLETE' && message.auto) {
          const critical =
            typeof message.critical === 'number'
              ? message.critical
              : message.details?.alerts?.critical ||
                message.details?.threatCounts?.critical ||
                0;
          const high =
            typeof message.high === 'number'
              ? message.high
              : message.details?.alerts?.high ||
                message.details?.threatCounts?.high ||
                0;
          const isUnsafe =
            message.result === 'unsafe' ||
            critical > 0 ||
            high > 0 ||
            message.threatLevel === 'high' ||
            message.threatLevel === 'critical';
          const displayUrl =
            message.url && message.url.length > 80
              ? `${message.url.substring(0, 77)}...`
              : message.url || 'Unknown site';

          toast({
            title: isUnsafe ? 'Unsafe site detected' : 'Site scanned: Safe',
            description: isUnsafe
              ? `${displayUrl} • ${critical} critical / ${high} high threats`
              : `${displayUrl} • No critical/high threats detected`,
            variant: isUnsafe ? 'destructive' : 'default',
          });
        }
      } else if (message.type === 'AUTO_PAGE_SCAN_STARTED') {
        if (message.url) {
          setScanningUrl(message.url);
        }
      } else if (message.type === 'AUTO_PAGE_SCAN_ERROR') {
        if (message.url) {
          setScanningUrl((prev) => (prev === message.url ? null : prev));
        }
        toast({
          title: 'Auto page scan failed',
          description: message.error || 'Unable to start automatic scan for this site',
          variant: 'destructive',
        });
      } else if (message.type === 'LOGS_CLEARED') {
        console.log('🔄 Logs cleared - refreshing activity logs');
        // Immediately refresh logs since they were just deleted
        setRecentLogs([]);
        loadRecentLogs();
        
        // Show a toast notification
        toast({
          title: 'Logs Cleared',
          description: `Deleted ${message.deletedCount || 0} activity log${message.deletedCount !== 1 ? 's' : ''}`,
        });
      }
    };
    
    // Also refresh when popup regains focus (user reopens popup)
    // This ensures logs are fresh when user opens the popup again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('🔄 Popup visible - refreshing logs');
        loadRecentLogs();
      }
    };
    
    // Listen for messages from background script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(handleMessage);
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.removeListener(handleMessage);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Clean up any polling intervals
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (aggressivePollingRef.current) {
        clearInterval(aggressivePollingRef.current);
        aggressivePollingRef.current = null;
      }
    };
  }, []);

  const loadRecentLogs = async (): Promise<Log[]> => {
    try {
      setIsLoadingLogs(true);
      
      // Fetch both page scans and download scans to show all recent activity
      const [pagesResponse, downloadsResponse] = await Promise.all([
        apiClient.getLogs('pages').catch(() => ({ success: false, data: { logs: [] } })),
        apiClient.getLogs('downloads').catch(() => ({ success: false, data: { logs: [] } }))
      ]);
      
      // Combine logs from both sources
      const pagesLogs = pagesResponse.success && pagesResponse.data ? (pagesResponse.data.logs || []) : [];
      const downloadsLogs = downloadsResponse.success && downloadsResponse.data ? (downloadsResponse.data.logs || []) : [];
      const allLogs = [...pagesLogs, ...downloadsLogs];
      
      console.log(`📥 Loaded ${pagesLogs.length} page logs and ${downloadsLogs.length} download logs`);
      
      // Sort combined logs by timestamp (newest first) and take top 5
      const sortedLogs = allLogs
        .sort((a: Log, b: Log) => {
          // Sort by timestamp descending (newest first)
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeB - timeA;
        })
        .slice(0, 5); // Show only latest 5
      
      console.log(`✅ Loaded ${sortedLogs.length} combined logs (pages + downloads)`);
        
      // Check if we just got results for the scan we initiated
        if (lastScanUrlRef.current && scanStartTimeRef.current) {
          const scanUrl = lastScanUrlRef.current;
          const scanStartTime = scanStartTimeRef.current;
          
          // Look for a log entry matching the scanned URL
          // Improved URL matching to handle various URL formats
          const normalizeUrlForComparison = (url: string): string => {
            let normalized = url.toLowerCase().trim();
            // Remove protocol
            normalized = normalized.replace(/^https?:\/\//, '');
            // Remove trailing slash
            normalized = normalized.replace(/\/$/, '');
            // Remove www. prefix for comparison
            normalized = normalized.replace(/^www\./, '');
            return normalized;
          };
          
          const scannedUrlNormalized = normalizeUrlForComparison(scanUrl);
          
          const matchingLog = sortedLogs.find((log: Log) => {
            const logUrlNormalized = normalizeUrlForComparison(log.source);
            
            // Check if normalized URLs match
            return logUrlNormalized === scannedUrlNormalized ||
                   logUrlNormalized.startsWith(scannedUrlNormalized + '/') ||
                   scannedUrlNormalized.startsWith(logUrlNormalized + '/');
          });
          
          // Check if this log was created after we started the scan
          if (matchingLog) {
            const logTime = new Date(matchingLog.timestamp).getTime();
            const timeSinceScanStart = logTime - scanStartTime;
            
            // If log was created after scan start (or within 5 seconds before, accounting for timing)
            if (timeSinceScanStart > -5000) {
              console.log('✅ Found scan result for initiated scan:', scanUrl);
              console.log(`   Result: ${matchingLog.result}, Threat: ${matchingLog.threatLevel}`);
              console.log(`   Time since scan: ${Math.round(timeSinceScanStart / 1000)}s`);
              
              // Clear scan tracking
              lastScanUrlRef.current = null;
              scanStartTimeRef.current = null;
              setScanningUrl(null); // Clear scanning indicator
              
              // Show success toast
              toast({
                title: 'Scan Complete',
                description: `Scan result: ${matchingLog.result === 'safe' ? 'Safe' : 'Unsafe'}`,
              });
            }
          }
        }
      setRecentLogs(sortedLogs);
      
      // Check for high-threat websites and notify background script
      // IMPORTANT: Only notify if there are ACTUAL threats (count > 0), not just based on threatLevel
      sortedLogs.forEach((log: Log) => {
        // Only check page logs for threats (downloads are handled separately)
        if (log.type === 'pages' && typeof chrome !== 'undefined' && chrome.runtime) {
          // Get threat counts from log details
          const critical = log.details?.alerts?.critical || log.details?.threatCounts?.critical || 0;
          const high = log.details?.alerts?.high || log.details?.threatCounts?.high || 0;
          
          // Only notify if there are ACTUAL threats (count > 0)
          const hasCriticalThreats = critical > 0;
          const hasHighThreats = high > 0;
          
          if (hasCriticalThreats || hasHighThreats) {
            // Notify background script about high-threat website with actual threat counts
            chrome.runtime.sendMessage({
              type: 'HIGH_THREAT_DETECTED',
              url: log.source,
              threatLevel: log.threatLevel,
              result: log.result,
              critical: critical,
              high: high,
              details: log.details
            }).catch(console.error);
          }
        }
      });
      
      return sortedLogs;
    } catch (error) {
      console.error('❌ Error loading logs:', error);
      // Don't clear existing logs on error - keep what we have
      return recentLogs;
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Helper function to handle invalid URLs (create log and close tab)
  const handleInvalidUrl = async (url: string, tabId: number) => {
    try {
      // Try to create log entry via API (server will handle if URL is invalid)
      // This ensures the log appears in Recent Activity
      try {
        await apiClient.scanPage(url);
      } catch (error) {
        // Expected to fail - server will create the log entry
        console.log('⚠️ Invalid URL error (expected):', error);
      }
      
      // Refresh logs to show the new entry
      setTimeout(() => {
        loadRecentLogs();
      }, 500);
      
      // Close the tab with invalid URL
      if (tabId && typeof chrome !== 'undefined' && chrome.tabs) {
        try {
          await chrome.tabs.remove(tabId);
          console.log('✅ Closed tab with invalid URL:', url);
        } catch (closeError) {
          console.error('❌ Failed to close tab:', closeError);
        }
      }
    } catch (error) {
      console.error('❌ Error handling invalid URL:', error);
    }
  };

  const handlePageScan = async () => {
    // Check if protection is enabled
    if (!protectionEnabled) {
      toast({
        title: 'Protection disabled',
        description: 'Please enable Protection to scan pages',
        variant: 'destructive',
      });
      return;
    }

    setIsScanning(true);
    try {
      // Check if we're in extension context
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        toast({
          title: 'Scan initiated',
          description: 'Demo mode: Page scan simulated',
        });
        setIsScanning(false);
        return;
      }

      // Get current tab URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url;
      
      if (!url) {
        toast({
          title: 'Scan failed',
          description: 'Could not get current page URL',
          variant: 'destructive',
        });
        setIsScanning(false);
        return;
      }

      // Check for browser internal URLs
      if (url.startsWith('chrome://') || 
          url.startsWith('chrome-extension://') ||
          url.startsWith('moz-extension://') ||
          url.startsWith('edge://') ||
          url.startsWith('about:') ||
          url.startsWith('file://') ||
          url.startsWith('data:') ||
          url === 'chrome://newtab/' ||
          url === 'about:blank') {
        toast({
          title: 'Cannot scan this page',
          description: 'Browser internal pages cannot be scanned. Please navigate to a regular website (http:// or https://)',
          variant: 'destructive',
        });
        setIsScanning(false);
        return;
      }

      // Check if URL is valid (must start with http:// or https://)
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // Invalid URL - create log entry and close tab (no toast)
        await handleInvalidUrl(url, tab.id);
        setIsScanning(false);
        return;
      }

      console.log('🔍 Starting page scan for:', url);
      
      // Make API request with timeout handling
      let response;
      try {
        response = await Promise.race([
          apiClient.scanPage(url),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout - Server took too long to respond')), 15000)
          )
        ]) as any;
      } catch (apiError: any) {
        // Check if it's an invalid URL error from the server
        // The error might be in different places depending on how it's thrown
        const errorMessage = apiError?.message || 
                           (apiError as any)?.error || 
                           apiError?.toString() || '';
        const errorData = (apiError as any)?.error || apiError;
        
        // Check if it's an invalid URL error
        if (errorMessage.includes('Invalid URL format') || 
            errorMessage.includes('URL must be a valid http:// or https://') ||
            (errorData && typeof errorData === 'object' && (
              errorData.message?.includes('Invalid URL format') ||
              errorData.message?.includes('URL must be a valid http:// or https://')
            ))) {
          // Server already created a log entry, just close the tab (no toast)
          console.log('⚠️ Invalid URL detected, closing tab:', url);
          await handleInvalidUrl(url, tab.id);
          setIsScanning(false);
          return;
        }
        // Re-throw other errors to be handled below
        throw apiError;
      }
      
      if (response.success) {
        console.log('✅ Scan initiated successfully:', response.data);
        const scanUrl = url;
        const scanStartTime = Date.now();
        
        // Store scan info for tracking
        lastScanUrlRef.current = scanUrl;
        scanStartTimeRef.current = scanStartTime;
        setScanningUrl(scanUrl); // Show scanning indicator in UI
        
        toast({
          title: 'Scan initiated',
          description: 'Scanning in progress. Results will appear in Recent Activity.',
        });
        
        // Refresh logs after scan initiation to show "scanning" state
        // Then refresh periodically to check for results (but not constantly)
        const refreshAfterDelay = async (delayMs: number) => {
          setTimeout(async () => {
            if (lastScanUrlRef.current === scanUrl) {
              console.log(`🔄 Checking for scan results after ${delayMs/1000}s`);
              await loadRecentLogs();
            }
          }, delayMs);
        };
        
        // Refresh at key intervals: 3s, 8s, 15s, 30s, 60s
        // This gives reasonable coverage without constant polling
        refreshAfterDelay(3000);   // 3 seconds
        refreshAfterDelay(8000);   // 8 seconds
        refreshAfterDelay(15000);  // 15 seconds
        refreshAfterDelay(30000);  // 30 seconds
        refreshAfterDelay(60000);  // 60 seconds
        
        // Clear scan tracking after 2 minutes if no results
        setTimeout(() => {
          if (lastScanUrlRef.current === scanUrl) {
            console.log('⏱️ Scan tracking cleared after 2 minutes');
            lastScanUrlRef.current = null;
            scanStartTimeRef.current = null;
            setScanningUrl(null); // Clear scanning indicator
            // Final refresh to get any results that might have appeared
            loadRecentLogs();
          }
        }, 120000); // 2 minutes
        
      } else {
        // Check if server created a log for invalid URL
        if (response.logged && (response.message?.includes('Invalid URL format') || 
            response.message?.includes('URL must be a valid http:// or https://'))) {
          // Server already created a log entry, just close the tab (no toast)
          console.log('⚠️ Invalid URL detected, closing tab:', url);
          await handleInvalidUrl(url, tab.id);
          setIsScanning(false);
          return;
        }
        
        console.error('❌ Scan failed:', response.error);
        toast({
          title: 'Scan failed',
          description: response.error || 'Could not initiate scan',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('❌ Error during page scan:', error);
      
      // Check if it's an invalid URL error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Invalid URL format') || 
          errorMessage.includes('URL must be a valid http:// or https://')) {
        // Server already created a log entry, just close the tab (no toast)
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (currentTab?.id && currentTab?.url) {
          console.log('⚠️ Invalid URL detected, closing tab:', currentTab.url);
          await handleInvalidUrl(currentTab.url, currentTab.id);
        }
        setIsScanning(false);
        return;
      }
      
      let finalErrorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        finalErrorMessage = error.message;
        // Handle specific error types
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
          finalErrorMessage = 'Cannot connect to server. Make sure the backend is running on http://localhost:5000';
        } else if (error.message.includes('timeout')) {
          finalErrorMessage = 'Request timed out. The server may be busy or ZAP is not responding.';
        } else if (error.name === 'DOMException') {
          finalErrorMessage = 'Network error. Check your connection and server status.';
        }
      }
      
      toast({
        title: 'Error',
        description: `Failed to scan page: ${finalErrorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleAutoPageScanToggle = async (enabled: boolean) => {
    if (enabled && !protectionEnabled) {
      toast({
        title: 'Protection disabled',
        description: 'Please enable Protection to use Auto Page Scan',
        variant: 'destructive',
      });
      return;
    }

    setAutoPageScanEnabled(enabled);

    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ autoPageScanEnabled: enabled });
    }

    toast({
      title: `Auto Page Scan ${enabled ? 'enabled' : 'disabled'}`,
    });
  };

  const handleAdBlockerToggle = async (enabled: boolean) => {
    // Can't enable if not authenticated
    if (enabled && !isAuthenticated) {
      toast({
        title: 'Login required',
        description: 'Please login to use Ad Blocker',
        variant: 'destructive',
      });
      return;
    }
    
    // Can't enable if protection is disabled
    if (enabled && !protectionEnabled) {
      toast({
        title: 'Protection disabled',
        description: 'Please enable Protection first to use Ad Blocker',
        variant: 'destructive',
      });
      return;
    }
    
    setAdBlockerEnabled(enabled);
    
    // Save to chrome storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ adBlockerEnabled: enabled });
    }
    
    // Notify background script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'TOGGLE_AD_BLOCKER',
        enabled: enabled
      }).catch(console.error);
    }
    
    try {
      await apiClient.toggleAdBlocker(enabled);
      toast({
        title: `Ad Blocker ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to toggle ad blocker',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadScanToggle = async (enabled: boolean) => {
    // Can't enable if not authenticated
    if (enabled && !isAuthenticated) {
      toast({
        title: 'Login required',
        description: 'Please login to use Download Scan',
        variant: 'destructive',
      });
      return;
    }
    
    // Can't enable if protection is disabled
    if (enabled && !protectionEnabled) {
      toast({
        title: 'Protection disabled',
        description: 'Please enable Protection first to use Download Scan',
        variant: 'destructive',
      });
      return;
    }
    
    setDownloadScanEnabled(enabled);
    
    // Save to chrome storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ downloadScanEnabled: enabled });
    }
    
    toast({
      title: `Download Scan ${enabled ? 'enabled' : 'disabled'}`,
    });
  };

  const getTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* Top Row: Page Scan and Ad Blocker */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="p-4">
            <Shield className="h-5 w-5 text-primary mb-2" />
            <CardTitle className="text-sm">Page Scan</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Button
              size="sm"
              className="w-full"
              onClick={handlePageScan}
              disabled={isScanning || !protectionEnabled}
            >
              {isScanning ? 'Scanning...' : 'Scan Now'}
            </Button>
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs">Auto page scan</span>
                <Switch
                  checked={autoPageScanEnabled && protectionEnabled && isAuthenticated}
                  onCheckedChange={handleAutoPageScanToggle}
                  disabled={!protectionEnabled || !isAuthenticated}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Automatically scan sites as soon as they open.
              </p>
            </div>
            {!protectionEnabled && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Enable Protection to scan
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <Eye className="h-5 w-5 text-primary mb-2" />
            <CardTitle className="text-sm">Ad Blocker</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-center justify-between">
              <span className="text-xs">Status</span>
              <Switch
                checked={adBlockerEnabled && protectionEnabled && isAuthenticated}
                onCheckedChange={handleAdBlockerToggle}
                disabled={!protectionEnabled || !isAuthenticated}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {!isAuthenticated ? 'Login required' : (adBlockerEnabled && protectionEnabled ? 'Active' : 'Inactive')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Second Row: Download Scan */}
      <div className="grid grid-cols-1 gap-3">
        <Card>
          <CardHeader className="p-4">
            <Download className="h-5 w-5 text-primary mb-2" />
            <CardTitle className="text-sm">Download Scan</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-center justify-between">
              <span className="text-xs">Auto-scan</span>
              <Switch
                checked={downloadScanEnabled && protectionEnabled && isAuthenticated}
                onCheckedChange={handleDownloadScanToggle}
                disabled={!protectionEnabled || !isAuthenticated}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {!isAuthenticated ? 'Login required' : (downloadScanEnabled && protectionEnabled ? 'Enabled' : 'Disabled')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Recent Activity</CardTitle>
              <CardDescription className="text-xs">
                {scanningUrl ? 'Scanning in progress...' : 'Latest security scans'}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {
                console.log('🔄 Manual refresh triggered');
                loadRecentLogs();
              }}
              title="Refresh logs"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <ScrollArea className="h-[120px]">
            <div className="space-y-2">
              {/* Show scanning indicator if scan is in progress */}
              {scanningUrl && (
                <div className="flex items-center gap-2 text-xs border-b pb-2 mb-2 animate-pulse">
                  <div className="h-2 w-2 bg-primary rounded-full" />
                  <span className="text-primary font-medium">
                    Scanning {scanningUrl.length > 40 ? scanningUrl.substring(0, 40) + '...' : scanningUrl}...
                  </span>
                </div>
              )}
              {isLoadingLogs && recentLogs.length === 0 ? (
                <div className="flex items-center justify-center py-4">
                  <div className="text-xs text-muted-foreground">Loading...</div>
                </div>
              ) : recentLogs.length === 0 ? (
                <div className="flex items-center justify-between text-xs border-b pb-2">
                  <span className="text-muted-foreground">No recent activity</span>
                </div>
              ) : (
                recentLogs.map((log) => {
                  const threatColor = 
                    log.threatLevel === 'critical' ? 'text-red-500' :
                    log.threatLevel === 'high' ? 'text-orange-500' :
                    log.threatLevel === 'medium' ? 'text-yellow-500' :
                    log.threatLevel === 'low' ? 'text-blue-500' : 'text-green-500';
                  
                  const statusColor = log.result === 'safe' || log.result === 'clean' ? 'text-green-500' : 'text-red-500';
                  
                  const date = new Date(log.timestamp);
                  const timeAgo = getTimeAgo(date);
                  
                  return (
                    <div key={log.id} className="flex items-center justify-between text-xs border-b pb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${statusColor}`}>
                            {log.result === 'safe' || log.result === 'clean' ? '✓ Safe' : '⚠ Unsafe'}
                          </span>
                          {log.threatLevel !== 'none' && (
                            <span className={threatColor}>
                              {log.threatLevel.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground truncate" title={log.source}>
                          {log.source}
                        </div>
                        <div className="text-muted-foreground text-[10px]">
                          {timeAgo}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
