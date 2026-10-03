'use client';

import { Kbd } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import {
  DrawerButton,
  DrawerPropertyRow,
  DrawerSection,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import {
  formatInboxAmount,
  OVIE_INBOX_KIND_LABELS,
  OVIE_INBOX_PRODUCT_LABELS,
  OVIE_INBOX_SOURCE_LABELS,
  type OvieInboxDecision,
  type OvieInboxItem,
} from '@/lib/ovie/inbox';
import { formatTimeAgo } from '@/lib/utils/date-formatting';

const LABEL_WIDTH = 104;

function evidenceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

function statusLabel(item: OvieInboxItem): string {
  if (item.status === 'pending') return 'Pending';
  const verb = item.status === 'approved' ? 'Approved' : 'Rejected';
  return item.decidedAt ? `${verb} ${formatTimeAgo(item.decidedAt)}` : verb;
}

export interface OvieInboxDetailProps {
  readonly item: OvieInboxItem | null;
  readonly isSubmitting: boolean;
  readonly onDecide: (decision: OvieInboxDecision) => void;
  readonly onComment: () => void;
  readonly onClose: () => void;
}

/** Right rail: every field of the selected card, flat sections, no accordions. */
export function OvieInboxDetail({
  item,
  isSubmitting,
  onDecide,
  onComment,
  onClose,
}: Readonly<OvieInboxDetailProps>) {
  const isPending = item?.status === 'pending';

  return (
    <EntitySidebarShell
      isOpen={Boolean(item)}
      width={440}
      ariaLabel='Inbox card details'
      scrollStrategy='shell'
      onClose={onClose}
      title={item?.title}
      isEmpty={!item}
      emptyMessage='Select a card to see its details.'
      data-testid='ovie-inbox-detail'
      footer={
        item && isPending ? (
          <div className='flex items-center gap-2'>
            <DrawerButton
              tone='primary'
              disabled={isSubmitting}
              onClick={() => onDecide('approve')}
              aria-keyshortcuts='A'
            >
              Approve <Kbd>A</Kbd>
            </DrawerButton>
            <DrawerButton
              tone='secondary'
              disabled={isSubmitting}
              onClick={() => onDecide('reject')}
              aria-keyshortcuts='R'
            >
              Reject <Kbd>R</Kbd>
            </DrawerButton>
            <DrawerButton
              tone='ghost'
              disabled={isSubmitting}
              onClick={onComment}
              aria-keyshortcuts='C'
            >
              Comment <Kbd>C</Kbd>
            </DrawerButton>
          </div>
        ) : undefined
      }
    >
      {item ? (
        <>
          <DrawerSection
            title='Card'
            collapsible={false}
            surface='card'
            className='space-y-1'
          >
            <DrawerPropertyRow
              label='Status'
              labelWidth={LABEL_WIDTH}
              value={statusLabel(item)}
            />
            <DrawerPropertyRow
              label='Kind'
              labelWidth={LABEL_WIDTH}
              value={OVIE_INBOX_KIND_LABELS[item.kind]}
            />
            <DrawerPropertyRow
              label='Product'
              labelWidth={LABEL_WIDTH}
              value={OVIE_INBOX_PRODUCT_LABELS[item.product]}
            />
            <DrawerPropertyRow
              label='From'
              labelWidth={LABEL_WIDTH}
              value={OVIE_INBOX_SOURCE_LABELS[item.source]}
            />
            {item.recipient ? (
              <DrawerPropertyRow
                label='Recipient'
                labelWidth={LABEL_WIDTH}
                value={item.recipient}
              />
            ) : null}
            {item.amountUsd === null ? null : (
              <DrawerPropertyRow
                label='Amount'
                labelWidth={LABEL_WIDTH}
                value={formatInboxAmount(item.amountUsd)}
              />
            )}
            <DrawerPropertyRow
              label='Received'
              labelWidth={LABEL_WIDTH}
              value={formatTimeAgo(item.createdAt)}
            />
          </DrawerSection>

          {item.recommendation || item.defaultIfSilent ? (
            <DrawerSection
              title='Summer Recommends'
              collapsible={false}
              surface='card'
              className='space-y-2'
            >
              {item.recommendation ? (
                <p className='text-app leading-5 text-primary-token'>
                  {item.recommendation}
                </p>
              ) : null}
              {item.defaultIfSilent ? (
                <p className='text-xs leading-4 text-secondary-token'>
                  If you stay silent: {item.defaultIfSilent}
                </p>
              ) : null}
            </DrawerSection>
          ) : null}

          <DrawerSection
            title='Details'
            collapsible={false}
            surface='card'
            className='space-y-2'
          >
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Design Lab stills come from arbitrary hosts outside next/image remotePatterns
              <img
                src={item.imageUrl}
                alt={`${item.title} still`}
                className='w-full rounded-md object-contain'
                loading='lazy'
              />
            ) : null}
            <p className='whitespace-pre-wrap text-xs leading-5 text-primary-token'>
              {item.body}
            </p>
          </DrawerSection>

          {item.comment ? (
            <DrawerSection
              title='Your Comment'
              collapsible={false}
              surface='card'
            >
              <p className='whitespace-pre-wrap text-xs leading-5 text-primary-token'>
                {item.comment}
              </p>
            </DrawerSection>
          ) : null}

          {item.evidence.length > 0 ? (
            <DrawerSection title='Evidence' collapsible={false} surface='card'>
              <ul className='space-y-1'>
                {item.evidence.map(url => (
                  <li key={url}>
                    <a
                      href={url}
                      target='_blank'
                      rel='noreferrer'
                      className='inline-flex max-w-full items-center gap-1.5 text-xs text-secondary-token hover:text-primary-token'
                    >
                      <ExternalLink
                        className='size-3 shrink-0'
                        aria-hidden='true'
                      />
                      <span className='truncate'>{evidenceLabel(url)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </DrawerSection>
          ) : null}
        </>
      ) : null}
    </EntitySidebarShell>
  );
}
