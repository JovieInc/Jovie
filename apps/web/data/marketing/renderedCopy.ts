import { lintCopy } from '@jovie/copy';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  createMarketingCopyReviewDigest,
  MARKETING_COPY_SPEC_VERSION,
  type MarketingCopyAuditIssue,
  type MarketingCopyLineRole,
  type MarketingCopyPageBrief,
  type MarketingCopyPageDraft,
  type MarketingCopySectionDraft,
} from './copy';

/**
 * Rendered-copy verification. A registry pass certifies a draft, not a route;
 * this audit proves the words a visitor or user actually sees are the words
 * that were reviewed. Any changed claim, evidence revision, source version,
 * or rendered output invalidates the prior certification.
 */

export const RENDERED_COPY_REGISTERS = [
  'jovie-marketing',
  'jovie-product-ui',
] as const;
export type RenderedCopyRegister = (typeof RENDERED_COPY_REGISTERS)[number];

export interface RenderedCopyLine {
  readonly sectionId: string;
  readonly lineId: string;
  readonly role: MarketingCopyLineRole;
  readonly text: string;
}

/** One rendered surface: a marketing route or a product UI state. */
export interface RenderedCopySurface {
  readonly route: string;
  /** Set for product UI states, e.g. an error or onboarding state id. */
  readonly stateId?: string;
  /** Source version the render was captured from (commit sha or build id). */
  readonly sourceVersion: string;
  readonly register: RenderedCopyRegister;
  readonly lines: readonly RenderedCopyLine[];
}

/** Founder Taste Inbox (or equivalent owner) approval for an intentional drift. */
export interface RenderedCopyException {
  readonly sectionId: string;
  readonly lineId: string;
  /** Taste decision id or named reviewer. Empty means unapproved. */
  readonly approvedBy: string;
  readonly reason: string;
}

export interface RenderedCopyCertification {
  readonly route: string;
  readonly stateId?: string;
  readonly sourceVersion: string;
  /** Digest of the brief + draft at review time. */
  readonly reviewDigest: string;
  /** Digest of the exact rendered lines at review time. */
  readonly renderedDigest: string;
  readonly certifiedAt: string;
  readonly exceptions?: readonly RenderedCopyException[];
}

interface DraftLine {
  readonly sectionId: string;
  readonly lineId: string;
  readonly text: string;
}

