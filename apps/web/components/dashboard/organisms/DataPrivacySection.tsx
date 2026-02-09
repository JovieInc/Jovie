'use client';

import { Download, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
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
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import {
  useDeleteAccountMutation,
  useExportDataMutation,
} from '@/lib/queries/useAccountMutations';

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
      {/* Data Export */}
      <DashboardCard variant='settings'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <div className='min-w-0'>
            <h3 className='text-[14px] font-medium text-primary-token'>
              Export Your Data
            </h3>
            <p className='text-[13px] text-secondary-token mt-1'>
              Download a copy of all your data including profile information,
              links, contacts, and settings.
            </p>
          </div>
          <Button
            variant='outline'
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className='w-full sm:w-auto shrink-0'
          >
            <Download className='h-4 w-4 mr-2' />
            {exportMutation.isPending ? 'Exporting...' : 'Export Data'}
          </Button>
        </div>
      </DashboardCard>

      {/* Account Deletion */}
      <DashboardCard variant='settings'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <div className='min-w-0'>
            <h3 className='text-[14px] font-medium text-primary-token'>
              Delete Account
            </h3>
            <p className='text-[13px] text-secondary-token mt-1'>
              Permanently delete your account and all associated data. This
              action cannot be undone.
            </p>
          </div>
          <Button
            variant='destructive'
            onClick={() => setDeleteDialogOpen(true)}
            className='w-full sm:w-auto shrink-0'
          >
            <Trash2 className='h-4 w-4 mr-2' />
            Delete Account
          </Button>
        </div>
      </DashboardCard>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
              className='text-[13px] text-secondary-token block mb-2'
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
