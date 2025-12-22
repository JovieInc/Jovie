import { useCallback, useState } from 'react';

interface FormState {
  loading: boolean;
  error: string;
  success: string;
}

interface UseFormStateReturn extends FormState {
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setSuccess: (success: string) => void;
  reset: () => void;
  handleAsync: <T>(asyncFn: () => Promise<T>) => Promise<T>;
}

export function useFormState(): UseFormStateReturn {
  const [state, setState] = useState<FormState>({
    loading: false,
    error: '',
    success: '',
  });

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, error, loading: false, success: '' }));
  }, []);

  const setSuccess = useCallback((success: string) => {
    setState(prev => ({ ...prev, success, loading: false, error: '' }));
  }, []);

  const reset = useCallback(() => {
    setState({ loading: false, error: '', success: '' });
  }, []);

  const handleAsync = useCallback(
    async <T>(asyncFn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError('');
      setSuccess('');

      try {
        const result = await asyncFn();
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'An error occurred';
        setError(errorMessage);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError, setSuccess]
  );

  return {
    ...state,
    setLoading,
    setError,
    setSuccess,
    reset,
    handleAsync,
  };
}
