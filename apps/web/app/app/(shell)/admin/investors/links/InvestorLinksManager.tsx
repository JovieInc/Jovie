'use client';

import { Badge, Button, Input } from '@jovie/ui';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleSlash,
  Copy,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  DrawerButton,
  DrawerFormField,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { Dialog, DialogBody, DialogTitle } from '@/components/organisms/Dialog';
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
              <Input
                id='link-label'
                type='text'
                placeholder='e.g., Sequoia Scout Fund'
                value={label}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLabel(e.target.value)
                }
                disabled={isSubmitting}
                autoFocus
                className='w-full'
              />
            </DrawerFormField>

            <DrawerFormField
              label='Investor Name'
              helperText='Optional. Shown as a personalized greeting in the portal.'
            >
              <Input
                id='link-investor-name'
                type='text'
                placeholder='e.g., Michael Seibel'
                value={investorName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setInvestorName(e.target.value)
                }
                disabled={isSubmitting}
                className='w-full'
              />
            </DrawerFormField>

            <DrawerFormField
              label='Email'
              helperText='Optional. Used for follow-up automation.'
            >
              <Input
                id='link-email'
                type='email'
                placeholder='investor@fund.com'
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
  meeting_booked: { label: 'Meeting booked', variant: 'default' },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const shareableUrl = `${BASE_URL}/investor-portal?t=${link.token}`;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

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
      <Button
        variant='ghost'
        size='sm'
        onClick={handleCopy}
        title='Copy shareable URL'
        className='h-8 px-2'
      >
        {copied ? (
          <Check className='h-3.5 w-3.5 text-success' />
        ) : (
          <Copy className='h-3.5 w-3.5' />
        )}
      </Button>
      <div className='relative' ref={menuRef}>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => setMenuOpen(!menuOpen)}
          className='h-8 px-2'
        >
          <MoreHorizontal className='h-3.5 w-3.5' />
        </Button>
        {menuOpen && (
          <div className='absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-subtle bg-(--linear-app-content-surface) p-1 shadow-popover'>
            <button
              type='button'
              className='flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-app text-secondary-token transition-colors hover:bg-surface-0 hover:text-primary-token'
              onClick={() => {
                onToggleActive(link.id, !link.isActive);
                setMenuOpen(false);
              }}
            >
              {link.isActive ? (
                <>
                  <CircleSlash className='h-3.5 w-3.5' />
                  Deactivate
                </>
              ) : (
                <>
                  <CheckCircle2 className='h-3.5 w-3.5' />
                  Reactivate
                </>
              )}
            </button>
            <button
              type='button'
              className='flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-app text-destructive transition-colors hover:bg-destructive/8'
              onClick={() => {
                setMenuOpen(false);
                onRequestDelete();
              }}
            >
              <Trash2 className='h-3.5 w-3.5' />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Manager Component
// ---------------------------------------------------------------------------

export function InvestorLinksManager() {
  const [links, setLinks] = useState<InvestorLinkWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
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
    fetchLinks();
  }, [fetchLinks]);

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

  if (loading) {
    return (
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Loading investor links'
          subtitle='Preparing link manager.'
        />
        <div className='space-y-2 px-3 py-3'>
          {Array.from({ length: 4 }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders never reorder
              key={`skeleton-${i}`}
              className='h-11 animate-pulse rounded-xl bg-surface-0'
            />
          ))}
        </div>
      </ContentSurfaceCard>
    );
  }

  if (error) {
    return (
      <ContentSurfaceCard className='p-6 text-center'>
        <p className='text-sm text-destructive'>{error}</p>
        <Button
          variant='secondary'
          size='sm'
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchLinks();
          }}
          className='mt-3'
        >
          Retry
        </Button>
      </ContentSurfaceCard>
    );
  }

  return (
    <>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Manage investor links'
          subtitle={(() => {
            if (links.length === 0)
              return 'Create shareable entry points into the investor portal.';
            const plural = links.length === 1 ? '' : 's';
            return `${links.length} link${plural} in your pipeline.`;
          })()}
          actions={
            <div className='flex items-center gap-2'>
              <Button variant='secondary' size='sm' asChild>
                <Link href={APP_ROUTES.ADMIN_INVESTORS}>
                  <ArrowLeft className='mr-1.5 h-3.5 w-3.5' />
                  Pipeline
                </Link>
              </Button>
              <Button size='sm' onClick={() => setCreateDialogOpen(true)}>
                <Plus className='mr-1.5 h-3.5 w-3.5' />
                Create link
              </Button>
            </div>
          }
        />

        {links.length === 0 ? (
          <div className='flex flex-col items-center gap-3 px-6 py-10 text-center'>
            <div className='flex h-11 w-11 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'>
              <Link2 className='h-4 w-4' aria-hidden='true' />
            </div>
            <p className='max-w-md text-app leading-[19px] text-secondary-token'>
              Each investor link is a unique, token-gated entry point to your
              portal. Create one per investor for personalized tracking.
            </p>
            <Button size='sm' onClick={() => setCreateDialogOpen(true)}>
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              Create your first link
            </Button>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[700px] border-collapse text-app'>
              <thead className='bg-surface-0'>
                <tr className='border-b border-subtle text-left text-2xs uppercase tracking-[0.08em] text-tertiary-token'>
                  <th className='px-4 py-2.5 font-semibold'>Label</th>
                  <th className='px-4 py-2.5 font-semibold'>Investor</th>
                  <th className='px-4 py-2.5 font-semibold'>Stage</th>
                  <th className='px-4 py-2.5 font-semibold'>Status</th>
                  <th className='px-4 py-2.5 font-semibold'>Created</th>
                  <th className='px-4 py-2.5 text-right font-semibold'>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {links.map(link => (
                  <tr
                    key={link.id}
                    className='border-b border-subtle bg-transparent transition-colors duration-150 hover:bg-surface-1'
                  >
                    <td className='px-4 py-3 align-middle'>
                      <span className='font-semibold text-primary-token'>
                        {link.label}
                      </span>
                    </td>
                    <td className='px-4 py-3 align-middle text-secondary-token'>
                      <div>
                        <span>{link.investorName || 'Unknown'}</span>
                        {link.email && (
                          <span className='ml-1 text-2xs text-tertiary-token'>
                            ({link.email})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className='px-4 py-3 align-middle'>
                      <StageBadge stage={link.stage} />
                    </td>
                    <td className='px-4 py-3 align-middle'>
                      <StatusBadge isActive={link.isActive} />
                    </td>
                    <td className='px-4 py-3 align-middle text-secondary-token'>
                      {new Date(link.createdAt).toLocaleDateString()}
                    </td>
                    <td className='px-4 py-3 align-middle'>
                      <div className='flex justify-end'>
                        <LinkActions
                          link={link}
                          onToggleActive={handleToggleActive}
                          onRequestDelete={() => setPendingDeleteLink(link)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
