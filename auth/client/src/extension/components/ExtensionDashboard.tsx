import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { extensionAuth } from '../lib/extensionAuth';
import { authSync } from '../lib/authSync';
import ProtectionTab from './ProtectionTab';
import PrivacyTab from './PrivacyTab';
import ToolsTab from './ToolsTab';

interface ExtensionDashboardProps {
  onLogout: () => void;
}

export default function ExtensionDashboard({ onLogout }: ExtensionDashboardProps) {
  const [userName, setUserName] = useState('User');
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    loadUser();
    loadProtectionState();
    
    // Listen for storage changes to update user name when auth changes
    // This ensures all popups show the same user
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local') {
        // Check if user changed
        if (changes.user) {
          console.log('ExtensionDashboard: User changed in storage, updating name');
          loadUser();
        }
        // Check if auth_token was removed (logout)
        if (changes.auth_token && !changes.auth_token.newValue) {
          console.log('ExtensionDashboard: Auth token removed, user logged out');
          // User will be logged out, but we'll let ExtensionApp handle the view change
        }
      }
    };
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
      
      // Cleanup listener on unmount
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }
  }, []);

  const loadUser = async () => {
    const user = await extensionAuth.getUser();
    if (user) {
      setUserName(user.name);
    } else {
      // No user found - might have been logged out
      setUserName('User');
    }
  };

  const loadProtectionState = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.local.get('protectionEnabled');
        const protectionEnabled = result.protectionEnabled !== false; // Default to true
        setIsEnabled(protectionEnabled);
        
        // Notify background script of protection state
        if (chrome.runtime) {
          chrome.runtime.sendMessage({
            type: 'PROTECTION_STATE_CHANGED',
            enabled: protectionEnabled
          }).catch(() => {
            // Background script might not be ready, that's okay
          });
        }
      } catch (error) {
        console.error('Error loading protection state:', error);
      }
    }
  };

  const handleProtectionToggle = async (enabled: boolean) => {
    setIsEnabled(enabled);
    
    // Save to chrome storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ protectionEnabled: enabled });
      
      // Also disable individual features when protection is off
      if (!enabled) {
        await chrome.storage.local.set({
          adBlockerEnabled: false,
          downloadScanEnabled: false
        });
      }
      
      // Notify background script
      if (chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'PROTECTION_STATE_CHANGED',
          enabled: enabled
        }).catch(() => {
          // Background script might not be ready, that's okay
        });
      }
    }
  };

  const handleLogout = async () => {
    // Disable protection and ad blocker before clearing auth
    if (typeof chrome !== 'undefined' && chrome.storage) {
      // Disable protection
      await chrome.storage.local.set({ 
        protectionEnabled: false,
        adBlockerEnabled: false,
        downloadScanEnabled: false
      });
      
      // Notify background script to disable ad blocker
      if (chrome.runtime) {
        try {
          chrome.runtime.sendMessage({
            type: 'PROTECTION_STATE_CHANGED',
            enabled: false
          }).catch(() => {
            // Ignore errors
          });
        } catch (e) {
          // Ignore errors
        }
      }
    }
    
    // Clear auth from extension storage
    await authSync.clearAuth();
    await extensionAuth.clearAll();
    
    // Broadcast logout to all extension contexts
    // This ensures all open popups log out immediately
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({
          type: 'AUTH_CHANGED',
          token: null,
          user: null
        }).catch(() => {
          // Ignore errors - other contexts might not be listening
        });
      } catch (e) {
        // Ignore errors
      }
    }
    
    onLogout();
  };

  return (
    <div className="bg-transparent h-full flex flex-col">
      {/* Header */}
      <div className="p-4 bg-transparent flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Logo showSecurity size="sm" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="h-8 px-2"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">
            Welcome, {userName}
          </span>
          <div className={`text-xs font-medium ${isEnabled ? 'text-safe' : 'text-muted-foreground'}`}>
            {isEnabled ? 'Connected' : 'Not Connected'}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Protection</span>
          <Switch checked={isEnabled} onCheckedChange={handleProtectionToggle} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="protection" className="w-full flex flex-col flex-1 min-h-0">
        <TabsList className="w-full grid grid-cols-3 rounded-none flex-shrink-0 bg-transparent">
          <TabsTrigger value="protection">Protection</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto bg-transparent min-h-0">
          <TabsContent value="protection" className="m-0 p-4 bg-transparent">
            <ProtectionTab protectionEnabled={isEnabled} />
          </TabsContent>

          <TabsContent value="privacy" className="m-0 p-4 bg-transparent">
            <PrivacyTab />
          </TabsContent>

          <TabsContent value="tools" className="m-0 p-4 bg-transparent">
            <ToolsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
