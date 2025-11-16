import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LogOut, RefreshCw, Download, Settings as SettingsIcon } from 'lucide-react';
import Logo from '@/components/Logo';
import { Link } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import apiClient from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

type LogType = 'pages' | 'downloads' | 'network' | 'passwords' | 'all';

interface ActivityLog {
  id: string;
  timestamp: string;
  type: string;
  result: 'safe' | 'unsafe' | 'clean' | 'infected';
  threatLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
  source: string;
  details?: any;
}

export default function Dashboard() {
  const { user, logout, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isExtensionEnabled, setIsExtensionEnabled] = useState(true);
  const [activeFilter, setActiveFilter] = useState<LogType>('all');
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load extension protection state on mount
  useEffect(() => {
    loadExtensionState();
    
    // Listen for extension state changes from content script
    const handleExtensionStateChange = (event: CustomEvent) => {
      if (event.detail && typeof event.detail.protectionEnabled === 'boolean') {
        setIsExtensionEnabled(event.detail.protectionEnabled);
      }
    };
    
    // Listen for extension context invalidated events
    const handleExtensionContextInvalidated = () => {
      console.warn('⚠️ Extension context invalidated - extension may have been reloaded');
      toast({
        title: 'Extension reloaded',
        description: 'Please reload this page to reconnect to the extension',
        variant: 'destructive',
      });
    };
    
    window.addEventListener('extension-state-change', handleExtensionStateChange as EventListener);
    window.addEventListener('extension-context-invalidated', handleExtensionContextInvalidated);
    
    return () => {
      window.removeEventListener('extension-state-change', handleExtensionStateChange as EventListener);
      window.removeEventListener('extension-context-invalidated', handleExtensionContextInvalidated);
    };
  }, [toast]);

  const loadExtensionState = async () => {
    try {
      // Try to get extension state via content script
      if (typeof window !== 'undefined') {
        // Request extension state from content script
        const message = { type: 'GET_EXTENSION_PROTECTION_STATE' };
        
        // Use postMessage to communicate with content script
        // Use window.location.origin instead of '*' to avoid COOP issues
        try {
          window.postMessage(message, window.location.origin);
        } catch (error) {
          // COOP policy might block postMessage, silently fail
          console.warn('postMessage blocked by COOP policy:', error);
        }
        
        // Also check if we can directly access chrome extension API (if in extension context)
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          try {
            const runtimeId = chrome.runtime.id;
            if (runtimeId) {
              chrome.runtime.sendMessage(
                runtimeId,
                { type: 'GET_PROTECTION_STATE' },
                (response) => {
                  if (chrome.runtime.lastError) {
                    // Check if error is due to invalidated context
                    if (chrome.runtime.lastError.message && 
                        chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                      console.warn('Extension context invalidated, extension may have been reloaded');
                      return;
                    }
                    // Extension not available, that's okay
                    console.log('Extension not available for state check');
                  } else if (response && typeof response?.enabled === 'boolean') {
                    setIsExtensionEnabled(response.enabled);
                  }
                }
              );
            }
          } catch (error) {
            // Check if error is due to invalidated context
            if (error.message && error.message.includes('Extension context invalidated')) {
              console.warn('Extension context invalidated');
              return;
            }
            // Not in extension context, use content script method
            console.log('Not in extension context, using content script');
          }
        }
      }
    } catch (error) {
      console.error('Error loading extension state:', error);
    }
  };

  // Wait for auth to load and user to be authenticated before loading logs
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      // Small delay to ensure token is synced from extension
      const timer = setTimeout(() => {
        loadLogs();
      }, 800);
      return () => clearTimeout(timer);
    } else if (!authLoading && !isAuthenticated) {
      // User is not authenticated, redirect to login
      console.warn('⚠️ User not authenticated, redirecting to login');
    }
  }, [activeFilter, authLoading, isAuthenticated, user]);

  const loadLogs = async () => {
    // Check if user is authenticated before attempting to load logs
    if (!isAuthenticated || !user) {
      console.warn('⚠️ Cannot load logs: user not authenticated');
      return;
    }

    // Verify token is available
    const token = apiClient.getToken();
    if (!token) {
      console.warn('⚠️ Cannot load logs: no auth token available');
      // Wait a bit for token sync, then retry once
      setTimeout(async () => {
        const retryToken = apiClient.getToken();
        if (retryToken) {
          console.log('🔄 Retrying log load after token sync...');
          await loadLogs();
        } else {
          toast({
            title: 'Authentication required',
            description: 'Please login to view logs',
            variant: 'destructive',
          });
        }
      }, 1000);
      return;
    }

    setIsLoading(true);
    try {
      console.log('📥 Loading logs, filter:', activeFilter === 'all' ? 'all' : activeFilter);
      console.log('🔑 Token present:', !!token);
      const response = await apiClient.getLogs(
        activeFilter === 'all' ? undefined : activeFilter
      );
      
      console.log('📥 Logs API response:', response);
      
      if (response.success && response.data) {
        // API client wraps server response: { success: true, data: { success: true, logs: [...] } }
        // Server returns: { success: true, logs: [...] }
        const logs = response.data.logs || [];
        console.log(`✅ Loaded ${logs.length} logs from API`);
        
        // Sort logs by timestamp descending (newest first)
        const sortedLogs = logs.sort((a: ActivityLog, b: ActivityLog) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeB - timeA;
        });
        
        setLogs(sortedLogs);
      } else {
        // API call failed - log error but don't use mock data
        const errorMessage = response.error || 'Failed to load logs';
        console.error('❌ Failed to load logs:', errorMessage);
        
        // If unauthorized, the token might not be synced yet
        if (errorMessage.includes('Not authorized') || errorMessage.includes('401')) {
          console.log('🔄 Unauthorized error, waiting for token sync and retrying...');
          setTimeout(async () => {
            const retryToken = apiClient.getToken();
            if (retryToken) {
              console.log('🔄 Retrying log load after token sync...');
              await loadLogs();
            }
          }, 1500);
          return;
        }
        
        toast({
          title: 'Failed to load logs',
          description: errorMessage,
          variant: 'destructive',
        });
        // Set empty array if API fails
        setLogs([]);
      }
    } catch (error) {
      console.error('❌ Error loading logs:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while loading logs';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      // Set empty array on error
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtensionToggle = async (enabled: boolean) => {
    setIsExtensionEnabled(enabled);
    
    try {
      // Try to send message to extension via content script
      if (typeof window !== 'undefined') {
        // Send message via postMessage to content script
        // Use window.location.origin instead of '*' to avoid COOP issues
        try {
        window.postMessage({
          type: 'SET_EXTENSION_PROTECTION_STATE',
          enabled: enabled
          }, window.location.origin);
        } catch (error) {
          // COOP policy might block postMessage, silently fail
          console.warn('postMessage blocked by COOP policy:', error);
        }
        
        // Also try direct chrome extension API if available
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          try {
            // Check if we can access chrome.runtime.id
            const runtimeId = chrome.runtime.id;
            if (runtimeId) {
              chrome.runtime.sendMessage(
                runtimeId,
                {
                  type: 'SET_PROTECTION_STATE',
                  enabled: enabled
                },
                (response) => {
                  if (chrome.runtime.lastError) {
                    // Check if error is due to invalidated context
                    if (chrome.runtime.lastError.message && 
                        chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                      console.warn('Extension context invalidated, extension may have been reloaded');
                      toast({
                        title: 'Extension reloaded',
                        description: 'Please reload the page and try again',
                        variant: 'destructive',
                      });
                    } else {
                      console.log('Extension not available for state update');
                    }
                  } else {
                    console.log('✅ Extension protection state updated:', enabled);
                  }
                }
              );
            }
          } catch (error) {
            // Check if error is due to invalidated context
            if (error.message && error.message.includes('Extension context invalidated')) {
              console.warn('Extension context invalidated');
              toast({
                title: 'Extension reloaded',
                description: 'Please reload the page and try again',
                variant: 'destructive',
              });
            } else {
              console.log('Not in extension context, using content script');
            }
          }
        }
        
        toast({
          title: `Extension ${enabled ? 'enabled' : 'disabled'}`,
          description: enabled ? 'Protection is now active' : 'Protection has been turned off',
        });
      }
    } catch (error) {
      console.error('Error toggling extension:', error);
      
      // Check if error is due to invalidated context
      if (error.message && error.message.includes('Extension context invalidated')) {
        toast({
          title: 'Extension reloaded',
          description: 'Please reload the page and try again',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update extension state',
          variant: 'destructive',
        });
      }
    }
  };

  const handleExport = async () => {
    if (activeFilter === 'all') {
      toast({
        title: 'Select a filter',
        description: 'Please select a specific log type to export',
        variant: 'destructive',
      });
      return;
    }

    const response = await apiClient.exportLogs(activeFilter);
    if (response.success) {
      toast({
        title: 'Export successful',
        description: 'Your logs have been exported',
      });
    }
  };

  const getThreatBadge = (level: string, result: string) => {
    if (result === 'safe' || result === 'clean') {
      return <Badge className="bg-success text-success-foreground">Safe</Badge>;
    }
    
    switch (level) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'medium':
        return <Badge className="bg-warning text-warning-foreground">Medium</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge className="bg-success text-success-foreground">Safe</Badge>;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-transparent">
      {/* Header */}
      <header className="bg-transparent">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Logo size="md" />
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link to="/settings">
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </Button>
              <Button variant="ghost" onClick={async () => {
                await logout();
                window.location.href = '/login';
              }}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Welcome back, {user?.name || 'User'}</CardTitle>
                <CardDescription>Manage your security settings and view activity</CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Extension</span>
                  <Switch
                    checked={isExtensionEnabled}
                    onCheckedChange={handleExtensionToggle}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={loadLogs}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Activity Logs Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Activity Logs</CardTitle>
                <CardDescription>View and filter your security activity</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export Data
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filter Buttons */}
            <div className="mb-6 flex flex-wrap gap-2">
              <Button
                variant={activeFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setActiveFilter('all')}
              >
                All Activity
              </Button>
              <Button
                variant={activeFilter === 'pages' ? 'default' : 'outline'}
                onClick={() => setActiveFilter('pages')}
              >
                Pages Scanned
              </Button>
              <Button
                variant={activeFilter === 'downloads' ? 'default' : 'outline'}
                onClick={() => setActiveFilter('downloads')}
              >
                Downloads Scanned
              </Button>
              <Button
                variant={activeFilter === 'network' ? 'default' : 'outline'}
                onClick={() => setActiveFilter('network')}
              >
                Network Checked
              </Button>
              <Button
                variant={activeFilter === 'passwords' ? 'default' : 'outline'}
                onClick={() => setActiveFilter('passwords')}
              >
                Passwords Checked
              </Button>
            </div>

            {/* Logs Table */}
            <div className="rounded-[23px] border border-white/33" style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              backgroundBlendMode: 'plus-lighter',
              boxShadow: '-11.15px -10.392px 48px -12px rgba(0, 0, 0, 0.15), -1.858px -1.732px 12px -8px rgba(0, 0, 0, 0.15), 1.858px 1.732px 8px 0 rgba(255, 255, 255, 0.12) inset, 0.929px 0.866px 4px 0 rgba(255, 255, 255, 0.12) inset',
              backdropFilter: 'blur(2px)',
            }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Threat Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No activity logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatTimestamp(log.timestamp)}</TableCell>
                        <TableCell className="capitalize">
                          {log.type.replace('_', ' ')}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{log.source}</TableCell>
                        <TableCell>{getThreatBadge(log.threatLevel, log.result)}</TableCell>
                        <TableCell>{getThreatBadge(log.threatLevel, log.result)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
