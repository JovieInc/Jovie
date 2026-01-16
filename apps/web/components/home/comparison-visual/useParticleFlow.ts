'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  side: 'left' | 'right';
  state: 'stream' | 'forking' | 'arrived' | 'fading';
  targetIndex: number; // Which button (0-3 for left, 0-2 for right)
  convertPulse: number;
}

interface UseParticleFlowOptions {
  isVisible: boolean;
  prefersReducedMotion: boolean;
  containerWidth: number;
  containerHeight: number;
  activeJovieIndex: number;
  maxParticles?: number;
  spawnRate?: number;
}

// Button positions relative to container
const LEFT_BUTTONS_X_RATIO = 0.3; // Where left buttons are
const RIGHT_BUTTONS_X_RATIO = 0.7; // Where right buttons are
const BUTTON_HEIGHT = 40;
const BUTTON_GAP = 12;

export function useParticleFlow({
  isVisible,
  prefersReducedMotion,
  containerWidth,
  containerHeight,
  activeJovieIndex,
  maxParticles = 30,
  spawnRate = 200,
}: UseParticleFlowOptions) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleIdRef = useRef(0);
  const frameRef = useRef<number>();
  const lastSpawnRef = useRef(0);

  // Calculate button Y positions (centered in container)
  const getButtonY = useCallback(
    (index: number, buttonCount: number) => {
      const totalHeight =
        buttonCount * BUTTON_HEIGHT + (buttonCount - 1) * BUTTON_GAP;
      const startY = (containerHeight - totalHeight) / 2;
      return startY + index * (BUTTON_HEIGHT + BUTTON_GAP) + BUTTON_HEIGHT / 2;
    },
    [containerHeight]
  );

  const spawnParticle = useCallback(
    (side: 'left' | 'right'): Particle => {
      const startX = side === 'left' ? -10 : containerWidth * 0.4;
      const centerY = containerHeight / 2;

      // For left: random target among 4 buttons
      // For right: always target the active button
      const targetIndex =
        side === 'left' ? Math.floor(Math.random() * 4) : activeJovieIndex;

      return {
        id: particleIdRef.current++,
        x: startX,
        y: centerY + (Math.random() - 0.5) * 20,
        vx: 2,
        vy: 0,
        opacity: 0.9,
        side,
        state: 'stream',
        targetIndex,
        convertPulse: 0,
      };
    },
    [containerWidth, containerHeight, activeJovieIndex]
  );

  const updateParticle = useCallback(
    (particle: Particle): Particle | null => {
      let { x, y, vx, vy, opacity, state, convertPulse } = particle;

      // Update position
      x += vx;
      y += vy;

      if (particle.side === 'left') {
        // LEFT: Fork to 4 buttons
        const targetX = containerWidth * LEFT_BUTTONS_X_RATIO;
        const targetY = getButtonY(particle.targetIndex, 4);

        if (state === 'stream') {
          // Move toward fork point
          if (x > targetX * 0.5) {
            state = 'forking';
          }
        }

        if (state === 'forking') {
          // Curve toward target button
          const dy = targetY - y;
          vy += dy * 0.05;
          vy *= 0.9;

          // Slow down as approaching
          if (x > targetX - 20) {
            vx *= 0.9;
          }

          if (x > targetX) {
            state = 'arrived';
          }
        }

        if (state === 'arrived') {
          vx *= 0.8;
          vy *= 0.8;
          opacity *= 0.95;
          if (opacity < 0.1) return null;
        }
      } else {
        // RIGHT: Route to active button
        const targetX = containerWidth * RIGHT_BUTTONS_X_RATIO;
        const targetY = getButtonY(particle.targetIndex, 3);

        if (state === 'stream') {
          // Curve toward target button
          const dy = targetY - y;
          vy += dy * 0.03;
          vy *= 0.92;

          if (x > targetX - 30) {
            state = 'forking';
          }
        }

        if (state === 'forking') {
          // Final approach
          const dy = targetY - y;
          vy += dy * 0.08;
          vy *= 0.85;
          vx *= 0.92;

          if (x > targetX - 5 && Math.abs(y - targetY) < 10) {
            state = 'arrived';
            convertPulse = 1;
          }
        }

        if (state === 'arrived') {
          vx = 0;
          vy = 0;
          convertPulse *= 0.9;
          opacity *= 0.93;
          if (opacity < 0.1) return null;
        }
      }

      // Remove if out of bounds
      if (
        x > containerWidth + 50 ||
        x < -50 ||
        y < -50 ||
        y > containerHeight + 50
      ) {
        return null;
      }

      return { ...particle, x, y, vx, vy, opacity, state, convertPulse };
    },
    [containerWidth, containerHeight, getButtonY]
  );

  useEffect(() => {
    if (!isVisible || prefersReducedMotion || containerWidth === 0) {
      return;
    }

    const animate = (timestamp: number) => {
      // Spawn new particles
      if (timestamp - lastSpawnRef.current > spawnRate) {
        setParticles(prev => {
          if (prev.length >= maxParticles) return prev;
          // Alternate between left and right
          const side =
            prev.filter(p => p.side === 'left').length <=
            prev.filter(p => p.side === 'right').length
              ? 'left'
              : 'right';
          return [...prev, spawnParticle(side)];
        });
        lastSpawnRef.current = timestamp;
      }

      // Update existing particles
      setParticles(prev =>
        prev.map(updateParticle).filter((p): p is Particle => p !== null)
      );

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [
    isVisible,
    prefersReducedMotion,
    containerWidth,
    containerHeight,
    maxParticles,
    spawnRate,
    spawnParticle,
    updateParticle,
  ]);

  // Clear particles when not visible
  useEffect(() => {
    if (!isVisible) {
      setParticles([]);
    }
  }, [isVisible]);

  return particles;
}
