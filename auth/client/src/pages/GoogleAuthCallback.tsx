import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from '@/components/Logo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/apiClient';
import OTPVerification from '@/components/OTPVerification';

export default function GoogleAuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const location = useLocation();
  
  const [step, setStep] = useState<'phone' | 'verify-otp'>('phone');
  // Get sessionId from URL params (for extension) or location state (for web app)
  const urlParams = new URLSearchParams(location.search);
  const sessionIdFromUrl = urlParams.get('sessionId');
  const fromExtension = urlParams.get('fromExtension') === 'true';
  const [sessionId, setSessionId] = useState(
    sessionIdFromUrl || (location.state as any)?.sessionId || ''
  );
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false); // Track if we're closing the tab

  useEffect(() => {
    if (!sessionId) {
      toast({
        title: 'Invalid session',
        description: 'Please start the registration process again',
        variant: 'destructive',
      });
      navigate('/register');
    }
  }, [sessionId, navigate, toast]);

  // This would be called after Google OAuth redirect
  // For now, it's a placeholder for the phone number collection step
  
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone || phone.length < 10) {
      toast({
        title: 'Invalid phone number',
        description: 'Please enter a valid phone number',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Send phone number to backend to receive OTP
      // The backend endpoint accepts phone without OTP to trigger OTP sending
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/auth/verify-google-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          phone,
          otp: '', // Empty OTP triggers OTP sending
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({
          title: 'OTP Sent',
          description: 'Please check your phone for the verification code',
        });
        setStep('verify-otp');
      } else {
        toast({
          title: 'Error',
          description: data.message || data.error || 'Failed to send OTP. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      toast({
        title: 'Error',
        description: 'Failed to send OTP. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPVerified = async (otp: string) => {
    try {
      setIsLoading(true);
      
      // Validate inputs
      if (!sessionId) {
        toast({
          title: 'Verification failed',
          description: 'Session ID is missing. Please start over.',
          variant: 'destructive',
        });
        return;
      }
      
      if (!phone) {
        toast({
          title: 'Verification failed',
          description: 'Phone number is missing. Please start over.',
          variant: 'destructive',
        });
        return;
      }
      
      if (!otp || otp.length !== 6) {
        toast({
          title: 'Invalid OTP',
          description: 'Please enter a 6-digit OTP',
          variant: 'destructive',
        });
        return;
      }
      
      console.log('🔐 Verifying OTP:', { sessionId, phone, otpLength: otp.length });
      
      let response;
      try {
        response = await apiClient.verifyGoogleOTP(sessionId, phone, otp);
        console.log('📥 OTP Verification Response:', response);
      } catch (error: any) {
        console.error('❌ Error calling verifyGoogleOTP:', error);
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        toast({
          title: 'Verification failed',
          description: errorMessage.includes('format') || errorMessage.includes('JSON') 
            ? 'Invalid response format from server. Please try again.' 
            : errorMessage,
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
      
      if (!response || !response.success) {
        console.error('❌ OTP verification failed:', response?.error);
        toast({
          title: 'Verification failed',
          description: response?.error || 'Invalid OTP. Please try again.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
      
      // The apiClient wraps the response
      // Server returns: { success: true, token, user }
      // apiClient wraps it as: { success: true, data: { success: true, token, user } }
      const responseData = response.data as any;
      console.log('📋 Response data structure:', responseData);
      try {
        console.log('📋 Full response:', JSON.stringify(response, null, 2));
      } catch (e) {
        console.log('📋 Full response (stringify failed):', response);
      }
      
      // Handle different response structures
      let token: string | undefined;
      let userData: any;
      
      // Check if responseData is the server response directly
      if (responseData && typeof responseData === 'object') {
        // Server response: { success: true, token, user }
        if (responseData.token && responseData.user) {
          token = responseData.token;
          userData = responseData.user;
        } 
        // If nested structure: { success: true, data: { token, user } }
        else if (responseData.data && responseData.data.token && responseData.data.user) {
          token = responseData.data.token;
          userData = responseData.data.user;
        }
      }
      
      console.log('🔑 Extracted token:', !!token);
      console.log('👤 Extracted user:', !!userData);
      
      if (!token || !userData) {
        console.error('❌ Missing token or user data in response');
        console.error('   Response structure:', {
          hasData: !!response.data,
          dataType: typeof response.data,
          dataKeys: response.data ? Object.keys(response.data) : [],
          fullResponse: response
        });
        toast({
          title: 'Verification failed',
          description: 'Invalid response format from server. Please try again.',
          variant: 'destructive',
        });
        return;
      }
      
      // Store authentication
      await apiClient.setToken(token);
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      
      console.log('✅ Auth stored successfully');
      
      // Notify AuthContext to refresh from storage
      try {
        window.dispatchEvent(new CustomEvent('auth-sync', { detail: { token } }));
        window.dispatchEvent(new Event('storage'));
      } catch (e) {
        console.warn('⚠️ Error dispatching auth-sync event:', e);
      }
      
      // If coming from extension, sync auth to extension and close tab
      // Check fromExtension from URL params (it should be preserved in the URL)
      const currentParams = new URLSearchParams(window.location.search);
      const isFromExtension = fromExtension || currentParams.get('fromExtension') === 'true';
      
      console.log('🔍 Extension check:', { 
        fromExtension, 
        isFromExtension, 
        urlParams: window.location.search,
        currentParamsFromExtension: currentParams.get('fromExtension')
      });
      
      if (isFromExtension) {
        try {
          console.log('📤 Syncing auth to extension...');
          
          // Set closing state to prevent further rendering
          setIsClosing(true);
          
          // Show success message
          toast({
            title: 'Verification successful!',
            description: 'Redirecting to extension...',
            variant: 'default',
          });
          
          // Sync auth to extension via content script
          // Use window.postMessage to communicate with content script (content script has access to chrome APIs)
          console.log('📤 Syncing auth to extension via content script...');
          
          // Send message to content script via window.postMessage
          // Content script will forward to background script and handle tab closing
          window.postMessage({
            type: 'SYNC_AUTH_TO_EXTENSION',
            token,
            user: userData
          }, window.location.origin);
          
          // Request tab close after a delay (content script will get tab ID and forward to background)
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
          }, 1500); // Give time for auth to sync first
          
          // Don't navigate - just wait for tab to close
          return;
        } catch (error) {
          console.error('❌ Error in extension sync:', error);
          // Try to close anyway
          setTimeout(() => {
            window.close();
          }, 1500);
        }
      }
      
      // Redirect immediately to dashboard without showing success message
      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      console.error('❌ OTP Verification Error:', error);
      toast({
        title: 'Verification failed',
        description: error?.message || 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      const response = await apiClient.resendOTP(sessionId, 'mobile');
      if (response.success) {
        toast({
          title: 'OTP Resent',
          description: 'A new OTP has been sent to your phone',
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

  if (step === 'verify-otp') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent p-4">
        <div className="w-full max-w-md">
          <OTPVerification
            type="mobile"
            value={phone}
            onVerified={handleOTPVerified}
            onResend={async () => await handleResendOTP()}
            onCancel={() => setStep('phone')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Logo showSecurity size="lg" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verify Your Phone</CardTitle>
            <CardDescription>
              To complete your Google sign-in, please verify your phone number
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1234567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending OTP...' : 'Send Verification Code'}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigate('/login')}
              >
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
