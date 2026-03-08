'use client';

import { useCallback, useState } from 'react';
import type { SaveStatus } from '@/types';

const INITIAL_SAVE_STATUS: SaveStatus = {
  saving: false,
  success: null,
  error: null,
  lastSaved: null,
};

export function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>(INITIAL_SAVE_STATUS);

  const markSaving = useCallback(() => {
    setStatus(prev => ({ ...prev, saving: true, success: null, error: null }));
  }, []);

  const markSuccess = useCallback(() => {
    setStatus({
      saving: false,
      success: true,
      error: null,
      lastSaved: new Date(),
    });
  }, []);

  const markError = useCallback((message: string) => {
    setStatus(prev => ({
      ...prev,
      saving: false,
      success: false,
      error: message,
    }));
  }, []);

  const resetStatus = useCallback(() => {
    setStatus(INITIAL_SAVE_STATUS);
  }, []);

  return {
    status,
    markSaving,
    markSuccess,
    markError,
    resetStatus,
  };
}
