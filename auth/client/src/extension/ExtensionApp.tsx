import { useState, useEffect, useCallback } from 'react';
import { Toaster } from '@/components/ui/toaster';
import MorphingScene from '@/components/MorphingScene';
import ExtensionLogin from './components/ExtensionLogin';
import ExtensionRegister from './components/ExtensionRegister';
import ExtensionDashboard from './components/ExtensionDashboard';
import { extensionAuth } from './lib/extensionAuth';
import { authSync } from './lib/authSync';

type View = 'login' | 'register' | 'dashboard';

export default function ExtensionApp() {
  const [view, setView] = useState<View>('login');
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      // Only check for auth in extension storage - don't auto-sync from web app
      // Auto-syncing would cause unwanted auto-login without user consent
      const token = await extensionAuth.getToken();
      const user = await extensionAuth.getUser();
      
      console.log('🔍 ExtensionApp: checkAuth', { hasToken: !!token, hasUser: !!user, currentView: view });
      
      if (token && user) {
        console.log('✅ ExtensionApp: Auth found, switching to dashboard');
        setView('dashboard');
      } else {
        // No token or user - ensure we're on login screen
        console.log('⚠️ ExtensionApp: No auth, switching to login');
        setView('login');
      }
    } catch (error) {
      console.error('ExtensionApp: error in checkAuth', error);
      setView('login');
    } finally {
      setIsLoading(false);
    }
  }, [view]);

  useEffect(() => {
    checkAuth();
    
    // Listen for storage changes to sync auth across all popup windows
    // This ensures all open popups show the same user
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local') {
        // Check if auth_token or user changed
        if (changes.auth_token || changes.user) {
          console.log('🔄 ExtensionApp: Storage change detected', { 
            authTokenChanged: !!changes.auth_token, 
            userChanged: !!changes.user 
          });
          checkAuth();
        }
      }
    };
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
      
      // Also poll for auth changes periodically (in case storage event doesn't fire)
      // This is useful when auth is synced from website
      // Use shorter interval initially for faster detection
      let pollCount = 0;
      let slowPollInterval: NodeJS.Timeout | null = null;
      const pollInterval = setInterval(() => {
        checkAuth();
        pollCount++;
        // After 5 checks (10 seconds), switch to slower polling
        if (pollCount >= 5 && !slowPollInterval) {
          clearInterval(pollInterval);
          // Start slower polling
          slowPollInterval = setInterval(() => {
            checkAuth();
          }, 10000); // Check every 10 seconds after initial period
        }
      }, 2000); // Check every 2 seconds initially for faster detection
      
      // Cleanup listener on unmount
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
        clearInterval(pollInterval);
        if (slowPollInterval) {
          clearInterval(slowPollInterval);
        }
      };
    }
  }, [checkAuth]);

  const handleLoginSuccess = () => {
    setView('dashboard');
  };

  const handleRegisterSuccess = () => {
    setView('dashboard');
  };

  const handleLogout = async () => {
    await extensionAuth.clearAll();
    setView('login');
  };

  if (isLoading) {
    return (
      <>
        <MorphingScene />
        <div className="relative z-10 flex min-h-[500px] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col" style={{ height: '500px', maxHeight: '500px' }}>
      <MorphingScene  />
      <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
      {view === 'login' && (
        <ExtensionLogin
          onSuccess={handleLoginSuccess}
          onSwitchToRegister={() => setView('register')}
        />
      )}
      {view === 'register' && (
        <ExtensionRegister
          onSuccess={handleRegisterSuccess}
          onSwitchToLogin={() => setView('login')}
        />
      )}
      {view === 'dashboard' && <ExtensionDashboard onLogout={handleLogout} />}
      <Toaster />
      </div>
    </div>
  );
}
