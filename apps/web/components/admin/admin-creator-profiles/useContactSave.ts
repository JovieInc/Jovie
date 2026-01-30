'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queries';
import { FetchError, fetchWithTimeout } from '@/lib/queries/fetch';
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
  const queryClient = useQueryClient();

  const { mutateAsync, isPending: isSaving } = useMutation({
    mutationKey: ['admin-contact-save'],
    mutationFn: async (contact: Contact) => {
      if (!contact.id) {
        throw new Error('Cannot save contact without ID');
      }

      try {
        const result = await fetchWithTimeout<AdminCreatorSocialLinksResponse>(
          '/api/admin/creator-social-links',
          {
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
          }
        );

        if (!result.success) {
          throw new Error(
            'error' in result ? result.error : 'Failed to save contact'
          );
        }

        const updatedContact: Contact = {
          ...contact,
          socialLinks: result.links.map(link => ({
            id: link.id,
            url: link.url,
            label: link.label,
            platformType: link.platformType,
          })),
        };

        return updatedContact;
      } catch (error) {
        if (error instanceof FetchError) {
          throw new Error('Failed to save contact');
        }
        throw error;
      }
    },
    onSuccess: async (updatedContact, contact) => {
      toast.success('Contact saved', { id: 'admin-contact-save' });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.creators.socialLinks(contact.id ?? ''),
      });
      onSaveSuccess?.(updatedContact);
    },
    onError: error => {
      const toastId = toast.loading('Saving contact...');
      toast.error(
        error instanceof Error ? error.message : 'Failed to save contact',
        {
          id: toastId,
        }
      );
    },
  });

  const saveContact = useCallback(
    async (contact: Contact): Promise<boolean> => {
      const toastId = 'admin-contact-save';
      toast.loading('Saving contact...', { id: toastId });
      try {
        const updatedContact = await mutateAsync(contact);
        toast.success('Contact saved', { id: toastId });
        onSaveSuccess?.(updatedContact);
        return true;
      } catch (error) {
        console.error('Failed to save contact:', error);
        toast.error('Failed to save contact', { id: toastId });
        return false;
      }
    },
    [mutateAsync, onSaveSuccess]
  );

  return {
    isSaving,
    saveContact,
  };
}
