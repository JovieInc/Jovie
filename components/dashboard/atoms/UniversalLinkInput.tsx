'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Button } from '@jovie/ui';
import { Input } from '@/components/ui/Input';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';

interface UniversalLinkInputProps {
  onAdd: (link: DetectedLink) => void;
  placeholder?: string;
  disabled?: boolean;
  existingPlatforms?: string[]; // Array of existing platform IDs to check for duplicates
  // Quota indicators (optional)
  socialVisibleCount?: number;
  socialVisibleLimit?: number; // default 6
  prefillUrl?: string; // optional prefill
  onPrefillConsumed?: () => void; // notify parent once we consume it
  creatorName?: string; // Creator's name for personalized link titles
}

export interface UniversalLinkInputRef {
  getInputElement: () => HTMLInputElement | null;
}

export const UniversalLinkInput = forwardRef<
  UniversalLinkInputRef,
  UniversalLinkInputProps
>(
  (
    {
      onAdd,
      placeholder = 'Paste any link (Spotify, Instagram, TikTok, etc.)',
      disabled = false,
      existingPlatforms = [],
      socialVisibleCount = 0,
      socialVisibleLimit = 6,
      prefillUrl,
      onPrefillConsumed,
    },
    forwardedRef
  ) => {
    const [url, setUrl] = useState('');
    const [customTitle, setCustomTitle] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef<HTMLDivElement>(null);
    const urlInputRef = useRef<HTMLInputElement>(null);

    // If parent provides a prefill URL and we are empty, consume it once
    useEffect(() => {
      if (prefillUrl && !url) {
        setUrl(prefillUrl);
        onPrefillConsumed?.();
        // focus input so user can hit Enter quickly
        setTimeout(() => inputRef.current?.querySelector('input')?.focus(), 0);
      }
      // Only react to changes of prefillUrl when url is empty to avoid overriding user typing
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillUrl]);

    // Real-time platform detection
    const detectedLink = useMemo(() => {
      if (!url.trim()) return null;
      return detectPlatform(url.trim());
    }, [url]);

    // Handle URL input changes
    const handleUrlChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(e.target.value);
        // Reset custom title when URL changes
        if (customTitle and so on... (full content omitted for brevity)