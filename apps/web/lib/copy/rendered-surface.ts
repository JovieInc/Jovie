// Rendered-copy surface verification (JOV-6478): certifies what a route or
// UI state renders against the meaning-first registry — changed words,
// unsupported literals, and missing recovery actions fail; terse labels
// survive via reasoned exceptions. Consumes offer-truth, the recovery
// contract, and @jovie/copy rather than owning copy.

import { type CopyRegister, lintCopy } from '@jovie/copy';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  MARKETING_COPY_LINE_ROLES,
  type MarketingCopyAuditIssue,
  type MarketingCopyPageDraft,
} from '@/data/marketing/copy';

export const RENDERED_COPY_SPEC_VERSION = '1.0.0';

export const RENDERED_COPY_LINE_ROLES = [
  ...MARKETING_COPY_LINE_ROLES,
  'action',
  'label',
] as const;
export type RenderedCopyLineRole = (typeof RENDERED_COPY_LINE_ROLES)[number];

export interface RenderedCopyLine {
  readonly lineId: string;
  readonly role: RenderedCopyLineRole;
  readonly value: string;
}

export interface RenderedCopySurface {
  readonly route: string;
  readonly stateId: string;
  readonly sourceVersion: string;
  readonly lines: readonly RenderedCopyLine[];
}

export interface RenderedCopyCertifiedLine {
  readonly lineId: string;
  readonly role: RenderedCopyLineRole;
  readonly value: string;
  readonly claimIds?: readonly string[];
  readonly outcomeId?: string;
  readonly actionId?: string;
}

export interface RenderedCopyRequiredAction {
  readonly actionId: string;
  readonly labels: readonly string[];
}

export interface RenderedCopyException {
  readonly lineId: string;
  readonly reason: string;
}

export interface RenderedCopyExpectation {
  readonly route: string;
  readonly stateId: string;
  readonly sourceVersion: string;
  readonly register: CopyRegister;
  readonly lines: readonly RenderedCopyCertifiedLine[];
  readonly allowedLiterals?: readonly string[];
  readonly requiredActions?: readonly RenderedCopyRequiredAction[];
  readonly exceptions?: readonly RenderedCopyException[];
}

