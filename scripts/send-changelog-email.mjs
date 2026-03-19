#!/usr/bin/env node

/**
 * Changelog Email Send Script
 *
 * Reads the latest release from CHANGELOG.md and sends a product update email
 * to all verified subscribers. Runs locally after a PR merges.
 *
 * Usage:
 *   pnpm changelog:send              # sends with 24h cooldown protection
 *   pnpm changelog:send --force      # bypasses cooldown (e.g., critical update)
 *
 * Spam protection:
 *   - 24-hour cooldown between product update emails (per subscriber)
 *   - Tracks last_product_update_at on each subscriber row
 *   - If ANY subscriber was emailed in the last 24h, the entire send is skipped
 *   - Use --force to override (e.g., for a major launch announcement)
 *
 * Requires: DATABASE_URL and RESEND_API_KEY in environment (via Doppler)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLatestRelease } from './lib/changelog-parser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md');

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1_000;
// Minimum hours between product update emails to the same subscriber list
const MIN_HOURS_BETWEEN_SENDS = 24;
const FORCE = process.argv.includes('--force');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function entriesToHtml(sections) {
  const sectionLabels = {
    added: 'New',
    changed: 'Improved',
    fixed: 'Fixed',
    removed: 'Removed',
  };

  let html = '';
  for (const [key, label] of Object.entries(sectionLabels)) {
    const entries = sections[key];
    if (!entries || entries.length === 0) continue;
    html += `<p style="margin: 12px 0 4px; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #999;">${label}</p>`;
    html += '<ul style="margin: 0; padding: 0 0 0 20px;">';
    for (const entry of entries) {
      html += `<li style="margin: 4px 0; font-size: 14px; line-height: 1.5;">${escapeHtml(entry)}</li>`;
    }
    html += '</ul>';
  }
  return html;
}

function entriesToText(sections) {
  const sectionLabels = {
    added: 'New',
    changed: 'Improved',
    fixed: 'Fixed',
    removed: 'Removed',
  };

  let text = '';
  for (const [key, label] of Object.entries(sectionLabels)) {
    const entries = sections[key];
    if (!entries || entries.length === 0) continue;
    text += `\n${label}:\n`;
    for (const entry of entries) {
      text += `  - ${entry}\n`;
    }
  }
  return text.trim();
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  const changelog = readFileSync(CHANGELOG_PATH, 'utf-8');
  const latest = getLatestRelease(changelog);

  if (!latest) {
    console.log('⚠️  No releases found in CHANGELOG.md. Nothing to send.');
    process.exit(0);
  }

  console.log(
    `📧 Preparing to send product update for v${latest.version} (${latest.date})\n`
  );

  const entriesHtml = entriesToHtml(latest.sections);
  const entriesText = entriesToText(latest.sections);

  if (!entriesText) {
    console.log('⚠️  Latest release has no entries. Nothing to send.');
    process.exit(0);
  }

  // Dynamic import to avoid loading DB/email modules at parse time
  const resendApiKey = process.env.RESEND_API_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  if (!resendApiKey) {
    console.error('❌ RESEND_API_KEY not set. Cannot send emails.');
    process.exit(1);
  }

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set. Cannot query subscribers.');
    process.exit(1);
  }

  // Use Resend directly since we're in a standalone script
  const { Resend } = await import('resend');
  const resend = new Resend(resendApiKey);

  // Query subscribers directly via pg
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // ── Cooldown check ──────────────────────────────────────────────
    // Prevent spamming subscribers when shipping multiple releases per day.
    // Uses a simple "last sent" timestamp on each subscriber row.
    // Override with --force flag.
    if (!FORCE) {
      const { rows: recentSend } = await client.query(
        `SELECT COUNT(*) AS cnt FROM product_update_subscribers
         WHERE last_product_update_at > NOW() - INTERVAL '${MIN_HOURS_BETWEEN_SENDS} hours'
           AND verified = true AND unsubscribed_at IS NULL`
      );
      const recentCount = Number.parseInt(recentSend[0]?.cnt ?? '0', 10);
      if (recentCount > 0) {
        console.log(
          `⏳ ${recentCount} subscriber(s) received a product update in the last ${MIN_HOURS_BETWEEN_SENDS}h.`
        );
        console.log('   Skipping to avoid spam. Use --force to override.');
        process.exit(0);
      }
    }

    // Get verified non-user subscribers who haven't been emailed recently
    const { rows: subscribers } = await client.query(
      `SELECT email, unsubscribe_token FROM product_update_subscribers
       WHERE verified = true AND unsubscribed_at IS NULL`
    );

    console.log(`📬 Found ${subscribers.length} subscriber(s)\n`);

    if (subscribers.length === 0) {
      console.log('No subscribers to email. Done.');
      process.exit(0);
    }

    const fromEmail =
      process.env.RESEND_FROM_EMAIL || 'notifications@send.jov.ie';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://jov.ie';
    let sent = 0;
    let errors = 0;

    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);

      const promises = batch.map(async sub => {
        const unsubscribeUrl = `${appUrl}/api/changelog/unsubscribe?token=${sub.unsubscribe_token}`;

        try {
          await resend.emails.send({
            from: fromEmail,
            to: sub.email,
            subject: `What's new at Jovie — v${latest.version}`,
            html: buildEmailHtml(
              latest.version,
              latest.date,
              entriesHtml,
              unsubscribeUrl,
              appUrl
            ),
            text: buildEmailText(
              latest.version,
              latest.date,
              entriesText,
              unsubscribeUrl,
              appUrl
            ),
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });
          sent++;
        } catch (err) {
          errors++;
          console.error(
            `  ❌ Failed to send to ${sub.email.split('@')[0]}@...: ${err.message}`
          );
        }
      });

      await Promise.all(promises);

      if (i + BATCH_SIZE < subscribers.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // Update last_product_update_at for all subscribers we sent to
    if (sent > 0) {
      await client.query(
        `UPDATE product_update_subscribers
         SET last_product_update_at = NOW(), updated_at = NOW()
         WHERE verified = true AND unsubscribed_at IS NULL`
      );
    }

    console.log(`\n✅ Sent ${sent} email(s), ${errors} error(s).`);
  } finally {
    await client.end();
  }
}

function buildEmailHtml(version, date, entriesHtml, unsubscribeUrl, appUrl) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:40px 20px;">
      <table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
        <tr><td style="padding:32px 32px 16px;"><span style="font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1px;">JOVIE PRODUCT UPDATE</span></td></tr>
        <tr><td style="padding:0 32px 8px;"><h1 style="margin:0;font-size:22px;font-weight:600;color:#000;">What's new — v${escapeHtml(version)}</h1><p style="margin:4px 0 0;font-size:13px;color:#999;">${escapeHtml(date)}</p></td></tr>
        <tr><td style="padding:16px 32px 24px;font-size:15px;line-height:1.6;color:#333;">${entriesHtml}</td></tr>
        <tr><td style="padding:0 32px 32px;text-align:center;"><a href="${escapeHtml(appUrl)}/changelog" style="display:inline-block;padding:12px 32px;background:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;font-size:14px;">View full changelog</a></td></tr>
        <tr><td style="padding:24px 32px;background:#f9f9f9;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#999;text-align:center;">You're receiving this because you subscribed to Jovie product updates.</p><p style="margin:8px 0 0;font-size:12px;color:#999;text-align:center;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#999;text-decoration:underline;">Unsubscribe</a></p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailText(version, date, entriesText, unsubscribeUrl, appUrl) {
  return `What's new at Jovie — v${version} (${date})

${entriesText}

View full changelog: ${appUrl}/changelog

---
Unsubscribe: ${unsubscribeUrl}`;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
