'use client';

/**
 * Settings mutation hook for updating user settings.
 *
 * Provides consistent mutation handling for settings updates with:
 * - Automatic toast notifications
 * - Loading state management
 * - Error handling
 * - Query cache invalidation
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError, handleMutationSuccess } from './mutation-utils';

/**
 * Input type for settings updates.
 * Supports partial updates to different settings sections.
 */
export interface SettingsUpdateInput {
  updates: {
    theme?: {
      preference: 'light' | 'dark' | 'system';
    };
    settings?: {
      marketing_emails?: boolean;
      email_notifications?: boolean;
      push_notifications?: boolean;
      hide_branding?: boolean;
    };
  };
}

/**
 * Response from the settings update API.
 */
interface SettingsUpdateResponse {
  success?: boolean;
  error?: string;
}

const updateSettings = createMutationFn<
  SettingsUpdateInput,
  SettingsUpdateResponse
>('/api/dashboard/profile', 'PUT');

/**
 * Hook for updating user settings (theme, notifications, etc.)
 *
 * @example
 * ```tsx
 * function ThemeSelector() {
 *   const { mutate: updateTheme, isPending } = useUpdateSettingsMutation();
 *
 *   const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
 *     updateTheme({ updates: { theme: { preference: theme } } });
 *   };
 *
 *   return <Button onClick={() => handleThemeChange('dark')} disabled={isPending}>Dark</Button>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * function NotificationToggle() {
 *   const { mutate: updateSettings, isPending } = useUpdateSettingsMutation();
 *
 *   const handleToggle = (enabled: boolean) => {
 *     updateSettings({
 *       updates: { settings: { marketing_emails: enabled } }
 *     });
 *   };
 *
 *   return <Switch onChange={handleToggle} disabled={isPending} />;
 * }
 * ```
 */
export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSettings,

    onSuccess: (_data, variables) => {
      // Show appropriate success message based on what was updated
      if (variables.updates.theme) {
        handleMutationSuccess('Theme preference saved');
      } else if (variables.updates.settings?.hide_branding !== undefined) {
        handleMutationSuccess('Branding settings saved');
      } else if (variables.updates.settings) {
        handleMutationSuccess('Settings saved');
      } else {
        handleMutationSuccess('Changes saved');
      }

      // Invalidate user settings queries to reflect changes
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.settings(),
      });
    },

    onError: (error, variables) => {
      // Show appropriate error message based on what was attempted
      if (variables.updates.theme) {
        handleMutationError(error, 'Failed to save theme preference');
      } else if (variables.updates.settings) {
        handleMutationError(error, 'Failed to save settings');
      } else {
        handleMutationError(error, 'Failed to save changes');
      }
    },
  });
}

/**
 * Convenience hook specifically for theme updates.
 *
 * @example
 * ```tsx
 * const { updateTheme, isPending } = useThemeMutation();
 * updateTheme('dark');
 * ```
 */
export function useThemeMutation() {
  const mutation = useUpdateSettingsMutation();

  return {
    updateTheme: (preference: 'light' | 'dark' | 'system') => {
      mutation.mutate({ updates: { theme: { preference } } });
    },
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}

/**
 * Convenience hook specifically for notification settings.
 *
 * @example
 * ```tsx
 * const { updateNotifications, isPending } = useNotificationSettingsMutation();
 * updateNotifications({ marketing_emails: false });
 * ```
 */
export function useNotificationSettingsMutation() {
  const mutation = useUpdateSettingsMutation();

  return {
    updateNotifications: (
      settings: SettingsUpdateInput['updates']['settings']
    ) => {
      mutation.mutate({ updates: { settings } });
    },
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}

/**
 * Convenience hook specifically for branding settings.
 *
 * @example
 * ```tsx
 * const { updateBranding, isPending } = useBrandingSettingsMutation();
 * updateBranding(true); // Hide branding
 * ```
 */
export function useBrandingSettingsMutation() {
  const mutation = useUpdateSettingsMutation();

  return {
    updateBranding: (hideBranding: boolean) => {
      mutation.mutate({
        updates: { settings: { hide_branding: hideBranding } },
      });
    },
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}
