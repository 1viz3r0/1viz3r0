import React from 'react';
import { CyberNavbar } from '@/components/CyberNavbar';
import { EventsScroll } from '@/components/EventsScroll';
import { LogoLoop, LogoItem } from '@/components/LogoLoop';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import CyberScene from '@/components/CyberScene';

// Placeholder partner logos
const partnerLogos: LogoItem[] = [
  { src: '/images/CodeVirus.png', alt: 'Partner 1', href: '#' },
  { src: '/images/CodeVirus.png', alt: 'Partner 2', href: '#' },
  { src: '/images/CodeVirus.png', alt: 'Partner 3', href: '#' },
  { src: '/images/CodeVirus.png', alt: 'Partner 4', href: '#' },
  { src: '/images/CodeVirus.png', alt: 'Partner 5', href: '#' },
  { src: '/images/CodeVirus.png', alt: 'Partner 6', href: '#' },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden">
      <CyberScene />
      
      <div className="relative z-10">
        <CyberNavbar />
        
        {/* Hero Section */}
        <section className="min-h-screen flex items-center justify-center px-4 pt-20 sm:pt-32">
          <div className="container mx-auto text-center space-y-6 sm:space-y-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 mb-6 sm:mb-8">
              <div className="hidden sm:block h-px w-20 bg-gradient-to-r from-transparent via-foreground to-transparent" />
              <div className="w-2 h-2 bg-foreground rounded-full" />
              <h2 className="text-2xl sm:text-4xl font-bold metallic-text">SHELL & SHIELD</h2>
              <div className="w-2 h-2 bg-foreground rounded-full" />
              <div className="hidden sm:block h-px w-20 bg-gradient-to-l from-transparent via-foreground to-transparent" />
            </div>
            
            <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight">
              <span className="metallic-text">
                Bridging the gap between theory and real-world in Modern CyberEra
              </span>
            </h1>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mt-8 sm:mt-12">
              <Button 
                onClick={() => navigate('/login')}
                className="glass-button metallic-text font-bold text-base sm:text-lg px-8 sm:px-12 py-4 sm:py-6 border border-white/20 rounded-full w-full sm:w-auto"
              >
                GET STARTED
              </Button>
              <button className="metallic-text text-base sm:text-lg font-medium hover:text-foreground transition-colors">
                LEARN MORE
              </button>
            </div>
          </div>
        </section>

        {/* Events Section */}
        <section id="events" className="py-24">
          <div className="container mx-auto px-4 mb-12">
            <h2 className="text-5xl font-bold text-center metallic-text mb-4">UPCOMING EVENTS</h2>
            <p className="text-center text-muted-foreground text-lg">
              Join our cutting-edge cybersecurity workshops and conferences
            </p>
          </div>
          <EventsScroll />
        </section>

        {/* About Us Section */}
        <section id="about" className="py-24 px-4">
          <div className="container mx-auto">
            <h2 className="text-5xl font-bold text-center metallic-text mb-16">
              ABOUT US
            </h2>
            <div className="glass-card p-12 max-w-4xl mx-auto">
              <p className="text-xl metallic-text mb-6 leading-relaxed">
                The Hawkur Society is a national-level cybersecurity collective uniting ethical hackers, defenders, and researchers 
                to strengthen India's digital resilience. Our core mission is to bridge the gap between academic learning and real-world cyber defense through structured, hands-on training, events, and operational experience.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                We aim to build a legal, scalable, and community-driven ecosystem that cultivates skilled professionals while actively supporting organizations through
                 simulated operations, security testing, coordinated vulnerability disclosure, and live cyber competitions.
              </p>
            </div>
          </div>
        </section>

        {/* Partners Section */}
        <section className="py-20 px-4">
          <div className="container mx-auto">
            <h2 className="text-5xl font-bold text-center mb-16 metallic-text">
              OUR PARTNERS
            </h2>
            <LogoLoop logos={partnerLogos} speed={120} />
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-4 border-t border-white/10">
          <div className="container mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-8">
              {/* Logo Section */}
              <div className="flex items-start">
                <div className="glass-card p-6 w-20 h-20 flex items-center justify-center">
                  <div className="text-3xl metallic-text font-bold">L</div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold metallic-text mb-4">Resources</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li><a href="#" className="hover:text-foreground transition-colors">FAQs</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Partner with us</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-bold metallic-text mb-4">Company</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li><a href="#about" className="hover:text-foreground transition-colors">About Us</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Investor Relations</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-bold metallic-text mb-4">Legal</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Disclaimer</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Sitemap</a></li>
                  <li><a href="#" className="hover:text-foreground transition-colors">Cookies Policy</a></li>
                </ul>
              </div>
            </div>
            <div className="text-center text-muted-foreground text-sm">
              © 2025 Cyber Sense, Inc. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;
