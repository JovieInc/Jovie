import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function TableRoot({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <table className={className}>{children}</table>;
}

export function TableHead({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <thead className={className}>{children}</thead>;
}

export function TableBody({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <tbody className={className}>{children}</tbody>;
}

export function TableRow({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <tr className={cn(className)}>{children}</tr>;
}
