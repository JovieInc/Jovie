'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { Contact } from '@/types';
import type { AdminCreatorSocialLinksResponse } from './types';

interface UseContactSaveOptions {
  onSaveSuccess?: (contact: Contact) => void;
}

interface UseContactSaveReturn {
  isSaving: boolean;
  saveContact: (contact: Contact) => Promise<boolean>;
}

/**
 * Hook to save admin contact changes including social links.
 *
 * Features:
 * - Optimistic error handling with toast notifications
 * - Saves social links via admin API with cache invalidation
 * - Returns success/failure for UI state management
 */
export function useContactSave({
  onSaveSuccess,
}: UseContactSaveOptions = {}): UseContactSaveReturn {
  const [isSaving, setIsSaving] = useState(false);

  const saveContact = useCallback(
    async (contact: Contact): Promise<boolean> => {
      if (!contact.id) {
        toast.error('Cannot save contact without ID');
        return false;
      }

      setIsSaving(true);
      const toastId = toast.loading('Saving contact...');

      try {
        // Save social links
        const response = await fetch('/api/admin/creator-social-links', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            profileId: contact.id,
            links: contact.socialLinks.map((link, index) => ({
              id: link.id,
              url: link.url,
              label: link.label,
              platformType: link.platformType,
              sortOrder: index,
            })),
          }),
        });

        const result = (await response
          .json()
          .catch(() => null)) as AdminCreatorSocialLinksResponse | null;

        if (!response.ok || !result?.success) {
          const errorMessage =
            result && 'error' in result
              ? result.error
              : 'Failed to save contact';
          toast.error(errorMessage, { id: toastId });
          return false;
        }

        // Update contact with server-assigned IDs
        const updatedContact: Contact = {
          ...contact,
          socialLinks: result.links.map(link => ({
            id: link.id,
            url: link.url,
            label: link.label,
            platformType: link.platformType,
          })),
        };

        toast.success('Contact saved', { id: toastId });
        onSaveSuccess?.(updatedContact);
        return true;
      } catch (error) {
        console.error('Failed to save contact:', error);
        toast.error('Failed to save contact', { id: toastId });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [onSaveSuccess]
  );

  return {
    isSaving,
    saveContact,
  };
}
