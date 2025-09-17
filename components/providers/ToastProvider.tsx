'use client';

import React from 'react';
import { ToastProvider as ToastContextProvider } from '@/components/molecules/ToastContainer';

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  return <ToastContextProvider>{children}</ToastContextProvider>;
}
