import { THEME } from '@/lib/share/image-utils';
import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  proofBriefProvenance,
} from './contract';

/**
 * Proof Brief share card (JOV-7217). Hierarchy follows the approved Pen
 * frames from the sibling design issue: eyebrow + window strip, single hero
 * value/claim, up to three supporting proof cells, subtle Jovie wordmark.
 * 1200×630 — shareable in Messages and email, and valid as a social export.
 */
export const PROOF_BRIEF_CARD_SIZE = { width: 1200, height: 630 } as const;

export const PROOF_BRIEF_TEXT_LIMITS = {
  heroValue: 16,
  heroLabel: 64,
  heroSentence: 90,
  pointValue: 16,
  pointLabel: 80,
  window: 40,
} as const;

export function clampProofBriefText(input: string, max: number): string {
  return input.length > max ? `${input.slice(0, max - 1).trimEnd()}…` : input;
}

export function ProofBriefCard({
  brief,
  now,
}: {
  readonly brief: CertifiedProofBrief;
  readonly now?: Date;
}) {
  assertProofBriefRenderable(brief, { now, requirePublic: true });

  const heroValue =
    brief.hero.value != null
      ? clampProofBriefText(brief.hero.value, PROOF_BRIEF_TEXT_LIMITS.heroValue)
      : null;
  const heroLabel =
    brief.hero.label != null
      ? clampProofBriefText(brief.hero.label, PROOF_BRIEF_TEXT_LIMITS.heroLabel)
      : null;
  const heroSentence = clampProofBriefText(
    brief.hero.sentence,
    PROOF_BRIEF_TEXT_LIMITS.heroSentence
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: THEME.bg,
        color: THEME.text,
        fontFamily: 'Satoshi, sans-serif',
        padding: '48px 64px',
      }}
    >
      {/* Eyebrow + window strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: THEME.textMuted,
        }}
      >
        <div style={{ display: 'flex' }}>Your week with Jovie</div>
        <div style={{ display: 'flex' }}>
          {clampProofBriefText(
            brief.window.label,
            PROOF_BRIEF_TEXT_LIMITS.window
          )}
        </div>
      </div>

      {/* Hero */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: 12,
        }}
      >
        {heroValue != null ? (
          <div
            style={{
              display: 'flex',
              fontSize: 156,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '-0.03em',
              color: THEME.text,
            }}
          >
            {heroValue}
          </div>
        ) : null}
        {heroLabel != null ? (
          <div
            style={{
              display: 'flex',
              fontSize: 32,
              fontWeight: 600,
              color: THEME.text,
              letterSpacing: '-0.01em',
            }}
          >
            {heroLabel}
          </div>
        ) : null}
        {heroValue == null ? (
          <div
            style={{
              display: 'flex',
              fontSize: 44,
              fontWeight: 650,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              color: THEME.text,
              textAlign: 'center',
            }}
          >
            {heroSentence}
          </div>
        ) : null}
      </div>

      {/* Supporting proof cells */}
      {brief.supportingPoints.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexShrink: 0,
            borderTop: `1px solid ${THEME.border}`,
            paddingTop: 28,
            marginBottom: 28,
          }}
        >
          {brief.supportingPoints.map((point, i) => (
            <div
              key={point.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                gap: 4,
                borderLeft: i === 0 ? 'none' : `1px solid ${THEME.border}`,
              }}
            >
              {point.value != null ? (
                <div
                  style={{
                    display: 'flex',
                    fontSize: 40,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: THEME.text,
                  }}
                >
                  {clampProofBriefText(
                    point.value,
                    PROOF_BRIEF_TEXT_LIMITS.pointValue
                  )}
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  fontSize: 22,
                  lineHeight: 1.2,
                  color: THEME.textMuted,
                  letterSpacing: '-0.01em',
                  textAlign: 'center',
                  padding: '0 24px',
                }}
              >
                {clampProofBriefText(
                  point.label,
                  PROOF_BRIEF_TEXT_LIMITS.pointLabel
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {brief.unknowns.length > 0 ? (
        <div
          style={{
            display: 'flex',
            fontSize: 16,
            color: THEME.textMuted,
            marginBottom: 16,
            flexShrink: 0,
          }}
        >
          Unmeasured outcomes remain unknown, not zero.
        </div>
      ) : null}

      {/* Footer: provenance + subtle wordmark */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          fontSize: 18,
          color: THEME.textMuted,
          letterSpacing: '-0.01em',
        }}
      >
        <div style={{ display: 'flex' }}>{proofBriefProvenance(brief)}</div>
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.3)',
          }}
        >
          Jovie
        </div>
      </div>
    </div>
  );
}
