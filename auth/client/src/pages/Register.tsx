import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import apiClient from '@/lib/apiClient';
import OTPVerification from '@/components/OTPVerification';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
});

type Step = 'register' | 'verify-email' | 'verify-mobile';

export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [step, setStep] = useState<Step>('register');
  const [sessionId, setSessionId] = useState('');
  
  // Check if this page was opened from extension popup
  const isOpenedFromExtension = () => {
    // Check URL parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('extension') === 'true' || params.get('fromExtension') === 'true') {
      return true;
    }
    return false;
  };
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Define handleGoogleRegister with useCallback so it can be used in useEffect
  const handleGoogleRegister = useCallback(async () => {
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
          title: 'Google sign-up not configured',
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
            const result = await apiClient.googleAuth(response.credential);
            
            if (result.success && result.data) {
              const responseData = result.data as any;
              
              // New Google user always requires phone verification
              if (responseData.requiresOTP && responseData.sessionId) {
                // Navigate to phone verification with fromExtension parameter if applicable
                const fromExtension = isOpenedFromExtension();
                const callbackUrl = fromExtension 
                  ? `/auth/google/callback?sessionId=${responseData.sessionId}&fromExtension=true`
                  : `/auth/google/callback?sessionId=${responseData.sessionId}`;
                navigate(callbackUrl);
              } else if (responseData.token && responseData.user) {
                // Existing user (shouldn't happen in register, but handle it)
                await apiClient.setToken(responseData.token);
                localStorage.setItem('auth_token', responseData.token);
                localStorage.setItem('user', JSON.stringify(responseData.user));
                // Trigger auth context update by dispatching storage event
                window.dispatchEvent(new Event('storage'));
                
                if (isOpenedFromExtension()) {
                  // Show success message
                  toast({
                    title: 'Account found!',
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
                  }, 1500);
                } else {
                  navigate('/dashboard');
                }
              }
            } else {
              toast({
                title: 'Google sign-up failed',
                description: result.error || 'Please try again',
                variant: 'destructive',
              });
            }
          } catch (error) {
            console.error('Google auth error:', error);
            toast({
              title: 'Google sign-up failed',
              description: 'An error occurred. Please try again.',
              variant: 'destructive',
            });
          } finally {
            setIsLoading(false);
          }
        },
      });

      // Render button or use popup
      // For better UX, we'll render a button that triggers the flow
      const buttonDiv = document.createElement('div');
      buttonDiv.id = 'google-signup-button';
      buttonDiv.style.display = 'none';
      document.body.appendChild(buttonDiv);

      google.accounts.id.renderButton(
        buttonDiv,
        { theme: 'outline', size: 'large', text: 'signup_with', width: '100%' }
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
    } catch (error) {
      console.error('Google register error:', error);
      toast({
        title: 'Google sign-up unavailable',
        description: 'Please use email and password to sign up',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  }, [navigate, toast, isAuthenticated]);

  // Redirect to dashboard if already authenticated (in useEffect to avoid render-time navigation)
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      if (isOpenedFromExtension()) {
        window.close();
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Auto-trigger Google sign-up if ?google=true query parameter is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'true') {
      // Remove the query parameter from URL
      window.history.replaceState({}, '', window.location.pathname);
      // Trigger Google sign-up after a short delay to ensure page is loaded
      const timer = setTimeout(() => {
        handleGoogleRegister();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [handleGoogleRegister]);

  // Show loading or redirecting state
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

  if (isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!agreedToTerms) {
      setError('You must agree to the Terms & Conditions');
      return;
    }

    // Validate inputs
    const validation = registerSchema.safeParse({
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
    });
    
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await apiClient.register({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      });
      
      if (response.success && response.data) {
        setSessionId(response.data.sessionId);
        setStep('verify-email');
        
        // Always show generic message; never expose OTP in UI
        toast({
          title: 'OTP Sent',
          description: 'Please check your email for the verification code',
        });
      } else {
        setError(response.error || 'Registration failed. Please try again.');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailOTPVerified = async (otp: string) => {
    try {
      setIsLoading(true);
      console.log('Verifying email OTP:', { sessionId, otp });
      const response = await apiClient.verifyEmailOTP(sessionId, otp);
      console.log('Email OTP verification response:', response);
      
      if (response.success) {
        setStep('verify-mobile');
        toast({
          title: 'Email Verified',
          description: 'Please verify your mobile number',
        });
      } else {
        const errorMsg = response.error || 'Invalid OTP. Please try again.';
        console.error('Email OTP verification failed:', errorMsg);
        toast({
          title: 'Verification failed',
          description: errorMsg,
          variant: 'destructive',
        });
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Email OTP verification error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred. Please try again.';
      toast({
        title: 'Verification failed',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleMobileOTPVerified = async (otp: string) => {
    try {
      setIsLoading(true);
      console.log('Verifying mobile OTP:', { sessionId, otp });
      const response = await apiClient.verifyMobileOTP(sessionId, otp);
      console.log('Mobile OTP verification response:', response);
      
      if (response.success && response.data) {
        const responseData = response.data as any;
        const token = responseData.token || responseData.data?.token;
        const userData = responseData.user || responseData.data?.user;
        
        if (token && userData) {
          // Store token and user
          apiClient.setToken(token);
          localStorage.setItem('auth_token', token);
          localStorage.setItem('user', JSON.stringify(userData));

          // Notify AuthContext to refresh from storage
          try {
            window.dispatchEvent(new CustomEvent('auth-sync', { detail: { token } }));
            window.dispatchEvent(new Event('storage'));
          } catch {}

          // Redirect immediately to dashboard without showing success message
          navigate('/dashboard', { replace: true });
        } else {
          console.error('Invalid response structure:', responseData);
          throw new Error('Invalid response from server');
        }
      } else {
        const errorMsg = response.error || 'Invalid OTP. Please try again.';
        console.error('Mobile OTP verification failed:', errorMsg);
        toast({
          title: 'Verification failed',
          description: errorMsg,
          variant: 'destructive',
        });
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Mobile OTP verification error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred. Please try again.';
      toast({
        title: 'Verification failed',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async (type: 'email' | 'mobile') => {
    try {
      const response = await apiClient.resendOTP(sessionId, type);
      if (response.success) {
        toast({
          title: 'OTP Resent',
          description: `A new OTP has been sent to your ${type}`,
        });
      } else {
        toast({
          title: 'Failed to resend OTP',
          description: response.error || 'Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Failed to resend OTP',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };


  if (step === 'verify-email') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-4">
        <div className="w-full max-w-md">
          <OTPVerification
            key="email-otp" // Key forces remount when step changes
            type="email"
            value={formData.email}
            onVerified={handleEmailOTPVerified}
            onResend={async () => await handleResendOTP('email')}
            onCancel={() => setStep('register')}
          />
        </div>
      </div>
    );
  }

  if (step === 'verify-mobile') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-4">
        <div className="w-full max-w-md">
          <OTPVerification
            key="mobile-otp" // Key forces remount when step changes
            type="mobile"
            value={formData.phone}
            onVerified={handleMobileOTPVerified}
            onResend={async () => await handleResendOTP('mobile')}
            onCancel={() => setStep('verify-email')}
          />
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
                  stroke: 'url(#gradient-x-register)',
                }}
              />
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="gradient-x-register" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#413986" />
                    <stop offset="100%" stopColor="#DCDAEE" />
                  </linearGradient>
                </defs>
              </svg>
            </Button>
          </div>
          <div className="text-center">
            <CardTitle className="font-bold">Register</CardTitle>
            <CardDescription>Create your account to get started</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 234 567 8900"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Create Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
              />
              <label
                htmlFor="terms"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I agree to the Terms & Conditions
              </label>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Register'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleRegister}
            >
              Sign up with Google
            </Button>

            <div className="text-center text-sm">
              <Link to="/login" className="text-primary hover:underline">
                Back to Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
