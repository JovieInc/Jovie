'use client';

import { Button, Input } from '@jovie/ui';
import { Download, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { SettingsActionRow } from '@/components/molecules/settings/SettingsActionRow';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { useDeleteAccountMutation, useExportDataMutation } from '@/lib/queries';

export function DataPrivacySection() {
  const { signOut } = useAuthSafe();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const exportMutation = useExportDataMutation();
  const deleteMutation = useDeleteAccountMutation();

  const handleExport = useCallback(() => {
    exportMutation.mutate();
  }, [exportMutation]);

  const handleDelete = useCallback(() => {
    if (confirmText !== 'DELETE') return;
    deleteMutation.mutate(
      { confirmation: 'DELETE' },
      {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          signOut({ redirectUrl: '/' });
        },
      }
    );
  }, [confirmText, deleteMutation, signOut]);

  return (
    <div className='space-y-4'>
      <SettingsPanel>
        <div className='px-4 py-4 sm:px-5'>
          <SettingsActionRow
            icon={<Download className='h-4 w-4' aria-hidden />}
            title='Export your data'
            description='Download a portable copy of your profile, links, contacts, and account settings.'
            action={
              <Button
                variant='secondary'
                onClick={handleExport}
                disabled={exportMutation.isPending}
                className='w-full shrink-0 sm:w-auto'
              >
                {exportMutation.isPending ? 'Exporting...' : 'Export data'}
              </Button>
            }
          />
        </div>
      </SettingsPanel>

      <SettingsPanel>
        <div className='px-4 py-4 sm:px-5'>
          <SettingsActionRow
            icon={<Trash2 className='h-4 w-4' aria-hidden />}
            title='Delete your account'
            description='Permanently remove your account, profile, contacts, and all associated data. This action cannot be undone.'
            action={
              <Button
                variant='primary'
                destructive
                onClick={() => setDeleteDialogOpen(true)}
                className='w-full shrink-0 sm:w-auto'
              >
                Delete account
              </Button>
            }
          />
        </div>
      </SettingsPanel>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={open => {
          setDeleteDialogOpen(open);
          if (!open) setConfirmText('');
        }}
        title='Delete your account?'
        description='This will permanently delete your account, profile, links, contacts, and all associated data. You will be signed out immediately. This action cannot be undone.'
        confirmLabel='Permanently Delete Account'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
        confirmDisabled={confirmText !== 'DELETE'}
      >
        <div className='py-4'>
          <label
            htmlFor='delete-confirm'
            className='mb-2 block text-app text-secondary-token'
          >
            Type <strong>DELETE</strong> to confirm
          </label>
          <Input
            id='delete-confirm'
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder='DELETE'
            autoComplete='off'
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}