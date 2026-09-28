/**
 * JOV-6708 Jev copy/factuality eval for Summer ops cards in founder chat.
 *
 * The card renderer (apps/web/lib/ovie/ops-card.ts) emits a
 * `summer.ops-card.v1` payload plus a derived flat-text form. This module
 * packages that rendered text and its source payload into a bounded Jev
 * `copy` request — the rubric checks that every claim is supported by the
 * supplied proof — and provides a deterministic factuality check that every
 * displayed fact/series value traces to the source payload verbatim.
 *
 * Default path is deterministic and makes no evaluator call; gateway
 * transport is opt-in via runPreparedJevEvaluation with an approval.
 */

import { createHash } from 'node:crypto';
import { JEV_ROUTE, prepareJevRequest } from '../invariants/jev-gateway.mjs';

export const OPS_CARD_EVAL_SCHEMA = 'jev-summer-ops-card/v1';
export const OPS_CARD_STAGE = 'copy';

const sha256 = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Build the bounded evaluation state: rendered card text first (the copy
 * under review), then the machine-readable source payload as evidence.
 */
export function buildOpsCardEvalState(card, renderedText) {
  if (typeof renderedText !== 'string' || !renderedText.trim()) {
    throw new Error('rendered card text required');
  }
  return [
    '<<<rendered-card-text',
    renderedText,
    'rendered-card-text>>>',
    '<<<ops-card-source',
    JSON.stringify(card),
    'ops-card-source>>>',
  ].join('\n');
}

/**
 * Prepare a bounded Jev `copy`-stage request for a rendered ops card.
 * `cardId` scopes the fingerprint to a single emitted card.
 */
export function prepareOpsCardCopyRequest({ card, renderedText, cardId }) {
  const scope = `ops-card:${typeof cardId === 'string' && cardId.trim() ? cardId : 'unscoped'}`;
  return prepareJevRequest({
    sourceSha: '0'.repeat(40),
    artifactSha256: sha256(card),
    scope,
    stage: OPS_CARD_STAGE,
    modality: 'text',
    state: buildOpsCardEvalState(card, renderedText),
  });
}

/**
 * Deterministic factuality check: returns discrepancies between the card
 * payload and the rendered text. Every fact value and every series point
 * must appear verbatim, and no number may appear in the rendered text that
 * is absent from the payload (zero invented data).
 */
export function opsCardCopyDiscrepancies(card, renderedText) {
  const discrepancies = [];
  if (!card || typeof card !== 'object') return ['card payload missing'];
  const text = typeof renderedText === 'string' ? renderedText : '';

  const factValues = new Set();
  for (const fact of card.facts ?? []) {
    factValues.add(String(fact.value));
    if (!text.includes(`${fact.label}: ${fact.value}`)) {
      discrepancies.push(`missing fact line "${fact.label}: ${fact.value}"`);
    }
  }

  const seriesValues = new Set();
  for (const point of card.series?.points ?? []) {
    seriesValues.add(String(point.value));
    if (
      !text.includes(`${point.label} ${point.value}`) &&
      !text.includes(`${point.label}: ${point.value}`)
    ) {
      discrepancies.push(
        `missing series point "${point.label} ${point.value}"`
      );
    }
  }

  const allowed = new Set([...factValues, ...seriesValues]);
  // ISO timestamps (observedAt) legitimately carry digits not in the payload's
  // fact/series values; strip them before scanning for invented numbers.
  const scrubbed = text.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
    ' '
  );
  const numbers = scrubbed.match(/\d+(?:\.\d+)?/g) ?? [];
  for (const token of numbers) {
    if (!allowed.has(token)) {
      discrepancies.push(`rendered number "${token}" not in card payload`);
    }
  }

  return discrepancies;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const payloadPath = process.argv[2];
  const { readFileSync } = await import('node:fs');
  const input = JSON.parse(readFileSync(payloadPath, 'utf8'));
  const request = prepareOpsCardCopyRequest(input);
  const report = {
    schema: OPS_CARD_EVAL_SCHEMA,
    issue: 'JOV-6708',
    route: JEV_ROUTE,
    stage: OPS_CARD_STAGE,
    requestFingerprint: request.fingerprint,
    discrepancies: opsCardCopyDiscrepancies(input.card, input.renderedText),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
