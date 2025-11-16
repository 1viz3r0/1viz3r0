import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { useAuthSync } from '@/hooks/useAuthSync';

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Listen for auth changes from extension
  useAuthSync(async () => {
    console.log('🔄 Auth sync event received');
    // Get token from localStorage (content script may have just synced it)
    const token = localStorage.getItem('auth_token');
    
    if (token) {
      // Update API client with the new token
      await apiClient.setToken(token);
      console.log('✅ Token synced to API client');
      
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          // Only set user if we have valid user data
          if (userData && userData.name && userData.email) {
            console.log('✅ User synced from extension:', userData.name, userData.email);
            setUser(userData);
          } else {
            console.warn('⚠️ Invalid user data in localStorage:', userData);
          }
        } catch (error) {
          console.error('Error parsing user data from sync:', error);
        }
      } else {
        console.warn('⚠️ No user data in localStorage despite having token');
      }
    } else {
      console.log('🔄 Token cleared, removing user');
      await apiClient.setToken(null);
      setUser(null);
    }
  });

  useEffect(() => {
    // Check if user is already logged in (from web app's own localStorage only)
    // Don't auto-sync from extension - users should explicitly log in to web app
    const initializeAuth = async () => {
      try {
                // Wait for content script to potentially sync auth from extension
        // Content script runs on page load and may take a moment
        await new Promise(resolve => setTimeout(resolve, 500));
        

        // Get token from apiClient (awaited since it's async)
        const token = await apiClient.getToken();
        // Also check localStorage directly as fallback
        const localStorageToken = localStorage.getItem('auth_token');
        const finalToken = token || localStorageToken;
        
        console.log('🔍 Initializing auth, token present:', !!finalToken);
        
        if (finalToken) {
          // Set token in apiClient if it wasn't already set
          if (!token && localStorageToken) {
            await apiClient.setToken(localStorageToken);
          }
          
          // Try to get user from localStorage first (faster, no network call)
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            try {
              const userData = JSON.parse(storedUser);
              if (userData && userData.name && userData.email) {
                console.log('✅ User loaded from localStorage:', userData.name, userData.email);
                setUser(userData);
                // Validate token in background only - don't block UI or clear user on errors
                validateTokenInBackground(finalToken);
                // Skip the main validation since we already have a user
                return;
              }
            } catch (error) {
              console.error('Error parsing stored user:', error);
            }
          }
          
          // If no stored user, validate token with backend to get user data
          // This prevents auto-login with stale/invalid tokens
          // But don't clear token on network errors - only on actual auth failures
          try {
            console.log('📡 Validating token with backend (no stored user)...');
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const profileResponse = await fetch(`${API_BASE_URL}/auth/me`, {
              headers: {
                'Authorization': `Bearer ${finalToken}`,
                'Content-Type': 'application/json'
              },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              if (profileData.success && profileData.user) {
                const userData = profileData.user;
                // Validate user data has required fields
                if (userData && userData.name && userData.email) {
                  console.log('✅ Token validated, user authenticated:', userData.name, userData.email);
                  localStorage.setItem('user', JSON.stringify(userData));
                  setUser(userData);
                } else {
                  console.warn('⚠️ Invalid user data from API:', userData);
                  // Clear invalid data
                  await apiClient.setToken(null);
                  localStorage.removeItem('user');
                }
              } else {
                console.warn('⚠️ Invalid response from API:', profileData);
                // Clear invalid token
                await apiClient.setToken(null);
                localStorage.removeItem('user');
              }
            } else if (profileResponse.status === 401 || profileResponse.status === 403) {
              // Token is invalid or expired - clear it
              console.warn('⚠️ Token validation failed (auth error):', profileResponse.status);
              await apiClient.setToken(null);
              localStorage.removeItem('user');
              localStorage.removeItem('auth_token');
              setUser(null);
            } else {
              // Other error (500, network, etc.) - don't clear token, keep user logged in
              console.warn('⚠️ Token validation failed (non-auth error):', profileResponse.status);
              // Keep token - might be temporary server issue
              // Don't set user since we don't have stored user and validation failed
            }
          } catch (error) {
            // Network error or timeout - don't clear token
            if (error instanceof Error && error.name === 'AbortError') {
              console.warn('⚠️ Token validation timeout - keeping token');
            } else if (error instanceof TypeError && error.message === 'Failed to fetch') {
              console.warn('⚠️ Token validation network error - keeping token');
            } else {
              console.error('Error validating token:', error);
            }
            // Don't clear token on network errors - user might be offline or server down
            // Don't set user since validation failed
          }
        } else {
          console.log('🔍 No token found, user not authenticated');
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Helper function to validate token in background without blocking
    // Only clears user if token is explicitly invalid (401/403)
    // Ignores network errors to prevent logout on reload
    const validateTokenInBackground = async (token: string) => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for background
        
        const profileResponse = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          if (profileData.success && profileData.user) {
            const userData = profileData.user;
            if (userData && userData.name && userData.email) {
              // Update user data if it changed
              localStorage.setItem('user', JSON.stringify(userData));
              setUser(userData);
              console.log('✅ Background token validation successful');
            }
          }
        } else if (profileResponse.status === 401 || profileResponse.status === 403) {
          // Only clear if token is explicitly invalid (not expired, but actually wrong)
          console.warn('⚠️ Background validation: Token invalid (401/403) - clearing auth');
          await apiClient.setToken(null);
          localStorage.removeItem('user');
          localStorage.removeItem('auth_token');
          setUser(null);
        } else {
          // Other errors (500, network, etc.) - keep user logged in
          console.warn('⚠️ Background validation: Non-auth error, keeping user logged in');
        }
      } catch (error) {
        // Ignore all background validation errors (network, timeout, etc.)
        // Don't log or clear - user should stay logged in
        if (error instanceof Error && error.name !== 'AbortError') {
          console.warn('⚠️ Background validation error (ignored):', error.message);
        }
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await apiClient.login(email, password);
      
      if (response.success && response.data) {
        // Backend returns { success: true, token, user }
        // apiClient returns { success: true, data: { success: true, token, user } }
        const responseData = response.data as any;
        // Handle both nested and direct response formats
        const token = responseData.token || (responseData.success && responseData.data?.token);
        const userData = responseData.user || (responseData.success && responseData.data?.user);
        
        if (token && userData) {
          apiClient.setToken(token);
          localStorage.setItem('auth_token', token);
          localStorage.setItem('user', JSON.stringify(userData));
          setUser(userData);
          // Trigger storage event to notify other components
          window.dispatchEvent(new Event('storage'));
          toast({
            title: 'Login successful',
            description: 'Welcome back!',
          });
          return true;
        }
      }
      
      toast({
        title: 'Login failed',
        description: response.error || 'Invalid credentials',
        variant: 'destructive',
      });
      return false;
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: 'Login failed',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const register = async (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<boolean> => {
    try {
      const response = await apiClient.register(data);
      
      if (response.success && response.data) {
        // Registration now requires OTP verification
        // This function will return true to indicate registration initiated
        // The actual login will happen after OTP verification
        toast({
          title: 'Registration initiated',
          description: 'Please verify your email and phone number',
        });
        return true;
      } else {
        toast({
          title: 'Registration failed',
          description: response.error || 'Please try again',
          variant: 'destructive',
        });
        return false;
      }
    } catch (error) {
      toast({
        title: 'Registration failed',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const logout = async () => {
    // Call backend logout endpoint to clear any server-side cookies
    try {
      await apiClient.logout();
    } catch (error) {
      // Ignore errors - we'll clear client-side storage anyway
    }
    
    // Clear all localStorage items
    localStorage.clear();
    
    // Clear all sessionStorage items
    sessionStorage.clear();
    
    // Clear all cookies
    document.cookie.split(";").forEach((c) => {
      const eqPos = c.indexOf("=");
      const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
      // Clear cookie for current domain and all paths
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`;
    });
    
    // Clear API client token
    await apiClient.setToken(null);
    setUser(null);
    
    // Also clear from extension storage if in extension context
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await chrome.storage.local.clear();
      } catch (error) {
        // Ignore errors
      }
    }
    
    // Force a state update to ensure UI reflects logout immediately
    window.dispatchEvent(new Event('storage'));
    setIsLoading(false);
    
    toast({
      title: 'Logged out',
      description: 'You have been logged out successfully.',
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
