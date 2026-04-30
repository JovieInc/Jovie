/**
 * Admin batch import for events.
 *
 * Reads a CSV from a path argument and inserts rows via the shared
 * insertEvent helper. Rows land with `provider='admin_import'` and
 * `confirmationStatus='pending'` (per insertEvent's provider-derived
 * rule), so they show up in the creator's review queue and require
 * confirm before they reach fans or the public ICS feed.
 *
 * Usage (run from apps/web/):
 *   doppler run -- pnpm tsx scripts/admin/import-events.ts \
 *     --profile-id=PROFILE_ID --csv=path/to/events.csv
 *
 * CSV columns (header row required):
 *   external_id,event_type,start_date,start_time,timezone,
 *   venue_name,city,region,country,ticket_url,ticket_status,title
 *
 * - external_id is required and unique within the profile (used by the
 *   conflict-update guard so re-running the import is idempotent).
 * - event_type defaults to 'tour' if blank.
 * - start_date is ISO 8601.
 * - All other columns are optional; leave blank for null.
 *
 * The script does NOT do any HTTP auth — it talks directly to the DB
 * using the application's DATABASE_URL via Doppler. Run from a developer
 * machine with admin Doppler creds.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tourDates } from '@/lib/db/schema/tour';
import {
  bulkInsertSyncedEvents,
  type InsertEventInput,
} from '@/lib/events/insert';
import {
  assertValidTicketUrl,
  normalizeTicketUrl,
} from '@/lib/events/ticket-url';

interface CliArgs {
  profileId: string;
  csvPath: string;
}

function parseArgs(argv: ReadonlyArray<string>): CliArgs {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2];
  }
  if (!args['profile-id']) {
    throw new Error('Missing --profile-id=<uuid>');
  }
  if (!args.csv) {
    throw new Error('Missing --csv=<path>');
  }
  return { profileId: args['profile-id'], csvPath: args.csv };
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (const [i, key] of header.entries()) {
      row[key] = cells[i]?.trim() ?? '';
    }
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV splitter: handles double-quoted cells with embedded commas.
  // Not a full RFC 4180 implementation; sufficient for admin-curated input.
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function nullable(v: string): string | null {
  return v === '' ? null : v;
}

const VALID_EVENT_TYPES = new Set([
  'tour',
  'livestream',
  'listening_party',
  'ama',
  'signing',
]);

const VALID_TICKET_STATUSES = new Set(['available', 'sold_out', 'cancelled']);

function parseTicketStatus(
  value: string,
  rowNumber: number
): InsertEventInput['ticketStatus'] {
  const ticketStatus = nullable(value);
  if (ticketStatus === null) return 'available';
  if (!VALID_TICKET_STATUSES.has(ticketStatus)) {
    throw new Error(
      `Row ${rowNumber}: invalid ticket_status "${ticketStatus}". ` +
        `Allowed: ${[...VALID_TICKET_STATUSES].join(', ')}.`
    );
  }
  return ticketStatus as InsertEventInput['ticketStatus'];
}

function parseTicketUrl(value: string, rowNumber: number): string | null {
  if (!value.trim()) return null;
  try {
    assertValidTicketUrl(value);
  } catch {
    throw new Error(`Row ${rowNumber}: invalid ticket_url "${value}".`);
  }
  return normalizeTicketUrl(value);
}

async function main() {
  const { profileId, csvPath } = parseArgs(process.argv.slice(2));
  const absolute = resolve(process.cwd(), csvPath);
  const text = await readFile(absolute, 'utf8');
  const rows = parseCsv(text);
  if (rows.length === 0) {
    console.log('No rows found in CSV.');
    return;
  }

  const inputs: InsertEventInput[] = rows.map((r, idx) => {
    const rowNumber = idx + 2;
    const eventType = r.event_type || 'tour';
    const externalId = r.external_id?.trim();
    if (!VALID_EVENT_TYPES.has(eventType)) {
      throw new Error(
        `Row ${rowNumber}: invalid event_type "${eventType}". ` +
          `Allowed: ${[...VALID_EVENT_TYPES].join(', ')}.`
      );
    }
    if (!externalId) {
      throw new Error(`Row ${rowNumber}: external_id is required`);
    }
    if (!r.start_date) {
      throw new Error(`Row ${rowNumber}: start_date is required`);
    }
    const startDate = new Date(r.start_date);
    if (Number.isNaN(startDate.getTime())) {
      throw new Error(`Row ${rowNumber}: invalid start_date "${r.start_date}"`);
    }
    return {
      profileId,
      provider: 'admin_import',
      eventType: eventType as InsertEventInput['eventType'],
      externalId,
      title: nullable(r.title),
      startDate,
      startTime: nullable(r.start_time),
      timezone: nullable(r.timezone),
      venueName: r.venue_name,
      city: r.city,
      region: nullable(r.region),
      country: r.country,
      ticketUrl: parseTicketUrl(r.ticket_url, rowNumber),
      ticketStatus: parseTicketStatus(r.ticket_status, rowNumber),
    };
  });

  const inserted = await bulkInsertSyncedEvents(inputs);
  // Sanity ping so the operator sees the conflict-update guard in action
  // if they re-run the script with the same external_ids.
  const [{ count: importedCount }] = await db
    .select({ count: count() })
    .from(tourDates)
    .where(
      and(
        eq(tourDates.profileId, profileId),
        eq(tourDates.provider, 'admin_import')
      )
    );
  console.log(
    `Imported ${inserted} rows. Profile ${profileId} now has ${importedCount} admin_import events. All new rows are pending review on /app/calendar.`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
