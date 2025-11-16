import React, { useEffect, useRef, useState } from 'react';

export type LogoItem = {
  src: string;
  alt: string;
  href?: string;
};

interface LogoLoopProps {
  logos: LogoItem[];
  speed?: number;
  className?: string;
}

export const LogoLoop: React.FC<LogoLoopProps> = ({ 
  logos, 
  speed = 30,
  className = '' 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  // Duplicate logos for seamless loop
  const duplicatedLogos = [...logos, ...logos, ...logos];

  return (
    <div 
      className={`relative overflow-hidden ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Fade gradients */}
      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      
      <div 
        className="flex gap-8 animate-marquee"
        style={{ 
          animationDuration: `${speed}s`,
          animationPlayState: isHovered ? 'paused' : 'running',
          '--gap': '2rem'
        } as React.CSSProperties}
      >
        {duplicatedLogos.map((logo, index) => (
          <div
            key={`${logo.alt}-${index}`}
            className="flex-shrink-0 glass-card p-6 transition-all duration-300 hover:scale-110 hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]"
          >
            {logo.href ? (
              <a href={logo.href} target="_blank" rel="noopener noreferrer">
                <img 
                  src={logo.src} 
                  alt={logo.alt}
                  className="h-12 w-auto object-contain"
                />
              </a>
            ) : (
              <img 
                src={logo.src} 
                alt={logo.alt}
                className="h-12 w-auto object-contain"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};