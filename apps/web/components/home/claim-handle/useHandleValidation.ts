import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface HandleValidationResult {
  handleError: string | null;
  checkingAvail: boolean;
  available: boolean | null;
  availError: string | null;
}

export function useHandleValidation(handle: string): HandleValidationResult {
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const lastQueriedRef = useRef<string>('');

  // Better handle validation with stricter regex for lowercase a-z, 0-9, hyphen
  const handleError = useMemo(() => {
    if (!handle) return null;
    if (handle.length < 3) return 'Handle must be at least 3 characters';
    if (handle.length > 30) return 'Handle must be less than 30 characters';
    if (!/^[a-z0-9-]+$/.test(handle))
      return 'Handle can only contain lowercase letters, numbers, and hyphens';
    if (handle.startsWith('-') || handle.endsWith('-'))
      return 'Handle cannot start or end with a hyphen';
    return null;
  }, [handle]);

  // Debounced live availability check (350-500ms per requirements)
  useEffect(() => {
    setAvailError(null);
    if (!handle || handleError) {
      setAvailable(null);
      setCheckingAvail(false);
      return;
    }

    const value = handle.toLowerCase();
    lastQueriedRef.current = value;
    setCheckingAvail(true);
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/handle/check?handle=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        );
        const json = await res
          .json()
          .catch(() => ({ available: false, error: 'Parse error' }));
        // Ignore out-of-order responses
        if (lastQueriedRef.current !== value) return;
        if (!res.ok) {
          setAvailable(null);
          setAvailError(json?.error || 'Error checking availability');
        } else {
          setAvailable(Boolean(json?.available));
          setAvailError(null);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (lastQueriedRef.current !== value) return;
        setAvailable(null);
        setAvailError('Network error');
      } finally {
        if (lastQueriedRef.current === value) setCheckingAvail(false);
      }
    }, 450); // 450ms debounce (within 350-500ms requirement)

    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [handle, handleError]);

  return {
    handleError,
    checkingAvail,
    available,
    availError,
  };
}
