import React from 'react';
import { Button } from './ui/button';

interface EventCardProps {
  title: string;
  description: string;
  onRegister?: () => void;
}

export const EventCard: React.FC<EventCardProps> = ({ title, description, onRegister }) => {
  return (
    <div className="flex-shrink-0 w-[473px] h-[510px] glass-card p-8 flex flex-col justify-between">
      <div>
        <h3 className="text-4xl font-bold metallic-text mb-6">{title}</h3>
        <p className="text-2xl text-muted-foreground leading-relaxed font-light">
          {description}
        </p>
      </div>
      
      <Button 
        onClick={onRegister}
        className="glass-button metallic-text font-bold border border-white/20 rounded-full h-[74px] text-2xl"
      >
        REGISTER
      </Button>
    </div>
  );
};
