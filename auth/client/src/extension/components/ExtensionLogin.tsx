import { useState, useEffect } from 'react';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/apiClient';
import { extensionAuth } from '../lib/extensionAuth';
import { authSync } from '../lib/authSync';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

interface ExtensionLoginProps {
  onSuccess: () => void;
  onSwitchToRegister: () => void;
}

export default function ExtensionLogin({ onSuccess, onSwitchToRegister }: ExtensionLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { toast } = useToast();

  // Reset Google loading state on mount and when component unmounts
  useEffect(() => {
    // Reset loading state when component mounts
    setIsGoogleLoading(false);
    
    return () => {
      setIsGoogleLoading(false);
    };
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true);
      
      // Open website's login page with Google OAuth trigger
      const webAppUrl = import.meta.env.VITE_WEB_APP_URL || 'http://localhost:8080';
      const loginUrl = `${webAppUrl}/login?google=true&fromExtension=true`;
      
      toast({
        title: 'Opening Google sign-in',
        description: 'Please complete sign-in on the website',
        variant: 'default',
      });
      
      // Open the login page in a new tab
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: loginUrl });
      } else {
        window.open(loginUrl, '_blank');
      }
      
      setIsGoogleLoading(false);
    } catch (error) {
      console.error('Google login error:', error);
      toast({
        title: 'Google sign-in unavailable',
        description: 'Please use email and password to sign in',
        variant: 'destructive',
      });
      setIsGoogleLoading(false);
    }
  };

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

    try {
      const response = await apiClient.login(email, password);
      
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
        
        toast({
          title: 'Login successful',
          description: 'Welcome back!',
        });
        // Ensure auth is saved before redirecting
        await extensionAuth.setToken(response.data.token);
        await extensionAuth.setUser(response.data.user);
        // Small delay to ensure storage is updated
        setTimeout(() => {
          onSuccess(); // This will redirect to dashboard
        }, 100);
      } else {
        toast({
          title: 'Login failed',
          description: response.error || 'Invalid credentials',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Login failed',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 bg-transparent">
      <div className="flex items-center gap-2 mb-6">
        <Logo showSecurity size="sm" />
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Login</h2>
        <p className="text-sm text-muted-foreground">
          Enter your credentials to continue
        </p>
      </div>

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
          disabled={isGoogleLoading}
          onClick={handleGoogleLogin}
        >
          {isGoogleLoading ? 'Opening Google sign-in...' : 'Sign in with Google'}
        </Button>

        <div className="flex flex-col gap-2 text-sm">
          <button
            type="button"
            className="text-primary hover:underline text-left"
            onClick={() => toast({ title: 'Coming soon', description: 'Password reset will be available soon' })}
          >
            Forgot Password?
          </button>
          <button
            type="button"
            className="text-primary hover:underline text-left"
            onClick={onSwitchToRegister}
          >
            Don't have an account? Register
          </button>
        </div>
      </form>
    </div>
  );
}
