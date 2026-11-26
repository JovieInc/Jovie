import { THEME } from '@/lib/share/image-utils';
import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  proofBriefBrand,
  proofBriefProvenance,
} from './contract';
import {
  clampProofBriefText,
  PROOF_BRIEF_TEXT_LIMITS,
  type ProofBriefImageFormat,
  proofBriefImageLayout,
} from './image-layout';

/**
 * Proof Brief share card (JOV-7217). Hierarchy follows the approved Pen
 * frames from the sibling design issue: eyebrow + window strip, single hero
 * value/claim, up to three supporting proof cells, subtle Jovie wordmark.
 * 1200×630 — shareable in Messages and email, and valid as a social export.
 */
export {
  clampProofBriefText,
  PROOF_BRIEF_CARD_SIZE,
  PROOF_BRIEF_TEXT_LIMITS,
} from './image-layout';

export function ProofBriefCard({
  brief,
  now,
  format = 'landscape',
}: {
  readonly brief: CertifiedProofBrief;
  readonly now?: Date;
  readonly format?: ProofBriefImageFormat;
}) {
  assertProofBriefRenderable(brief, { now, requirePublic: true });

  const tall = format !== 'landscape';
  const compact = format === 'square' && brief.supportingPoints.length === 3;
  const { heroSize, pointSizes } = proofBriefImageLayout(brief, format);
  const heroValue = brief.hero.value;
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
        padding: compact ? '32px 64px' : '48px 64px',
      }}
    >
      {/* Eyebrow + window strip */}
      <div
        style={{
          display: 'flex',
          alignItems: tall ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          flexDirection: tall ? 'column' : 'row',
          alignSelf: tall ? 'flex-start' : 'stretch',
          gap: tall ? 6 : 0,
          flexShrink: 0,
          fontSize: compact ? 34 : tall ? 36 : 22,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: THEME.textMuted,
        }}
      >
        <div style={{ display: 'flex' }}>{proofBriefBrand(brief).eyebrow}</div>
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
          gap: compact ? 4 : 12,
        }}
      >
        {heroValue != null ? (
          <div
            style={{
              display: 'flex',
              fontSize: heroSize,
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
              fontSize: compact ? 36 : tall ? 44 : 32,
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
              fontSize: compact ? 36 : 44,
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
            flexDirection: tall ? 'column' : 'row',
            gap: compact ? 6 : tall ? 18 : 0,
            flexShrink: 0,
            borderTop: `1px solid ${THEME.border}`,
            paddingTop: compact ? 12 : 28,
            marginBottom: compact ? 12 : 28,
          }}
        >
          {brief.supportingPoints.map((point, i) => (
            <div
              key={point.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: tall ? 'flex-start' : 'center',
                flex: tall ? 'none' : 1,
                gap: 4,
                borderLeft:
                  i === 0 || tall ? 'none' : `1px solid ${THEME.border}`,
              }}
            >
              {point.value != null ? (
                <div
                  style={{
                    display: 'flex',
                    fontSize: compact
                      ? Math.min(44, pointSizes[i])
                      : pointSizes[i],
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: THEME.text,
                  }}
                >
                  {point.value}
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  fontSize: compact ? 36 : tall ? 38 : 22,
                  lineHeight: 1.2,
                  color: THEME.textMuted,
                  letterSpacing: '-0.01em',
                  textAlign: tall ? 'left' : 'center',
                  padding: tall ? 0 : '0 24px',
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
            fontSize: tall ? 36 : 16,
            color: THEME.textMuted,
            marginBottom: compact ? 8 : 16,
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
          fontSize: compact ? 32 : tall ? 34 : 18,
          color: THEME.textMuted,
          letterSpacing: '-0.01em',
        }}
      >
        <div
          style={{
            display: 'flex',
            minWidth: 0,
            ...(tall && {
              flex: 1,
              wordBreak: 'break-all' as const,
              paddingRight: 16,
            }),
          }}
        >
          {proofBriefProvenance(brief)}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: tall ? 36 : 20,
            fontWeight: 600,
            color: tall ? THEME.textMuted : 'rgba(255, 255, 255, 0.3)',
          }}
        >
          {proofBriefBrand(brief).product}
        </div>
      </div>
    </div>
  );
}
