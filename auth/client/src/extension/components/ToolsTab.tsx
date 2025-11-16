/// <reference types="chrome" />
import { useState } from 'react';
import { LayoutDashboard, Activity, Wifi, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/apiClient';
import { extensionAuth } from '../lib/extensionAuth';

export default function ToolsTab() {
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const { toast } = useToast();

  const openWebAppUrl = async (path: string) => {
    // Get the web app URL from environment or use default
    // This should point to where your web app dev server is running
    const webAppUrl = import.meta.env.VITE_WEB_APP_URL || 'http://localhost:8080';
    const fullUrl = `${webAppUrl}${path}`;
    
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        // Create the tab first
        const tab = await chrome.tabs.create({ url: fullUrl });
        
        // Wait a moment for the page to start loading, then sync auth
        setTimeout(async () => {
          try {
            const token = await extensionAuth.getToken();
            const user = await extensionAuth.getUser();
            
            if (token && user && tab.id) {
              // Send auth data to the content script on that tab
              chrome.tabs.sendMessage(tab.id, {
                type: 'SET_AUTH_TOKEN',
                token,
                user
              }).catch((error) => {
                // Content script might not be loaded yet, that's okay
                console.log('Could not sync auth immediately (content script not ready):', error);
              });
            }
          } catch (error) {
            console.error('Error syncing auth to web app:', error);
          }
        }, 1000); // Wait 1 second for content script to load
      } else {
        window.open(fullUrl, '_blank');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not open page. Make sure the web app is running at http://localhost:8080',
        variant: 'destructive',
      });
    }
  };

  const handleOpenDashboard = async () => {
    // Check if user is authenticated
    const token = await extensionAuth.getToken();
    if (token) {
      // User is authenticated, open dashboard
      await openWebAppUrl('/dashboard');
    } else {
      // User is not authenticated, open login page
      await openWebAppUrl('/login');
      toast({
        title: 'Please login',
        description: 'You need to login first to access the dashboard.',
      });
    }
  };
  
  const handleOpenActivity = async () => {
    // Activity is the same as dashboard for now
    await handleOpenDashboard();
  };

  const handleOpenSettings = async () => {
    // Check if user is authenticated
    const token = await extensionAuth.getToken();
    if (token) {
      // User is authenticated, open settings
      await openWebAppUrl('/settings');
    } else {
      // User is not authenticated, open login page
      await openWebAppUrl('/login');
      toast({
        title: 'Please login',
        description: 'You need to login first to access settings.',
      });
    }
  };

  const handleNetworkCheck = async () => {
    setIsCheckingNetwork(true);
    try {
      const response = await apiClient.checkNetwork();
      
      if (response.success && response.data) {
        toast({
          title: 'Network Check Complete',
          description: `Download: ${response.data.download} Mbps | Upload: ${response.data.upload} Mbps | Ping: ${response.data.ping}ms`,
        });
      } else {
        toast({
          title: 'Check failed',
          description: response.error || 'Could not check network',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check network speed',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingNetwork(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleOpenDashboard}>
          <CardHeader className="p-4">
            <LayoutDashboard className="h-5 w-5 text-primary mb-2" />
            <CardTitle className="text-sm">Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Button variant="outline" size="sm" className="w-full">
              Open
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleOpenActivity}>
          <CardHeader className="p-4">
            <Activity className="h-5 w-5 text-primary mb-2" />
            <CardTitle className="text-sm">Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Button variant="outline" size="sm" className="w-full">
              Open
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <Wifi className="h-5 w-5 text-primary mb-2" />
            <CardTitle className="text-sm">Network Check</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Button
              size="sm"
              className="w-full"
              onClick={handleNetworkCheck}
              disabled={isCheckingNetwork}
            >
              {isCheckingNetwork ? 'Checking...' : 'Check Now'}
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleOpenSettings}>
          <CardHeader className="p-4">
            <Settings className="h-5 w-5 text-primary mb-2" />
            <CardTitle className="text-sm">Settings</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Button variant="outline" size="sm" className="w-full">
              Open
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
