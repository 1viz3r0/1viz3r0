import { useState } from 'react';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/apiClient';
import { extensionAuth } from '../lib/extensionAuth';
import { authSync } from '../lib/authSync';
import OTPVerificationPopup from './OTPVerificationPopup';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password too long'),
});

interface ExtensionRegisterProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

type Step = 'register' | 'verify-email' | 'verify-mobile';

export default function ExtensionRegister({ onSuccess, onSwitchToLogin }: ExtensionRegisterProps) {
  const [step, setStep] = useState<Step>('register');
  const [sessionId, setSessionId] = useState('');
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { toast } = useToast();

  const handleGoogleRegister = async () => {
    try {
      setIsGoogleLoading(true);
      
      // Open website's register page with Google OAuth trigger
      const webAppUrl = import.meta.env.VITE_WEB_APP_URL || 'http://localhost:8080';
      const registerUrl = `${webAppUrl}/register?google=true&fromExtension=true`;
      
      toast({
        title: 'Opening Google sign-up',
        description: 'Please complete sign-up on the website',
        variant: 'default',
      });
      
      // Open the register page in a new tab
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: registerUrl });
      } else {
        window.open(registerUrl, '_blank');
      }
      
      setIsGoogleLoading(false);
    } catch (error) {
      console.error('Google register error:', error);
      toast({
        title: 'Google sign-up unavailable',
        description: 'Please use email and password to sign up',
        variant: 'destructive',
      });
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both passwords are the same',
        variant: 'destructive',
      });
      return;
    }

    if (!agreeToTerms) {
      toast({
        title: 'Terms required',
        description: 'Please agree to the Terms & Conditions',
        variant: 'destructive',
      });
      return;
    }

    // Validate inputs
    const validation = registerSchema.safeParse({ name, email, phone, password });
    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiClient.register({ name, email, phone, password });
      
      if (response.success && response.data) {
        setSessionId(response.data.sessionId);
        setStep('verify-email');
        toast({
          title: 'OTP Sent',
          description: 'Please check your email for the verification code',
        });
      } else {
        toast({
          title: 'Registration failed',
          description: response.error || 'Please try again',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Registration failed',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailOTPVerified = async (otp: string) => {
    try {
      const response = await apiClient.verifyEmailOTP(sessionId, otp);
      
      if (response.success) {
        setStep('verify-mobile');
        toast({
          title: 'Email Verified',
          description: 'Please verify your mobile number',
        });
      } else {
        toast({
          title: 'Verification failed',
          description: response.error || 'Invalid OTP',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Verification failed',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleMobileOTPVerified = async (otp: string) => {
    try {
      const response = await apiClient.verifyMobileOTP(sessionId, otp);
      
      if (response.success && response.data) {
        // IMPORTANT: Clear any existing auth first to ensure single user session
        // This prevents multiple users from being logged in simultaneously
        await extensionAuth.clearAll();
        
        // Set new auth
        await extensionAuth.setToken(response.data.token);
        await extensionAuth.setUser(response.data.user);
        
        // Sync auth to web app (this will also notify other popups via storage change)
        await authSync.syncToWebApp(response.data.token, response.data.user);
        
        // Broadcast auth change to all extension contexts
        // This ensures all open popups update immediately
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          try {
            chrome.runtime.sendMessage({
              type: 'AUTH_CHANGED',
              token: response.data.token,
              user: response.data.user
            }).catch(() => {
              // Ignore errors - other contexts might not be listening
            });
          } catch (e) {
            // Ignore errors
          }
        }
        
        // Redirect immediately to dashboard without showing success message
        onSuccess();
      } else {
        toast({
          title: 'Verification failed',
          description: response.error || 'Invalid OTP',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Verification failed',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleResendOTP = async (type: 'email' | 'mobile') => {
    await apiClient.resendOTP(sessionId, type);
  };

  if (step === 'verify-email') {
    return (
      <OTPVerificationPopup
        type="email"
        value={email}
        onVerified={handleEmailOTPVerified}
        onResend={() => handleResendOTP('email')}
        onCancel={() => setStep('register')}
      />
    );
  }

  if (step === 'verify-mobile') {
    return (
      <OTPVerificationPopup
        type="mobile"
        value={phone}
        onVerified={handleMobileOTPVerified}
        onResend={() => handleResendOTP('mobile')}
        onCancel={() => setStep('verify-email')}
      />
    );
  }

  return (
    <div className="p-6 bg-transparent max-h-[600px] overflow-y-auto">
      <div className="flex items-center gap-2 mb-6">
        <Logo showSecurity size="sm" />
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Register</h2>
        <p className="text-sm text-muted-foreground">
          Create your account to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

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

        <div className="space-y-2">
          <Label htmlFor="password">Create Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="terms"
            checked={agreeToTerms}
            onCheckedChange={(checked) => setAgreeToTerms(checked as boolean)}
          />
          <label
            htmlFor="terms"
            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            I agree to the Terms & Conditions
          </label>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating account...' : 'Register'}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isGoogleLoading}
          onClick={handleGoogleRegister}
        >
          {isGoogleLoading ? 'Opening Google sign-up...' : 'Sign up with Google'}
        </Button>

        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={onSwitchToLogin}
        >
          Already have an account? Login
        </button>
      </form>
    </div>
  );
}
