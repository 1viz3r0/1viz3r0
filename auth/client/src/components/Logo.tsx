import React, { useState, useEffect } from 'react';

interface LogoProps {
  className?: string;
  showSecurity?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const Logo: React.FC<LogoProps> = ({ className = '', showSecurity = false, size = 'md' }) => {
  const [logoPath, setLogoPath] = useState<string>('/logo.svg');
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: 'h-16',
    md: 'h-24',
    lg: 'h-32',
    xl: 'h-40'
  };

  useEffect(() => {
    // Determine the correct logo path based on context
    const determineLogoPath = () => {
      if (typeof window === 'undefined') {
        return '/logo.svg';
      }

      // Check if we're in a Chrome extension context
      // Extension popup runs in extension:// context
      const isExtensionContext = 
        typeof chrome !== 'undefined' && 
        chrome.runtime && 
        chrome.runtime.id &&
        typeof chrome.runtime.getURL === 'function';
      
      if (isExtensionContext) {
        try {
          const extensionPath = chrome.runtime.getURL('logo.svg');
          // Only log in development
          if (process.env.NODE_ENV === 'development') {
            console.log('📷 Logo path (extension):', extensionPath);
          }
          return extensionPath;
        } catch (error) {
          console.warn('⚠️ Could not get extension URL for logo:', error);
          return '/logo.svg';
        }
      }
      
      // Web app context - Vite serves public folder at root
      const webPath = '/logo.svg';
      if (process.env.NODE_ENV === 'development') {
        console.log('📷 Logo path (web app):', webPath);
      }
      return webPath;
    };

    const path = determineLogoPath();
    setLogoPath(path);
  }, []);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Log error for debugging
    console.error('❌ Logo image failed to load:', logoPath);
    setImageError(true);
    // Prevent the error from bubbling up
    e.preventDefault();
    e.stopPropagation();
  };

  // Suppress console logs in production

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Logo SVG Image */}
      {!imageError ? (
        <img
          src={logoPath}
          alt=""
          className={`${sizeClasses[size]} w-auto object-contain`}
          style={{ imageRendering: 'auto' }}
          onError={handleImageError}
          onLoad={() => {
            console.log('✅ Logo image loaded successfully:', logoPath);
          }}
        />
      ) : (
        <div 
          className={`${sizeClasses[size]} flex items-center justify-center bg-muted rounded text-muted-foreground text-xs px-2`}
          title={`Logo not found at: ${logoPath}. Please add logo.svg to client/public/ folder.`}
        >
          [Logo]
        </div>
      )}
    </div>
  );
};

export default Logo;

