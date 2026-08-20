'use client';

import { Badge, Button, ConfirmDialog, Input } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleSlash,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { toast } from '@/components/feedback';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  DrawerButton,
  DrawerFormField,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { EmptyState } from '@/components/molecules/EmptyState';
import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
import {
  TableEmptyState,
  TableIconButton,
  UnifiedTable,
  UnifiedTableSkeleton,
} from '@/components/organisms/table';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';

// ---------------------------------------------------------------------------
// Types (mirrored from schema to avoid server-only import in client component)
// ---------------------------------------------------------------------------

interface InvestorLink {
  id: string;
  token: string;
  label: string;
  email: string | null;
  investorName: string | null;
  stage: string;
  engagementScore: number;
  notes: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  lastEmailSentAt: Date | null;
  emailSequenceStep: number;
  createdAt: Date;
  updatedAt: Date;
}

type InvestorLinkWithCounts = InvestorLink & {
  viewCount?: number;
  lastViewed?: string | null;
};

const columnHelper = createColumnHelper<InvestorLinkWithCounts>();

// ---------------------------------------------------------------------------
// Create Link Dialog
// ---------------------------------------------------------------------------

function CreateLinkDialog({
  open,
  onClose,
  onCreated,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (link: InvestorLink) => void;
}) {
  const [label, setLabel] = useState('');
  const [investorName, setInvestorName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<InvestorLink | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const reset = useCallback(() => {
    setLabel('');
    setInvestorName('');
    setEmail('');
    setError(null);
    setCreatedLink(null);
    setIsSubmitting(false);
    setCopied(false);
  }, []);

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError('Label is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/investors/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: trimmedLabel,
          investorName: investorName.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create link (${res.status})`);
      }

      const { link } = await res.json();
      setCreatedLink(link);
      onCreated(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setIsSubmitting(false);
    }
  };

  const shareableUrl = createdLink
    ? `${BASE_URL}/investor-portal?t=${createdLink.token}`
    : null;

  const handleCopy = async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for HTTP contexts
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} size='md'>
      <DialogTitle>
        {createdLink ? 'Link Created' : 'Create Investor Link'}
      </DialogTitle>
      <DialogBody>
        {createdLink ? (
          <div className='space-y-4'>
            <DrawerSurfaceCard
              variant='card'
              className='flex items-center gap-2 border-success/20 bg-success/8 px-3 py-2'
            >
              <Icon
                name='CheckCircle'
                className='h-3.5 w-3.5 shrink-0 text-success'
              />
              <p className='text-xs font-medium text-success'>
                Investor link created for{' '}
                {createdLink.investorName || createdLink.label}
              </p>
            </DrawerSurfaceCard>

            <DrawerFormField
              label='Shareable URL'
              helperText='Send this link to the investor. It grants token-gated access to the portal.'
            >
              <div className='flex gap-2'>
                <Input
                  value={shareableUrl ?? ''}
                  readOnly
                  className='w-full font-mono text-xs'
                  onClick={(e: React.MouseEvent<HTMLInputElement>) =>
                    (e.target as HTMLInputElement).select()
                  }
                />
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={handleCopy}
                  className='shrink-0'
                >
                  {copied ? (
                    <Check className='h-3.5 w-3.5' />
                  ) : (
                    <Copy className='h-3.5 w-3.5' />
                  )}
                </Button>
              </div>
            </DrawerFormField>

            <div className='flex justify-end pt-2'>
              <DrawerButton type='button' tone='primary' onClick={handleClose}>
                Done
              </DrawerButton>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className='space-y-4'>
            <DrawerFormField
              label='Label'
              helperText='Internal name for this link (e.g., "YC Partner - Q1 2026")'
            >
              {/* eslint-disable @jovie/canonical-ui-label-casing -- False positive: the placeholder already matches the rule's expected sentence case. */}
              <Input
                id='link-label'
                type='text'
                placeholder='E.g., Sequoia Scout Fund'
                value={label}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLabel(e.target.value)
                }
                disabled={isSubmitting}
                autoFocus
                className='w-full'
              />
              {/* eslint-enable @jovie/canonical-ui-label-casing */}
            </DrawerFormField>

            <DrawerFormField
              label='Investor Name'
              helperText='Optional. Shown as a personalized greeting in the portal.'
            >
              {/* eslint-disable @jovie/canonical-ui-label-casing -- False positive: the placeholder already matches the rule's expected sentence case. */}
              <Input
                id='link-investor-name'
                type='text'
                placeholder='E.g., Michael Seibel'
                value={investorName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setInvestorName(e.target.value)
                }
                disabled={isSubmitting}
                className='w-full'
              />
              {/* eslint-enable @jovie/canonical-ui-label-casing */}
            </DrawerFormField>

            <DrawerFormField
              label='Email'
              helperText='Optional. Used for follow-up automation.'
            >
              <Input
                id='link-email'
                type='email'
                placeholder='Investor@fund.com'
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                disabled={isSubmitting}
                className='w-full'
              />
            </DrawerFormField>

            {error && (
              <DrawerSurfaceCard
                variant='card'
                className='flex items-center gap-2 border-destructive/20 bg-destructive/8 px-3 py-2'
              >
                <Icon
                  name='XCircle'
                  className='h-3.5 w-3.5 shrink-0 text-destructive'
                />
                <p className='text-xs font-medium text-destructive'>{error}</p>
              </DrawerSurfaceCard>
            )}

            <div className='flex justify-end gap-3 pt-2'>
              <DrawerButton
                type='button'
                tone='ghost'
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </DrawerButton>
              <DrawerButton
                type='submit'
                tone='primary'
                disabled={isSubmitting || !label.trim()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className='mr-2 h-3.5 w-3.5' />
                    Create Link
                  </>
                )}
              </DrawerButton>
            </div>
          </form>
        )}
      </DialogBody>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Shared badge components (also used on pipeline page)
// ---------------------------------------------------------------------------

const STAGE_STYLES: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'warning' | 'success' | 'destructive';
  }
> = {
  shared: { label: 'Shared', variant: 'secondary' },
  viewed: { label: 'Viewed', variant: 'default' },
  engaged: { label: 'Engaged', variant: 'warning' },
  meeting_booked: { label: 'Meeting Booked', variant: 'default' },
  committed: { label: 'Committed', variant: 'success' },
  wired: { label: 'Wired', variant: 'success' },
  passed: { label: 'Passed', variant: 'destructive' },
  declined: { label: 'Declined', variant: 'destructive' },
};

function StageBadge({ stage }: Readonly<{ stage: string }>) {
  const style = STAGE_STYLES[stage] ?? {
    label: stage.replaceAll('_', ' '),
    variant: 'secondary' as const,
  };
  return (
    <Badge variant={style.variant} size='sm'>
      {style.label}
    </Badge>
  );
}

function StatusBadge({ isActive }: { readonly isActive: boolean }) {
  return isActive ? (
    <span className='inline-flex items-center gap-1.5 text-xs text-secondary-token'>
      <CheckCircle2 className='h-3.5 w-3.5 text-success' />
      Active
    </span>
  ) : (
    <span className='inline-flex items-center gap-1.5 text-xs text-secondary-token'>
      <CircleSlash className='h-3.5 w-3.5 text-tertiary-token' />
      Disabled
    </span>
  );
}

// ---------------------------------------------------------------------------
// Link row actions
// ---------------------------------------------------------------------------

function LinkActions({
  link,
  onToggleActive,
  onRequestDelete,
}: {
  readonly link: InvestorLinkWithCounts;
  readonly onToggleActive: (id: string, isActive: boolean) => void;
  readonly onRequestDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const shareableUrl = `${BASE_URL}/investor-portal?t=${link.token}`;
  const actionItems = [
    {
      id: link.isActive ? 'deactivate' : 'reactivate',
      label: link.isActive ? 'Deactivate' : 'Reactivate',
      icon: link.isActive ? CircleSlash : CheckCircle2,
      onClick: () => onToggleActive(link.id, !link.isActive),
    },
    { id: 'separator', label: '' },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      variant: 'destructive' as const,
      onClick: onRequestDelete,
    },
  ];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for HTTP contexts
    }
  };

  return (
    <div className='flex items-center gap-2'>
      <TableIconButton
        ariaLabel='Copy shareable URL'
        className='text-tertiary-token'
        icon={
          copied ? (
            <Check className='h-3.5 w-3.5 text-success' />
          ) : (
            <Copy className='h-3.5 w-3.5' />
          )
        }
        onClick={handleCopy}
        tooltip='Copy shareable URL'
      />
      <TableActionMenu items={actionItems} align='end' />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Manager Component
// ---------------------------------------------------------------------------

export function InvestorLinksManager({
  initialLinks,
}: {
  readonly initialLinks?: readonly InvestorLinkWithCounts[];
}) {
  const [links, setLinks] = useState<InvestorLinkWithCounts[]>(() => [
    ...(initialLinks ?? []),
  ]);
  const [loading, setLoading] = useState(initialLinks === undefined);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pendingDeleteLink, setPendingDeleteLink] =
    useState<InvestorLinkWithCounts | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/investors/links');
      if (!res.ok) throw new Error('Failed to fetch links');
      const data = await res.json();
      setLinks(data.links ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load links');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLinks === undefined) {
      fetchLinks();
    }
  }, [fetchLinks, initialLinks]);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    // Optimistic update
    setLinks(prev => prev.map(l => (l.id === id ? { ...l, isActive } : l)));
    try {
      const res = await fetch(`/api/admin/investors/links/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error('Failed to update link');
    } catch {
      // Revert on failure
      setLinks(prev =>
        prev.map(l => (l.id === id ? { ...l, isActive: !isActive } : l))
      );
    }
  };

  const handleDelete = async (id: string) => {
    const original = links.find(l => l.id === id);
    setLinks(prev =>
      prev.map(l => (l.id === id ? { ...l, isActive: false } : l))
    );
    try {
      const res = await fetch(`/api/admin/investors/links/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete link');
    } catch (err) {
      if (original) {
        setLinks(prev =>
          prev.map(l =>
            l.id === id ? { ...l, isActive: original.isActive } : l
          )
        );
      }
      throw err;
    }
  };

  const handleCreated = (link: InvestorLink) => {
    setLinks(prev => [link, ...prev]);
  };

  const columns = [
    columnHelper.accessor('label', {
      header: 'Label',
      cell: info => (
        <span className='font-semibold text-primary-token'>
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('investorName', {
      header: 'Investor',
      cell: info => (
        <div className='text-secondary-token'>
          <span>{info.getValue() || 'Unknown'}</span>
          {info.row.original.email ? (
            <span className='ml-1 text-2xs text-tertiary-token'>
              ({info.row.original.email})
            </span>
          ) : null}
        </div>
      ),
    }),
    columnHelper.accessor('stage', {
      header: 'Stage',
      cell: info => <StageBadge stage={info.getValue()} />,
    }),
    columnHelper.accessor('isActive', {
      header: 'Status',
      cell: info => <StatusBadge isActive={info.getValue()} />,
    }),
    columnHelper.accessor('createdAt', {
      header: 'Created',
      cell: info => (
        <span className='text-secondary-token'>
          {new Date(info.getValue()).toLocaleDateString()}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: info => (
        <div className='flex justify-end'>
          <LinkActions
            link={info.row.original}
            onToggleActive={handleToggleActive}
            onRequestDelete={() => setPendingDeleteLink(info.row.original)}
          />
        </div>
      ),
      meta: { className: 'w-24 text-right' },
      enableSorting: false,
    }),
  ];

  if (loading) {
    return (
      <ContentSurfaceCard surface='table' className='overflow-hidden p-0'>
        <UnifiedTableSkeleton
          columns={columns as ColumnDef<InvestorLinkWithCounts, unknown>[]}
          skeletonRows={4}
          rowHeight={44}
          minWidth='700px'
          containerClassName='px-3 py-3'
        />
      </ContentSurfaceCard>
    );
  }

  if (error) {
    return (
      <ContentSurfaceCard>
        <EmptyState
          variant='error'
          heading='Could not load investor links'
          description={error}
          action={{
            label: 'Retry',
            variant: 'secondary',
            onClick: () => {
              setError(null);
              setLoading(true);
              fetchLinks();
            },
          }}
        />
      </ContentSurfaceCard>
    );
  }

  return (
    <>
      <ContentSurfaceCard surface='table' className='overflow-hidden p-0'>
        <div className='flex items-center justify-end gap-2 px-3 py-2'>
          <Button variant='secondary' size='sm' asChild>
            <Link href={APP_ROUTES.ADMIN_INVESTORS}>
              <ArrowLeft className='mr-1.5 h-3.5 w-3.5' />
              Pipeline
            </Link>
          </Button>
          <Button size='sm' onClick={() => setCreateDialogOpen(true)}>
            <Plus className='mr-1.5 h-3.5 w-3.5' />
            Create Link
          </Button>
        </div>

        <UnifiedTable
          data={links}
          columns={columns as ColumnDef<InvestorLinkWithCounts, unknown>[]}
          enableVirtualization={false}
          rowHeight={44}
          minWidth='700px'
          getRowId={link => link.id}
          emptyState={
            <TableEmptyState
              heading='No investor links yet'
              description='Create an investor link to begin sharing the portal.'
            />
          }
        />
      </ContentSurfaceCard>

      <CreateLinkDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={handleCreated}
      />

      <ConfirmDialog
        open={pendingDeleteLink !== null}
        onOpenChange={open => {
          if (!open) setPendingDeleteLink(null);
        }}
        title='Delete investor link?'
        description={
          pendingDeleteLink
            ? `"${pendingDeleteLink.label}" will stop working. Anyone with this URL will see a 404.`
            : ''
        }
        confirmLabel='Delete'
        variant='destructive'
        onConfirm={async () => {
          if (!pendingDeleteLink) return;
          try {
            await handleDelete(pendingDeleteLink.id);
            toast.success('Investor link deleted');
          } catch {
            toast.error("Couldn't delete investor link");
          }
        }}
      />
    </>
  );
}
