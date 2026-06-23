import type { TasteIssue } from './linear';

export interface DashboardIssueView extends TasteIssue {
  readonly screenshotPath?: string;
  readonly screenshotError?: string;
}

export interface DashboardRenderInput {
  readonly issues: readonly DashboardIssueView[];
  readonly fetchedAt: string;
  readonly available: boolean;
  readonly error?: string;
}

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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderIssueCard(issue: DashboardIssueView): string {
  const style = LABEL_STYLES[issue.label] ?? LABEL_STYLES['needs:human'];
  const priorityColor = PRIORITY_COLORS[issue.priority] ?? PRIORITY_COLORS[0];
  const screenshotBlock =
    issue.label === 'needs:taste'
      ? issue.screenshotPath
        ? `<img src="${escapeHtml(issue.screenshotPath)}" alt="Screenshot for ${escapeHtml(issue.identifier)}" style="width:100%;border-radius:8px;border:1px solid var(--border);margin-top:8px;" />`
        : `<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">${escapeHtml(issue.screenshotError ?? 'Screenshot pending — add `Capture: web <url>` or `Capture: ios <scenario>` to the issue description.')}</p>`
      : '';

  return `<article style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;display:flex;flex-direction:column;gap:8px;">
  <div style="display:flex;align-items:center;gap:8px;">
    <span style="width:8px;height:8px;border-radius:50%;background:${priorityColor};flex-shrink:0;"></span>
    <span style="font-size:11px;color:var(--text-muted);font-variant-numeric:tabular-nums;">${escapeHtml(issue.identifier)}</span>
    <span style="margin-left:auto;font-size:11px;padding:2px 6px;border-radius:4px;background:${style.bg};color:${style.text};">${escapeHtml(style.label)}</span>
  </div>
  <a href="${escapeHtml(issue.url)}" target="_blank" rel="noopener noreferrer" style="font-size:13px;font-weight:500;color:var(--text-primary);line-height:1.4;">${escapeHtml(issue.title)}</a>
  ${issue.blockingReason ? `<p style="font-size:12px;color:var(--text-secondary);line-height:1.5;">${escapeHtml(issue.blockingReason)}</p>` : ''}
  ${screenshotBlock}
  <div style="display:flex;align-items:center;gap:12px;margin-top:4px;">
    <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(issue.priorityLabel)}</span>
    <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(new Date(issue.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>
    <a href="${escapeHtml(issue.url)}" target="_blank" rel="noopener noreferrer" style="margin-left:auto;font-size:11px;color:var(--accent-blue);">Open in Linear →</a>
  </div>
</article>`;
}

function renderSection(
  title: string,
  issues: readonly DashboardIssueView[],
  emptyLabel: string
): string {
  const cards =
    issues.length === 0
      ? `<div style="padding:32px 16px;text-align:center;color:var(--text-muted);font-size:12px;border:1px dashed var(--border);border-radius:var(--radius-md);">No open ${escapeHtml(emptyLabel)} issues</div>`
      : issues.map(renderIssueCard).join('');

  return `<section style="margin-bottom:32px;">
  <h2 style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:12px;">${escapeHtml(title)} — ${issues.length}</h2>
  <div style="display:flex;flex-direction:column;gap:8px;">${cards}</div>
</section>`;
}

export function renderTasteInboxHtml(input: DashboardRenderInput): string {
  const tasteIssues = input.issues.filter(
    issue => issue.label === 'needs:taste'
  );
  const humanIssues = input.issues.filter(
    issue => issue.label === 'needs:human'
  );

  const statusLine = input.available
    ? `${input.issues.length} open · fetched ${new Date(input.fetchedAt).toLocaleString()}`
    : escapeHtml(input.error ?? 'Unavailable');

  const errorBanner = input.available
    ? ''
    : `<div style="padding:12px 16px;background:#ff4d5f11;border:1px solid #ff4d5f44;border-radius:var(--radius-md);font-size:12px;color:#ff4d5f;margin-bottom:24px;">${escapeHtml(input.error ?? 'Could not reach Linear. Set LINEAR_API_KEY.')}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Taste Inbox</title>
  <style>
    :root {
      --bg-page:#06070a;--bg-surface:#0a0b0e;--bg-card:#101216;--border:#1a1e26;
      --text-primary:#e8e9ec;--text-secondary:#8d8d93;--text-muted:#52535a;
      --accent-blue:#4d7dff;--radius-md:8px;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg-page);color:var(--text-primary);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1.5;padding:24px 20px}
    a{color:var(--accent-blue);text-decoration:none}
    a:hover{text-decoration:underline}
    .shell{max-width:760px;margin:0 auto}
    header{border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:24px}
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1 style="font-size:16px;font-weight:600;letter-spacing:-0.01em;">Taste Inbox</h1>
      <p style="font-size:12px;color:var(--text-muted);margin-top:6px;">${statusLine}</p>
    </header>
    ${errorBanner}
    ${renderSection('Taste calls', tasteIssues, 'taste call')}
    ${renderSection('Human actions', humanIssues, 'human action')}
  </div>
</body>
</html>`;
}
