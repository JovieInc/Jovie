import {
  applyOvieDump,
  type OvieLane,
  type OvieReceipt,
} from '@/lib/ovie/ingest';
import type { OvieHandoff } from './types';

export function parseHandoff(input: unknown): OvieHandoff | string {
  if (!input || typeof input !== 'object') return 'handoff must be an object';
  const rec = input as Record<string, unknown>;
  const title = typeof rec.title === 'string' ? rec.title.trim() : '';
  const intent = typeof rec.intent === 'string' ? rec.intent.trim() : '';
  if (!title) return 'title is required';
  if (!intent) return 'intent is required';
  const priority = rec.priority;
  const lane =
    priority === 'flash' ||
    priority === 'heavy' ||
    priority === 'engineering' ||
    priority === 'personal' ||
    priority === 'taste'
      ? priority
      : undefined;
  return {
    title,
    intent,
    why: stringOpt(rec.why),
    desired_outcome: stringOpt(rec.desired_outcome),
    success_criteria: stringList(rec.success_criteria),
    constraints: stringList(rec.constraints),
    non_goals: stringList(rec.non_goals),
    priority: lane,
    scope: stringOpt(rec.scope),
    known_context: stringOpt(rec.known_context),
    open_questions: stringList(rec.open_questions),
    evidence_required: stringList(rec.evidence_required),
    provenance: stringOpt(rec.provenance),
  };
}

export function stringOpt(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function stringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === 'string'
  );
  return items.length ? items : undefined;
}

export function handoffDumpText(handoff: OvieHandoff): string {
  const parts = [
    handoff.title,
    handoff.intent,
    handoff.desired_outcome,
    handoff.why,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' — ');
}

export function classifyHandoff(handoff: OvieHandoff): {
  readonly receipts: readonly OvieReceipt[];
  readonly lane: OvieLane;
  readonly destination: OvieReceipt['destination'];
} {
  const receipts = applyOvieDump([handoffDumpText(handoff)]);
  const first = receipts[0];
  return {
    receipts,
    lane: handoff.priority ?? first.lane,
    destination: first.destination,
  };
}
