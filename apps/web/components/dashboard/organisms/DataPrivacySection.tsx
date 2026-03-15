'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
} from '@jovie/ui';
import { Download, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useDeleteAccountMutation, useExportDataMutation } from '@/lib/queries';

export function DataPrivacySection() {
  const router = useRouter();
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
          // Redirect to home after deletion
          router.push('/');
        },
      }
    );
  }, [confirmText, deleteMutation, router]);

  return (
    <div className='space-y-4'>
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Data & privacy'
          subtitle='Export your account data or permanently delete your profile and settings.'
          className='min-h-0 px-4 py-3'
        />
        <div className='space-y-3 px-4 py-3'>
          <ContentSurfaceCard className='flex flex-col justify-between gap-3 bg-(--linear-bg-surface-0) p-4 sm:flex-row sm:items-start sm:gap-4'>
            <div className='min-w-0'>
              <p className='text-[13px] font-[510] text-(--linear-text-primary)'>
                Export your data
              </p>
              <p className='mt-1 text-[13px] leading-[18px] text-(--linear-text-secondary)'>
                Download a copy of your profile information, links, contacts,
                and settings.
              </p>
            </div>
            <Button
              variant='outline'
              onClick={handleExport}
              disabled={exportMutation.isPending}
              className='w-full shrink-0 sm:w-auto'
            >
              <Download className='mr-2 h-4 w-4' aria-hidden />
              {exportMutation.isPending ? 'Exporting...' : 'Export Data'}
            </Button>
          </ContentSurfaceCard>

          <ContentSurfaceCard className='flex flex-col justify-between gap-3 bg-(--linear-bg-surface-0) p-4 sm:flex-row sm:items-start sm:gap-4'>
            <div className='min-w-0'>
              <p className='text-[13px] font-[510] text-(--linear-text-primary)'>
                Delete account
              </p>
              <p className='mt-1 text-[13px] leading-[18px] text-(--linear-text-secondary)'>
                Permanently delete your account and all associated data. This
                action cannot be undone.
              </p>
            </div>
            <Button
              variant='destructive'
              onClick={() => setDeleteDialogOpen(true)}
              className='w-full shrink-0 sm:w-auto'
            >
              <Trash2 className='mr-2 h-4 w-4' aria-hidden />
              Delete Account
            </Button>
          </ContentSurfaceCard>
        </div>
      </DashboardCard>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={open => {
          setDeleteDialogOpen(open);
          if (!open) setConfirmText('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account, profile, links,
              contacts, and all associated data. You will be signed out
              immediately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='py-4'>
            <label
              htmlFor='delete-confirm'
              className='mb-2 block text-[13px] text-(--linear-text-secondary)'
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
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmText('');
              }}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? 'Deleting...'
                : 'Permanently Delete Account'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
