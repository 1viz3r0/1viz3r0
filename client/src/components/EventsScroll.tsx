import React, { useState, useRef } from 'react';
import { EventCard } from './EventCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Event {
  id: string;
  title: string;
  description: string;
}

const events: Event[] = [
  {
    id: '1',
    title: 'Cybersecurity Workshop',
    description: 'Learn advanced penetration testing techniques and vulnerability assessment in this hands-on workshop designed for security professionals.'
  },
  {
    id: '2',
    title: 'Web3 Security Summit',
    description: 'Explore blockchain security, smart contract auditing, and decentralized application protection with industry experts.'
  },
  {
    id: '3',
    title: 'Cloud Defense Training',
    description: 'Master cloud security architecture, compliance frameworks, and best practices for AWS, Azure, and GCP environments.'
  },
  {
    id: '4',
    title: 'Ethical Hacking Bootcamp',
    description: 'Intensive training covering reconnaissance, exploitation, post-exploitation, and reporting in controlled environments.'
  },
  {
    id: '5',
    title: 'AI Security Conference',
    description: 'Discover the intersection of artificial intelligence and cybersecurity, including ML model security and adversarial attacks.'
  }
];

export const EventsScroll: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();
  
  // Duplicate events for seamless loop
  const duplicatedEvents = [...events, ...events, ...events];

  const handleRegister = (eventId: string) => {
    navigate('/login?mode=register');
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 500;
      const newScrollLeft = scrollContainerRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || isHovered) return;

    let animationId: number;
    let lastTimestamp = 0;
    const speed = 0.5; // pixels per frame

    const animate = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const delta = timestamp - lastTimestamp;
      
      if (delta > 16) { // ~60fps
        container.scrollLeft += speed;
        
        // Reset scroll when reaching the end of first set
        const maxScroll = container.scrollWidth / 3;
        if (container.scrollLeft >= maxScroll) {
          container.scrollLeft = 0;
        }
        
        lastTimestamp = timestamp;
      }
      
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, [isHovered]);
  
  return (
    <div 
      className="relative py-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Navigation Arrows - Hidden on mobile */}
      <button
        onClick={() => scroll('left')}
        className="hidden sm:flex absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 glass-card p-2 sm:p-3 rounded-full border border-white/20 hover:bg-white/10 transition-all"
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-foreground" />
      </button>
      
      <button
        onClick={() => scroll('right')}
        className="hidden sm:flex absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 glass-card p-2 sm:p-3 rounded-full border border-white/20 hover:bg-white/10 transition-all"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-foreground" />
      </button>

      {/* Fade gradients */}
      <div className="absolute inset-y-0 left-0 w-16 sm:w-24 md:w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 sm:w-24 md:w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      
      <div 
        ref={scrollContainerRef}
        className="flex gap-4 sm:gap-6 md:gap-8 overflow-x-auto scrollbar-hide px-2 sm:px-4"
        style={{ 
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } }
      >
        {duplicatedEvents.map((event, index) => (
          <EventCard
            key={`${event.id}-${index}`}
            title={event.title}
            description={event.description}
            onRegister={() => handleRegister(event.id)}
          />
        ))}
      </div>
    </div>
  );
};