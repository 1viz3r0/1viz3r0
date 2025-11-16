import React, { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { useNavigate } from 'react-router-dom';

export const CyberNavbar: React.FC = () => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const navigate = useNavigate();

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <nav className="fixed top-8 left-0 right-0 z-50 px-4">
        <div className="container mx-auto">
          <div className="flex items-center justify-between glass-card px-8 py-4">
            {/* Logo */}
            <div className="text-2xl font-bold metallic-text cursor-pointer" onClick={() => navigate('/')}>
              HAWKUR SOCIETY
            </div>
            
            {/* Nav Links */}
            <div className="flex items-center gap-8">
              <button 
                onClick={() => navigate('/')}
                className="metallic-text hover:text-foreground transition-colors font-medium"
              >
                HOME
              </button>
              <button 
                onClick={() => scrollToSection('events')}
                className="metallic-text hover:text-foreground transition-colors font-medium"
              >
                EVENTS
              </button>
              <button 
                onClick={() => scrollToSection('programs')}
                className="metallic-text hover:text-foreground transition-colors font-medium"
              >
                PROGRAMS
              </button>
              <button 
                onClick={() => scrollToSection('about')}
                className="metallic-text hover:text-foreground transition-colors font-medium"
              >
                ABOUT US
              </button>
            </div>
            
            {/* Auth Buttons */}
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowLoginModal(true)}
                className="metallic-text font-bold"
              >
                LOGIN
              </button>
              <Button 
                onClick={() => navigate('/login?mode=register')}
                className="glass-button metallic-text font-bold border border-white/20 rounded-full"
              >
                REGISTER
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Login Modal */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="glass-card border-white/20 max-w-md p-12">
          {/* Logo Section */}
          <div className="flex justify-center mb-8">
            <div className="glass-card p-6 w-24 h-24 flex items-center justify-center">
              <div className="text-4xl metallic-text font-bold">L</div>
            </div>
          </div>

          <DialogHeader>
            <DialogTitle className="text-4xl font-bold text-center metallic-text mb-8">LOGIN</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <Input 
              type="email" 
              placeholder="Email Address"
              className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
            />
            <Input 
              type="password" 
              placeholder="Password"
              className="glass-card border-white/20 text-foreground placeholder:text-muted-foreground rounded-full h-14"
            />
            <Button className="w-full glass-button metallic-text font-bold border border-white/20 rounded-full h-14">
              LOGIN
            </Button>
            
            <div className="mt-6 text-center">
              <button 
                onClick={() => {
                  setShowLoginModal(false);
                  navigate('/login?mode=register');
                }}
                className="metallic-text hover:text-foreground transition-colors"
              >
                Don't have an account? Register
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};