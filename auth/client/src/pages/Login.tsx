import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Logo from '@/components/Logo';
import { X } from 'lucide-react';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/apiClient';

const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading: authLoading, user, logout } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false); // Track if we're closing the tab

  // Check if this page was opened from extension popup
  const isOpenedFromExtension = () => {
    // Check URL parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('extension') === 'true' || params.get('fromExtension') === 'true') {
      return true;
    }
    // Check if opened by extension (window.opener might be extension context)
    if (window.opener && typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        // If we can access chrome.runtime, we might be in extension context
        // But if we're in a popup opened by extension, we need to check differently
        return false; // We'll use URL parameter instead
      } catch (e) {
        return false;
      }
    }
    return false;
  };

  // Define handleGoogleLogin with useCallback so it can be used in useEffect
  const handleGoogleLogin = useCallback(async () => {
    // If already authenticated, handle redirect based on context
  if (isAuthenticated) {
      if (isOpenedFromExtension()) {
        window.close();
      } else {
    navigate('/dashboard', { replace: true });
      }
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Load Google Identity Services script if not already loaded
      if (!(window as any).google) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.defer = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Google script'));
          document.head.appendChild(script);
        });
      }

      const google = (window as any).google;
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      
      if (!clientId || clientId === 'your_google_client_id') {
        toast({
          title: 'Google sign-in not configured',
          description: 'Please configure Google OAuth client ID in environment variables',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      // Initialize and trigger Google Sign-In
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential: string }) => {
          try {
            console.log('🔐 Google ID token received, sending to backend...');
            const result = await apiClient.googleAuth(response.credential);
            
            console.log('📥 Google auth response:', result);
            
            if (result.success && result.data) {
              const responseData = result.data as any;
              
              // Check if OTP is required (new user or existing user needing verification)
              if (responseData.requiresOTP && responseData.sessionId) {
                setIsLoading(false); // Reset loading state before navigation
                console.log('📱 OTP required, redirecting to verification page');
                // Navigate to phone verification with fromExtension parameter if applicable
                const fromExtension = isOpenedFromExtension();
                const callbackUrl = fromExtension 
                  ? `/auth/google/callback?sessionId=${responseData.sessionId}&fromExtension=true`
                  : `/auth/google/callback?sessionId=${responseData.sessionId}`;
                navigate(callbackUrl);
              } else if (responseData.token && responseData.user) {
                // Existing user, log them in
                console.log('✅ Google auth successful, logging in user');
                await apiClient.setToken(responseData.token);
                localStorage.setItem('auth_token', responseData.token);
                localStorage.setItem('user', JSON.stringify(responseData.user));
                
                // Force AuthContext to update by dispatching storage event
                window.dispatchEvent(new Event('storage'));
                
                // If opened from extension, sync auth and close tab
                if (isOpenedFromExtension()) {
                  // Set closing state to prevent further rendering
                  setIsClosing(true);
                  
                  // Show success message
                  toast({
                    title: 'Login successful!',
                    description: 'Redirecting to extension...',
                    variant: 'default',
                  });
                  
                  // Sync auth to extension via content script
                  // Use window.postMessage to communicate with content script
                  console.log('📤 Syncing auth to extension via content script...');
                  
                  window.postMessage({
                    type: 'SYNC_AUTH_TO_EXTENSION',
                    token: responseData.token,
                    user: responseData.user
                  }, window.location.origin);
                  
                  // Request tab close after a delay
                  setTimeout(() => {
                    window.postMessage({
                      type: 'CLOSE_TAB_REQUEST'
                    }, window.location.origin);
                    
                    // Fallback: Try to close window directly if postMessage doesn't work
                    setTimeout(() => {
                      try {
                        window.close();
                      } catch (e) {
                        // window.close() may fail if window wasn't opened by script
                        console.log('⚠️ Could not close window directly, waiting for background script to close tab');
                      }
                    }, 500);
                  }, 1500);
                  
                  // Don't navigate - just wait for tab to close
                  return;
                } else {
                  // Navigate to dashboard immediately - force navigation
                  window.location.href = '/dashboard';
                }
                setIsLoading(false);
              } else {
                console.error('❌ Invalid response structure:', responseData);
                toast({
                  title: 'Google sign-in failed',
                  description: 'Invalid response from server. Please try again.',
                  variant: 'destructive',
                });
              }
            } else {
              console.error('❌ Google auth failed:', result.error);
              toast({
                title: 'Google sign-in failed',
                description: result.error || 'Please try again',
                variant: 'destructive',
              });
            }
          } catch (error: any) {
            console.error('❌ Google auth error:', error);
            const errorMessage = error?.message || error?.toString() || 'Unknown error';
            
            // Check for specific OAuth errors
            if (errorMessage.includes('invalid_client') || errorMessage.includes('no registered origin')) {
              const currentOrigin = window.location.origin;
              toast({
                title: 'OAuth Configuration Error',
                description: `Add "${currentOrigin}" to Authorized JavaScript origins in Google Cloud Console. See console for details.`,
                variant: 'destructive',
                duration: 15000,
              });
              console.error('❌ OAuth Client Configuration Error');
              console.error('📋 Current origin:', currentOrigin);
              console.error('📖 Steps to fix:');
              console.error('   1. Go to https://console.cloud.google.com/');
              console.error('   2. Select your project');
              console.error('   3. Navigate to APIs & Services → Credentials');
              console.error('   4. Click on your OAuth 2.0 Client ID');
              console.error('   5. Under "Authorized JavaScript origins", click "+ ADD URI"');
              console.error(`   6. Add: ${currentOrigin}`);
              console.error('   7. Click SAVE');
              console.error('   8. Wait a few minutes for changes to propagate');
              console.error('   9. Clear browser cache and try again');
              console.error('📖 See FIX_WEBSITE_GOOGLE_OAUTH.md for detailed instructions');
            } else {
              toast({
                title: 'Google sign-in failed',
                description: errorMessage || 'An error occurred. Please try again.',
                variant: 'destructive',
              });
            }
          } finally {
            setIsLoading(false);
          }
        },
      });

      // Render button or use popup
      // For better UX, we'll render a button that triggers the flow
      try {
        const buttonDiv = document.createElement('div');
        buttonDiv.id = 'google-signin-button';
        buttonDiv.style.display = 'none';
        document.body.appendChild(buttonDiv);

        google.accounts.id.renderButton(
          buttonDiv,
          { theme: 'outline', size: 'large', text: 'signin_with', width: '100%' }
        );

        // Simulate button click to trigger the flow
        const button = buttonDiv.querySelector('div[role="button"]') as HTMLElement;
        if (button) {
          button.click();
        } else {
          // Fallback: use prompt
          google.accounts.id.prompt();
        }
        
        // Clean up after a delay
        setTimeout(() => {
          if (document.body.contains(buttonDiv)) {
            document.body.removeChild(buttonDiv);
          }
        }, 1000);
      } catch (renderError: any) {
        console.error('❌ Error rendering Google sign-in button:', renderError);
        const errorMessage = renderError?.message || renderError?.toString() || '';
        
        if (errorMessage.includes('invalid_client') || errorMessage.includes('no registered origin')) {
          const currentOrigin = window.location.origin;
          toast({
            title: 'OAuth Configuration Error',
            description: `Add "${currentOrigin}" to Authorized JavaScript origins in Google Cloud Console. See console for details.`,
            variant: 'destructive',
            duration: 15000,
          });
          console.error('❌ OAuth Client Configuration Error');
          console.error('📋 Current origin:', currentOrigin);
          console.error('📖 See FIX_WEBSITE_GOOGLE_OAUTH.md for detailed instructions');
        } else {
          toast({
            title: 'Google sign-in unavailable',
            description: 'Failed to initialize Google sign-in. Please try again or use email/password.',
            variant: 'destructive',
          });
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Google login error:', error);
      toast({
        title: 'Google sign-in unavailable',
        description: 'Please use email and password to sign in',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  }, [navigate, toast, isAuthenticated]);

  // Don't auto-redirect if user explicitly navigated to login page
  // Allow them to sign in with a different account or logout
  // The login form will show a message if they're already logged in
  // Only redirect if opened from extension (popup context)
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      // Only redirect if opened from extension popup
      const fromExtension = isOpenedFromExtension();
      if (fromExtension) {
        // Don't redirect - extension popup should handle its own navigation
        return;
      }
      // For website: Don't auto-redirect - show login form with "already logged in" message
      // This allows users to sign in with a different account if they want
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Auto-trigger Google sign-in if ?google=true query parameter is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'true') {
      // Preserve fromExtension parameter if present
      const fromExtension = params.get('fromExtension') === 'true';
      // Remove only the google parameter, keep fromExtension
      const newParams = new URLSearchParams();
      if (fromExtension) {
        newParams.set('fromExtension', 'true');
      }
      const newUrl = newParams.toString() 
        ? `${window.location.pathname}?${newParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      // Trigger Google sign-in after a short delay to ensure page is loaded
      const timer = setTimeout(() => {
        handleGoogleLogin();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [handleGoogleLogin]);

  // Show loading state while auth context is initializing
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't show redirecting screen - show login form with "already logged in" message instead
  // This allows users to sign in with a different account if they want

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }
    
    setIsLoading(true);
    const success = await login(email, password);
    
    if (success) {
      // Check if opened from extension
      const fromExtension = isOpenedFromExtension();
      
      console.log('Login successful, fromExtension:', fromExtension);
      
      if (fromExtension) {
        // Get token and user from localStorage (set by login function)
        const token = localStorage.getItem('auth_token');
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        
        // Show success message
        toast({
          title: 'Login successful!',
          description: 'Redirecting to extension...',
          variant: 'default',
        });
        
        // Sync auth to extension via content script
        if (token && user) {
          console.log('📤 Syncing auth to extension via content script...');
          
          window.postMessage({
            type: 'SYNC_AUTH_TO_EXTENSION',
            token,
            user
          }, window.location.origin);
          
          // Request tab close after a delay
          setTimeout(() => {
            window.postMessage({
              type: 'CLOSE_TAB_REQUEST'
            }, window.location.origin);
          }, 1500);
        }
      } else {
        // Navigate immediately - force navigation to dashboard
        window.location.href = '/dashboard';
      }
    } else {
      // Login failed - don't redirect
      setIsLoading(false);
      return;
    }
    
    setIsLoading(false);
  };

  // Show loading state only while auth is initializing
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If we're closing the tab (from extension), show a simple closing message
  if (isClosing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent p-4">
        <div className="w-full max-w-md text-center">
          <div className="space-y-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-muted-foreground">Redirecting to extension...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-4">
      <Card className="w-full max-w-md relative">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
          <Logo showSecurity size="md" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate('/')}
            >
              <X 
                className="h-5 w-5"
                style={{
                  stroke: 'url(#gradient-x-login)',
                }}
              />
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="gradient-x-login" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#413986" />
                    <stop offset="100%" stopColor="#DCDAEE" />
                  </linearGradient>
                </defs>
              </svg>
            </Button>
          </div>
          <div className="text-center">
            <CardTitle className="font-bold">Login</CardTitle>
            <CardDescription>Enter your credentials to access your account</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleLogin}
            >
              Sign in with Google
            </Button>

            <div className="flex items-center justify-between text-sm">
              <Link to="/forgot-password" className="text-primary hover:underline">
                Forgot Password?
              </Link>
              <Link to="/register" className="text-primary hover:underline">
                Register
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