function normalizeRenderedText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[’']/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

function draftLines(section: MarketingCopySectionDraft): DraftLine[] {
  const lines: DraftLine[] = [
    {
      sectionId: section.sectionId,
      lineId: 'headline',
      text: section.headline,
    },
  ];
  if (section.body !== undefined) {
    lines.push({
      sectionId: section.sectionId,
      lineId: 'body',
      text: section.body,
    });
  }
  for (const [index, text] of (section.supportingText ?? []).entries()) {
    lines.push({
      sectionId: section.sectionId,
      lineId: `supporting:${index}`,
      text,
    });
  }
  return lines;
}

/** Integrity fingerprint for the exact rendered words under review. */
export function createRenderedCopyDigest(surface: RenderedCopySurface): string {
  const canonical = JSON.stringify({
    schemaVersion: MARKETING_COPY_SPEC_VERSION,
    route: surface.route,
    stateId: surface.stateId ?? null,
    register: surface.register,
    lines: surface.lines.map(line => ({
      sectionId: line.sectionId,
      lineId: line.lineId,
      role: line.role,
      text: normalizeRenderedText(line.text),
    })),
  });
  return `rendered-copy/${MARKETING_COPY_SPEC_VERSION}/sha256/${bytesToHex(
    sha256(new TextEncoder().encode(canonical))
  )}`;
}

function issue(code: string, message: string): MarketingCopyAuditIssue {
  return { code, message };
}

/**
 * Verify a rendered surface against its certified draft. Fails when rendered
 * words drift from certified words, when either digest is stale, when rendered
 * text violates a blocking copy rule, when a UI state lacks a concrete
 * recovery action, or when an exception was never approved.
 */
export function auditRenderedCopy(
  brief: MarketingCopyPageBrief,
  draft: MarketingCopyPageDraft,
  surface: RenderedCopySurface,
  certification: RenderedCopyCertification
): readonly MarketingCopyAuditIssue[] {
  const issues: MarketingCopyAuditIssue[] = [];

  if (surface.route !== draft.route || surface.route !== certification.route) {
    issues.push(
      issue(
        'rendered-route-mismatch',
        `Rendered route ${surface.route} is not the certified route ${certification.route}.`
      )
    );
  }
  if ((surface.stateId ?? null) !== (certification.stateId ?? null)) {
    issues.push(
      issue(
        'rendered-state-mismatch',
        `Rendered state ${surface.stateId ?? '(none)'} is not the certified state ${certification.stateId ?? '(none)'}.`
      )
    );
  }
  if (!surface.sourceVersion.trim()) {
    issues.push(
      issue(
        'missing-source-version',
        'Rendered capture needs a source version.'
      )
    );
  } else if (surface.sourceVersion !== certification.sourceVersion) {
    issues.push(
      issue(
        'stale-source-version',
        `Rendered source ${surface.sourceVersion} differs from certified ${certification.sourceVersion}; certification is stale.`
      )
    );
  }
  if (
    certification.reviewDigest !== createMarketingCopyReviewDigest(brief, draft)
  ) {
    issues.push(
      issue(
        'stale-review-digest',
        'The brief, claims, or certified draft changed since review; prior certification is invalid.'
      )
    );
  }
  if (certification.renderedDigest !== createRenderedCopyDigest(surface)) {
    issues.push(
      issue(
        'stale-rendered-digest',
        'Rendered text changed since certification; prior certification is invalid.'
      )
    );
  }

  const draftBySection = new Map(
    draft.sections.map(section => [section.sectionId, section])
  );
  const exceptions = new Set(
    (certification.exceptions ?? [])
      .filter(exception => exception.approvedBy.trim())
      .map(exception => `${exception.sectionId}:${exception.lineId}`)
  );
  for (const exception of certification.exceptions ?? []) {
    if (!exception.approvedBy.trim()) {
      issues.push(
        issue(
          'unapproved-exception',
          `Exception for ${exception.sectionId}:${exception.lineId} has no approving reviewer or taste decision.`
        )
      );
    }
  }

  const renderedKeys = new Set<string>();
  for (const line of surface.lines) {
    const key = `${line.sectionId}:${line.lineId}`;
    renderedKeys.add(key);
    const section = draftBySection.get(line.sectionId);
    const expected = section
      ? draftLines(section).find(draftLine => draftLine.lineId === line.lineId)
      : undefined;

    if (!expected) {
      issues.push(
        issue(
          'unbound-rendered-line',
          `Rendered line ${key} has no certified draft counterpart; new copy cannot ship unreviewed.`
        )
      );
    } else {
      const binding = section?.lineBindings?.find(
        candidate => candidate.lineId === line.lineId
      );
      if (binding && binding.role !== line.role) {
        issues.push(
          issue(
            'line-role-mismatch',
            `Line ${key} is rendered as ${line.role} but bound as ${binding.role}.`
          )
        );
      }
      if (
        normalizeRenderedText(line.text) !==
          normalizeRenderedText(expected.text) &&
        !exceptions.has(key)
      ) {
        issues.push(
          issue(
            'rendered-text-mismatch',
            `Rendered ${key} says "${line.text}" but the certified draft says "${expected.text}".`
          )
        );
      }
    }

    for (const finding of lintCopy(line.text, {
      register: surface.register,
      headline: line.role === 'headline',
    }).blocking) {
      issues.push(
        issue(
          'rendered-copy-rule',
          `Rendered ${key} violates ${finding.rule}: ${finding.message} Found in: "${line.text}".`
        )
      );
    }
  }

  for (const section of draft.sections) {
    for (const draftLine of draftLines(section)) {
      if (!renderedKeys.has(`${draftLine.sectionId}:${draftLine.lineId}`)) {
        issues.push(
          issue(
            'unrendered-bound-line',
            `Certified line ${draftLine.sectionId}:${draftLine.lineId} is not rendered; the certified promise never reaches the reader.`
          )
        );
      }
    }
  }

  if (surface.register === 'jovie-product-ui' && surface.stateId) {
    const boundLines = new Set(
      draft.sections.flatMap(section =>
        (section.lineBindings ?? [])
          .filter(binding => binding.actionId)
          .map(binding => `${section.sectionId}:${binding.lineId}`)
      )
    );
    if (
      !surface.lines.some(line =>
        boundLines.has(`${line.sectionId}:${line.lineId}`)
      )
    ) {
      issues.push(
        issue(
          'missing-recovery-action',
          `UI state ${surface.stateId} renders no line bound to a recovery action.`
        )
      );
    }
  }

  return issues;
}
