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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Connect to backend
    // POST /api/auth/login or /api/auth/register
    console.log(isLogin ? 'Login' : 'Register');
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
                type="email"
                placeholder="Email Address"
                className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
                required
              />
              <Input
                type="password"
                placeholder="Password"
                className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
                required
              />
              
              {!isLogin && (
                <Input
                  type="password"
                  placeholder="Confirm Password"
                  className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
                  required
                />
              )}

              <Button 
                type="submit"
                className="w-full glass-button metallic-text font-bold border border-white/20 rounded-full h-14"
              >
                {isLogin ? 'LOGIN' : 'REGISTER'}
              </Button>
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
