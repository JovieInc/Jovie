import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LEGAL_ENTITY_NAME } from '@/constants/app';
import {
  CHAT_RETENTION_DAYS,
  DEFAULT_RETENTION_DAYS,
} from '@/lib/analytics/retention-windows';
import { applyMarkdownTemplate } from '@/lib/docs/getMarkdownDocument';

const privacyPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../content/legal/privacy.md'
);

describe('applyMarkdownTemplate', () => {
  it('fills the legal entity and retention windows from their owners', () => {
    expect(applyMarkdownTemplate('{{ LEGAL_ENTITY_NAME }}')).toBe(
      LEGAL_ENTITY_NAME
    );
    expect(applyMarkdownTemplate('kept {{DEFAULT_RETENTION_DAYS}} days')).toBe(
      `kept ${DEFAULT_RETENTION_DAYS} days`
    );
    expect(applyMarkdownTemplate('{{ CHAT_RETENTION_DAYS }} days')).toBe(
      `${CHAT_RETENTION_DAYS} days`
    );
    expect(applyMarkdownTemplate('{{NOT_A_WINDOW}}')).toBe('{{NOT_A_WINDOW}}');
  });

  it('renders the session-recording window from the owner without copying it', () => {
    const raw = readFileSync(privacyPath, 'utf8');

    expect(raw).toContain('deleted after {{DEFAULT_RETENTION_DAYS}} days');
    expect(raw).not.toContain('deleted after 90 days');
    expect(raw).toContain('Aggregated and anonymized after 90 days');
    expect(raw).toContain('purged within 90 days');
    expect(applyMarkdownTemplate(raw)).toContain(
      `deleted after ${DEFAULT_RETENTION_DAYS} days`
    );
  });
});
