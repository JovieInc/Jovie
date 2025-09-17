'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Toast, ToastProps } from '@/components/atoms/Toast';

export interface ToastOptions extends Omit<ToastProps, 'id' | 'onClose'> {
  id?: string;
}

export interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  hideToast: (id: string) => void;
  clearToasts: () => void;
}

export const ToastContext = React.createContext<ToastContextValue | undefined>(
  undefined
);

export const useToast = (): ToastContextValue => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const hideToast = useCallback((id: string) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (options: ToastOptions): string => {
      const id =
        options.id ||
        `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      setToasts(prevToasts => {
        // Deduplication: check if a toast with the same message already exists
        const existingToast = prevToasts.find(
          toast =>
            toast.message === options.message && toast.type === options.type
        );

        if (existingToast) {
          // Update the existing toast's timestamp to keep it visible longer
          return prevToasts.map(toast =>
            toast.id === existingToast.id
              ? { ...toast, id: `${toast.id}-updated-${Date.now()}` }
              : toast
          );
        }

        // Limit maximum number of toasts (keep most recent)
        const MAX_TOASTS = 5;
        const newToasts = [
          ...prevToasts.slice(-(MAX_TOASTS - 1)),
          {
            ...options,
            id,
            onClose: () => hideToast(id),
          },
        ];

        return newToasts;
      });

      return id;
    },
    [hideToast]
  );

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Listen for error boundary toast events
  useEffect(() => {
    const handleErrorBoundaryToast = (event: CustomEvent) => {
      showToast(event.detail);
    };

    window.addEventListener(
      'error-boundary-toast',
      handleErrorBoundaryToast as EventListener
    );

    return () => {
      window.removeEventListener(
        'error-boundary-toast',
        handleErrorBoundaryToast as EventListener
      );
      setToasts([]);
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, hideToast, clearToasts }}>
      {children}
      <div className='fixed bottom-4 right-4 flex flex-col gap-2 z-50'>
        {toasts.map(toast => (
          <Toast key={toast.id} {...toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
