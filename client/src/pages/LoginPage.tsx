import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CyberScene from '@/components/CyberScene';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get('mode') !== 'register');
  const navigate = useNavigate();

  useEffect(() => {
    setIsLogin(searchParams.get('mode') !== 'register');
  }, [searchParams]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When deploying a static site and you want auth disabled set VITE_DISABLE_AUTH=true
  const disableAuth = import.meta.env.VITE_DISABLE_AUTH === 'true';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disableAuth) return; // do nothing when auth disabled
    setError(null);
    setLoading(true);
    try {
      // Lazy import to avoid bundling issues if file missing
      const api = await import('@/lib/api');
      if (isLogin) {
        const resp = await api.login(email, password);
        if (resp && resp.token) {
          localStorage.setItem('auth_token', resp.token);
          navigate('/');
        } else {
          setError(resp.message || 'Login failed');
        }
      } else {
        if (password !== passwordConfirm) {
          // keep behavior minimal; log error to console
          console.error('Passwords do not match');
          setLoading(false);
          return;
        }
        const resp = await api.register(name || undefined, phone || undefined, email, password);
        if (resp && resp.success) {
          // If the backend started an OTP session, redirect to verification page
          if (resp.sessionId && resp.requiresOTP) {
            const params = new URLSearchParams();
            params.set('sessionId', resp.sessionId);
            // pass devEmailOTP in dev for convenience (if present)
            if (resp.devEmailOTP) params.set('devEmailOTP', String(resp.devEmailOTP));
            navigate(`/verify?${params.toString()}`);
          } else if (resp.token) {
            // direct token
            localStorage.setItem('auth_token', resp.token);
            navigate('/');
          } else {
            setIsLogin(true);
            console.log('Registration successful. Please verify your email/phone then login.');
          }
        } else {
          console.error(resp.message || 'Registration failed');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      <CyberScene />
      
      <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-md space-y-8">
          {/* Logo Section */}
          <div className="flex justify-center">
            <div className="glass-card p-6 w-24 h-24 flex items-center justify-center">
              <div className="text-4xl metallic-text font-bold">L</div>
            </div>
          </div>

          <div className="glass-card p-12 border-white/20">
            <h1 className="text-4xl font-bold text-center mb-8 metallic-text">
              {isLogin ? 'LOGIN' : 'REGISTER'}
            </h1>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Email Address"
                className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
                required
                disabled={disableAuth}
              />
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Password"
                className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
                required
                disabled={disableAuth}
              />
              
              {!isLogin && (
                <>
                  <Input
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    type="password"
                    placeholder="Confirm Password"
                    className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
                    required
                    disabled={disableAuth}
                  />
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    type="text"
                    placeholder="Full name"
                    className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
                    disabled={disableAuth}
                  />
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    type="tel"
                    placeholder="Phone number (e.g. +1234567890)"
                    className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
                    required
                    disabled={disableAuth}
                  />
                </>
              )}

              <Button 
                type="submit"
                disabled={loading || disableAuth}
                className="w-full glass-button metallic-text font-bold border border-white/20 rounded-full h-14"
              >
                {isLogin ? 'LOGIN' : 'REGISTER'}
              </Button>

              {disableAuth && (
                <div className="mt-2 text-center text-sm text-muted-foreground">Authentication is disabled in this deployment.</div>
              )}
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="metallic-text hover:text-foreground transition-colors"
              >
                {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
              </button>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={() => navigate('/')}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
