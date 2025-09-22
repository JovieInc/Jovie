'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface StaggeredAnimationProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
}

export function StaggeredAnimation({
  children,
  delay = 0,
  className,
  direction = 'up',
}: StaggeredAnimationProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  const getTransformClasses = () => {
    const base = 'transition-all duration-500 ease-out';

    if (!isVisible) {
      const transforms = {
        up: 'translate-y-4 opacity-0',
        down: 'translate-y-[-16px] opacity-0',
        left: 'translate-x-4 opacity-0',
        right: 'translate-x-[-16px] opacity-0',
      };
      return `${base} ${transforms[direction]}`;
    }

    return `${base} translate-y-0 translate-x-0 opacity-100`;
  };

  return (
    <div ref={ref} className={cn(getTransformClasses(), className)}>
      {children}
    </div>
  );
}

interface StaggeredListProps {
  children: React.ReactNode[];
  stagger?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  className?: string;
}

export function StaggeredList({
  children,
  stagger = 100,
  direction = 'up',
  className,
}: StaggeredListProps) {
  return (
    <div className={className}>
      {React.Children.map(children, (child, index) => (
        <StaggeredAnimation
          key={index}
          delay={index * stagger}
          direction={direction}
        >
          {child}
        </StaggeredAnimation>
      ))}
    </div>
  );
}
