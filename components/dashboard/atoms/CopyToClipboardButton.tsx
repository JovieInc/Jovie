'use client';

import { useState } from 'react';
import { Button } from '@jovie/ui';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { track } from '@/lib/analytics';

type CopyStatus = 'idle' | 'success' | 'error';

export interface CopyToClipboardButtonProps {
  relativePath: string; // e.g. '/artist-handle'
  idleLabel?: string;
  successLabel?: string;
  errorLabel?: string;
}

export function CopyToClipboardButton({
  relativePath,
  idleLabel = 'Copy URL',
  successLabel = '✓ Copied!',
  errorLabel = 'Failed to copy',
}: CopyToClipboardButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');

  const fallbackCopy = (text: string): boolean => {
    try {
      // Create a temporary textarea element
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      
      // Select and copy the text
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      
      // Clean up
      document.body.removeChild(textarea);
      
      return successful;
    } catch (error) {
      console.error('Fallback copy failed:', error);
      return false;
    }
  };

  const onCopy = async () => {
    const url = `${getBaseUrl()}${relativePath}`;
    let copySuccess = false;
    
    try {
      // Try modern clipboard API first
      if (navigator.clipboard and etc...