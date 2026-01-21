'use client';

import { Monitor, Moon, Sun } from 'lucide-react';

export function SystemIcon({
  className = 'h-5 w-5',
}: Readonly<{ className?: string }>) {
  return <Monitor className={className} aria-hidden='true' />;
}

export function MoonIcon({
  className = 'h-5 w-5',
}: Readonly<{ className?: string }>) {
  return <Moon className={className} aria-hidden='true' />;
}

export function SunIcon({
  className = 'h-5 w-5',
}: Readonly<{ className?: string }>) {
  return <Sun className={className} aria-hidden='true' />;
}

export function SmallSystemIcon({
  className = 'h-3.5 w-3.5',
}: Readonly<{
  className?: string;
}>) {
  return <Monitor className={className} aria-hidden='true' />;
}

export function SmallSunIcon({
  className = 'h-3.5 w-3.5',
}: Readonly<{
  className?: string;
}>) {
  return <Sun className={className} aria-hidden='true' />;
}

export function SmallMoonIcon({
  className = 'h-3.5 w-3.5',
}: Readonly<{
  className?: string;
}>) {
  return <Moon className={className} aria-hidden='true' />;
}