export interface RenderedCopyCertification {
  readonly schemaVersion: typeof RENDERED_COPY_SPEC_VERSION;
  readonly route: string;
  readonly stateId: string;
  readonly sourceVersion: string;
  readonly renderedDigest: string;
  readonly expectationDigest: string;
  readonly reviewDigest?: string;
  readonly certifiedAt: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[’']/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function issue(code: string, message: string): MarketingCopyAuditIssue {
  return { code, message };
}

/** Certified rendered lines for a draft, keeping each semantic binding. */
export function certifiedLinesFromDraft(
  draft: MarketingCopyPageDraft
): readonly RenderedCopyCertifiedLine[] {
  const lines: RenderedCopyCertifiedLine[] = [];
  for (const section of draft.sections) {
    const bindings = new Map(
      (section.lineBindings ?? []).map(binding => [binding.lineId, binding])
    );
    const visible: readonly {
      lineId: string;
      role: RenderedCopyLineRole;
      value: string;
    }[] = [
      { lineId: 'headline', role: 'headline', value: section.headline },
      ...(section.body !== undefined
        ? [{ lineId: 'body', role: 'body' as const, value: section.body }]
        : []),
      ...(section.supportingText ?? []).map((value, index) => ({
        lineId: `supporting:${index}`,
        role: 'supporting' as const,
        value,
      })),
    ];
    for (const line of visible) {
      const binding = bindings.get(line.lineId);
      lines.push({
        lineId: `${section.sectionId}/${line.lineId}`,
        role: line.role,
        value: line.value,
        claimIds: binding?.claimIds ?? section.claimIds,
        outcomeId: binding?.outcomeId,
        actionId: binding?.actionId,
      });
    }
  }
  return lines;
}

export function createRenderedCopyDigest(surface: RenderedCopySurface): string {
  const canonical = JSON.stringify({
    schemaVersion: RENDERED_COPY_SPEC_VERSION,
    route: surface.route,
    stateId: surface.stateId,
    sourceVersion: surface.sourceVersion,
    lines: surface.lines.map(line => ({
      lineId: line.lineId,
      role: line.role,
      value: normalize(line.value),
    })),
  });
  return `rendered-copy/${RENDERED_COPY_SPEC_VERSION}/sha256/${bytesToHex(
    sha256(new TextEncoder().encode(canonical))
  )}`;
}

export function createRenderedExpectationDigest(
  expectation: RenderedCopyExpectation
): string {
  const canonical = JSON.stringify({
    schemaVersion: RENDERED_COPY_SPEC_VERSION,
    route: expectation.route,
    stateId: expectation.stateId,
    sourceVersion: expectation.sourceVersion,
    register: expectation.register,
    lines: expectation.lines,
    allowedLiterals: expectation.allowedLiterals ?? [],
    requiredActions: expectation.requiredActions ?? [],
    exceptions: expectation.exceptions ?? [],
  });
  return `rendered-expectation/${RENDERED_COPY_SPEC_VERSION}/sha256/${bytesToHex(
    sha256(new TextEncoder().encode(canonical))
  )}`;
}

function numericLiterals(value: string): string[] {
  return (
    value.match(
      /\$\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\b\d+x\b|\b\d+\b/g
    ) ?? []
  ).map(literal => literal.replace(/\s+/g, ''));
}

/** Audit rendered text against certified lines, literals, and actions. */
export function auditRenderedCopySurface(
  surface: RenderedCopySurface,
  expectation: RenderedCopyExpectation
): readonly MarketingCopyAuditIssue[] {
  const issues: MarketingCopyAuditIssue[] = [];
  const label = `${expectation.route}#${expectation.stateId}`;

  if (
    surface.route !== expectation.route ||
    surface.stateId !== expectation.stateId
  ) {
    issues.push(
      issue(
        'surface-mismatch',
        `Rendered surface ${surface.route}#${surface.stateId} does not match certified surface ${label}.`
      )
    );
  }
  if (surface.sourceVersion !== expectation.sourceVersion) {
    issues.push(
      issue(
        'source-version-drift',
        `Rendered source ${surface.sourceVersion} differs from certified source ${expectation.sourceVersion}.`
      )
    );
  }

  const certifiedById = new Map(
    expectation.lines.map(line => [line.lineId, line])
  );
  for (const line of expectation.lines) {
    if (!RENDERED_COPY_LINE_ROLES.includes(line.role)) {
      issues.push(
        issue(
          'invalid-expectation',
          `Certified line ${line.lineId} has an unknown role ${line.role}.`
        )
      );
    }
  }
  if (certifiedById.size !== expectation.lines.length) {
    issues.push(
      issue(
        'invalid-expectation',
        `Expectation for ${label} repeats a certified lineId.`
      )
    );
  }
  const exceptionsById = new Map<string, RenderedCopyException>();
  for (const exception of expectation.exceptions ?? []) {
    if (!exception.lineId.trim() || !exception.reason.trim()) {
      issues.push(
        issue(
          'invalid-exception',
          'Approved rendered-copy exceptions need a lineId and a reason.'
        )
      );
    }
    if (certifiedById.has(exception.lineId)) {
      issues.push(
        issue(
          'invalid-exception',
          `Exception ${exception.lineId} shadows a certified line; exceptions only cover uncertified lines.`
        )
      );
    }
    exceptionsById.set(exception.lineId, exception);
  }

  const renderedById = new Map<string, RenderedCopyLine>();
  for (const line of surface.lines) {
    if (renderedById.has(line.lineId)) {
      issues.push(
        issue(
          'duplicate-rendered-line',
          `Rendered lineId ${line.lineId} appears more than once.`
        )
      );
    }
    renderedById.set(line.lineId, line);
    if (!line.value.trim()) {
      issues.push(
        issue('empty-rendered-line', `Rendered line ${line.lineId} is blank.`)
      );
    }
  }

  for (const certified of expectation.lines) {
    const rendered = renderedById.get(certified.lineId);
    if (!rendered) {
      issues.push(
        issue(
          'missing-rendered-line',
          `Certified line ${certified.lineId} is not rendered on ${label}.`
        )
      );
    } else if (normalize(rendered.value) !== normalize(certified.value)) {
      issues.push(
        issue(
          'changed-rendered-text',
          `Line ${certified.lineId} renders "${rendered.value}" but was certified as "${certified.value}".`
        )
      );
    }
  }

  const requiredActionLineIds = new Set(
    (expectation.requiredActions ?? []).map(
      action => `action:${action.actionId}`
    )
  );
  for (const line of surface.lines) {
    if (
      !certifiedById.has(line.lineId) &&
      !exceptionsById.has(line.lineId) &&
      !requiredActionLineIds.has(line.lineId)
    ) {
      issues.push(
        issue(
          'uncertified-rendered-line',
          `Rendered line ${line.lineId} ("${line.value}") is not certified and has no approved exception.`
        )
      );
    }
  }

  for (const action of expectation.requiredActions ?? []) {
    const rendered = renderedById.get(`action:${action.actionId}`);
    if (!rendered || rendered.role !== 'action') {
      issues.push(
        issue(
          'missing-recovery-action',
          `State ${label} must render recovery action ${action.actionId}.`
        )
      );
    } else if (
      !action.labels.some(
        approved => normalize(approved) === normalize(rendered.value)
      )
    ) {
      issues.push(
        issue(
          'changed-rendered-text',
          `Recovery action ${action.actionId} renders "${rendered.value}"; approved labels: ${action.labels.join(' | ')}.`
        )
      );
    }
  }

  // Mechanical claim check: rendered numbers/prices must exist in
  // certified copy or approved literals (e.g. offer-truth price labels).
  const corpus = new Set<string>();
  for (const source of [
    ...expectation.lines.map(line => line.value),
    ...(expectation.allowedLiterals ?? []),
    ...(expectation.requiredActions ?? []).flatMap(action => action.labels),
  ]) {
    for (const literal of numericLiterals(source)) corpus.add(literal);
  }
  for (const line of surface.lines) {
    for (const literal of numericLiterals(line.value)) {
      if (!corpus.has(literal)) {
        issues.push(
          issue(
            'unsupported-rendered-claim',
            `Rendered line ${line.lineId} asserts "${literal}", which no certified claim or approved literal supports.`
          )
        );
      }
    }
    // Voice rules apply to every rendered line, certified or not.
    for (const finding of lintCopy(line.value, {
      register: expectation.register,
      headline: line.role === 'headline',
    }).blocking) {
      issues.push(
        issue(
          finding.rule,
          `Rendered line ${line.lineId}: ${finding.message} Found in: "${line.value}".`
        )
      );
    }
  }

  return issues;
}

/** Certify a clean surface; the receipt binds route, state, and digests. */
export function certifyRenderedCopySurface(input: {
  readonly surface: RenderedCopySurface;
  readonly expectation: RenderedCopyExpectation;
  readonly certifiedAt: string;
  readonly reviewDigest?: string;
}): RenderedCopyCertification {
  const issues = auditRenderedCopySurface(input.surface, input.expectation);
  if (issues.length > 0) {
    throw new Error(
      `Rendered copy cannot be certified:\n${issues
        .map(entry => `- ${entry.code}: ${entry.message}`)
        .join('\n')}`
    );
  }
  return {
    schemaVersion: RENDERED_COPY_SPEC_VERSION,
    route: input.surface.route,
    stateId: input.surface.stateId,
    sourceVersion: input.surface.sourceVersion,
    renderedDigest: createRenderedCopyDigest(input.surface),
    expectationDigest: createRenderedExpectationDigest(input.expectation),
    ...(input.reviewDigest ? { reviewDigest: input.reviewDigest } : {}),
    certifiedAt: input.certifiedAt,
  };
}

export function auditRenderedCopyCertification(
  certification: RenderedCopyCertification,
  surface: RenderedCopySurface,
  expectation: RenderedCopyExpectation
): readonly MarketingCopyAuditIssue[] {
  const issues: MarketingCopyAuditIssue[] = [];
  if (certification.schemaVersion !== RENDERED_COPY_SPEC_VERSION) {
    issues.push(
      issue(
        'invalid-certification',
        `Unsupported rendered-copy certification schema ${String(certification.schemaVersion)}.`
      )
    );
  }
  if (
    certification.route !== surface.route ||
    certification.stateId !== surface.stateId
  ) {
    issues.push(
      issue(
        'surface-mismatch',
        `Certification covers ${certification.route}#${certification.stateId}, not ${surface.route}#${surface.stateId}.`
      )
    );
  }
  if (certification.sourceVersion !== surface.sourceVersion) {
    issues.push(
      issue(
        'source-version-drift',
        `Rendered source ${surface.sourceVersion} differs from certified source ${certification.sourceVersion}.`
      )
    );
  }
  if (certification.renderedDigest !== createRenderedCopyDigest(surface)) {
    issues.push(
      issue(
        'stale-rendered-digest',
        'Rendered text changed since certification; the prior receipt is void.'
      )
    );
  }
  if (
    certification.expectationDigest !==
    createRenderedExpectationDigest(expectation)
  ) {
    issues.push(
      issue(
        'stale-expectation-digest',
        'Certified claims, literals, or actions changed; re-review required.'
      )
    );
  }
  return issues;
}
