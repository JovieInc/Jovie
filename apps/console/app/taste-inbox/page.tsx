import type { Metadata } from 'next';
import { fetchTasteInbox, type TasteIssue } from '@/lib/linear';

export const metadata: Metadata = {
  title: 'Taste Inbox',
};

export const dynamic = 'force-dynamic';

const LABEL_STYLES: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  'needs:taste': { bg: '#9b4dff22', text: '#9b4dff', label: 'Taste call' },
  'needs:human': { bg: '#ffab2e22', text: '#ffab2e', label: 'Human action' },
};

const PRIORITY_COLORS: Record<number, string> = {
  1: '#ff4d5f',
  2: '#ffab2e',
  3: '#4d7dff',
  4: '#8d8d93',
  0: '#52535a',
};

function IssueCard({ issue }: { issue: TasteIssue }) {
  const style = LABEL_STYLES[issue.label] ?? LABEL_STYLES['needs:human'];
  const priorityColor = PRIORITY_COLORS[issue.priority] ?? PRIORITY_COLORS[0];

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: priorityColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {issue.identifier}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
            background: style.bg,
            color: style.text,
          }}
        >
          {style.label}
        </span>
      </div>

      <a
        href={issue.url}
        target='_blank'
        rel='noopener noreferrer'
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          lineHeight: 1.4,
        }}
      >
        {issue.title}
      </a>

      {issue.blockingReason && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {issue.blockingReason}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 4,
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {issue.priorityLabel}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {new Date(issue.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <a
          href={issue.url}
          target='_blank'
          rel='noopener noreferrer'
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: 'var(--accent-blue)',
          }}
        >
          Open in Linear →
        </a>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '32px 16px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 12,
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      No open {label} issues
    </div>
  );
}

export default async function TasteInboxPage() {
  const result = await fetchTasteInbox(process.env.LINEAR_API_KEY);

  const tasteIssues = result.issues.filter(i => i.label === 'needs:taste');
  const humanIssues = result.issues.filter(i => i.label === 'needs:human');

  return (
    <div style={{ maxWidth: 760 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <h1
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          Taste Inbox
        </h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {result.available
            ? `${result.issues.length} open · fetched ${new Date(result.fetchedAt).toLocaleTimeString()}`
            : (result.error ?? 'Unavailable')}
        </span>
      </div>

      {!result.available && (
        <div
          style={{
            padding: '12px 16px',
            background: '#ff4d5f11',
            border: '1px solid #ff4d5f44',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: '#ff4d5f',
            marginBottom: 24,
          }}
        >
          {result.error ?? 'Could not reach Linear. Set LINEAR_API_KEY.'}
        </div>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            marginBottom: 12,
          }}
        >
          Taste calls — {tasteIssues.length}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasteIssues.length === 0 ? (
            <EmptyState label='taste call' />
          ) : (
            tasteIssues.map(issue => <IssueCard key={issue.id} issue={issue} />)
          )}
        </div>
      </section>

      <section>
        <h2
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            marginBottom: 12,
          }}
        >
          Human actions — {humanIssues.length}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {humanIssues.length === 0 ? (
            <EmptyState label='human action' />
          ) : (
            humanIssues.map(issue => <IssueCard key={issue.id} issue={issue} />)
          )}
        </div>
      </section>
    </div>
  );
}
