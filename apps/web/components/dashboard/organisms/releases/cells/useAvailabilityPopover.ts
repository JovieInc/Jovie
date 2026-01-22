import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ProviderKey } from '@/lib/discography/types';

// Provider domain mapping for URL validation
const PROVIDER_DOMAINS: Record<ProviderKey, string[]> = {
  apple_music: ['music.apple.com', 'itunes.apple.com'],
  spotify: ['open.spotify.com', 'spotify.com'],
  youtube: ['music.youtube.com', 'youtube.com'],
  soundcloud: ['soundcloud.com'],
  deezer: ['deezer.com'],
  amazon_music: ['music.amazon.com', 'amazon.com'],
  tidal: ['tidal.com'],
  bandcamp: ['bandcamp.com'],
  beatport: ['beatport.com'],
};

interface UseAvailabilityPopoverProps {
  releaseId: string;
  onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
}

/**
 * useAvailabilityPopover - State management for AvailabilityCell popover
 *
 * Extracts all stateful logic from AvailabilityCell to make the component
 * easier to understand and test.
 */
export function useAvailabilityPopover({
  releaseId,
  onAddUrl,
  onCopy,
}: UseAvailabilityPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copiedTestId, setCopiedTestId] = useState<string | null>(null);
  const [addingProvider, setAddingProvider] = useState<ProviderKey | null>(
    null
  );
  const [urlInput, setUrlInput] = useState('');
  const [validationError, setValidationError] = useState('');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Clear stale validation error when switching providers
  useEffect(() => {
    setValidationError('');
  }, [addingProvider]);

  const handleCopyWithFeedback = useCallback(
    async (path: string, label: string, testId: string) => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      try {
        await onCopy(path, label, testId);
        setCopiedTestId(testId);
      } catch {
        // Don't show success feedback on failure (parent handles error toast)
        setCopiedTestId(null);
      } finally {
        copyTimeoutRef.current = setTimeout(() => setCopiedTestId(null), 2000);
      }
    },
    [onCopy]
  );

  const handleAddUrl = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!addingProvider || !onAddUrl) return;

      const trimmed = urlInput.trim();
      if (!trimmed) return;

      // Validate URL format
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmed);
      } catch {
        setValidationError('Please enter a valid URL');
        return;
      }

      // Validate provider domain
      const allowedDomains = PROVIDER_DOMAINS[addingProvider];
      const hostname = parsedUrl.hostname.toLowerCase();
      const isValidDomain = allowedDomains.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      );

      if (!isValidDomain) {
        const domainMsg =
          allowedDomains.length === 1
            ? allowedDomains[0]
            : 'one of: ' + allowedDomains.join(', ');
        setValidationError(`URL must be from ${domainMsg}`);
        return;
      }

      setValidationError('');
      try {
        await onAddUrl(releaseId, addingProvider, trimmed);
        setUrlInput('');
        setAddingProvider(null);
      } catch {
        // Error toast is shown by parent
      }
    },
    [addingProvider, onAddUrl, releaseId, urlInput]
  );

  return {
    // Popover state
    open,
    setOpen,

    // Copy feedback state
    copiedTestId,
    handleCopyWithFeedback,

    // Add URL state
    addingProvider,
    setAddingProvider,
    urlInput,
    setUrlInput,
    validationError,
    setValidationError,
    handleAddUrl,

    // Refs
    inputRef,
  };
}
