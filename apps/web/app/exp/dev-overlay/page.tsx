'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Carbon palette — matches the Carbon preset in shell-v1 so the page bg is
// identical to the rest of /exp/*.
// ---------------------------------------------------------------------------
const CARBON = {
  page: '#06070a',
  surface0: '#0a0b0e',
  surface1: '#101216',
  surface2: '#161a20',
  border: '#1a1d23',
};

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';

// ---------------------------------------------------------------------------
// Accent swatches — raw Tailwind color values (playground only, not locked
// design-system tokens).
// ---------------------------------------------------------------------------
type AccentSwatch = {
  label: string;
  token: string;
  hex: string;
  textHex: string;
};

const SWATCHES: AccentSwatch[] = [
  { label: 'Cyan 300', token: 'cyan-300', hex: '#67e8f9', textHex: '#0a0b0e' },
  { label: 'White', token: 'white', hex: '#ffffff', textHex: '#0a0b0e' },
  {
    label: 'Amber 300',
    token: 'amber-300',
    hex: '#fcd34d',
    textHex: '#0a0b0e',
  },
  { label: 'Rose 300', token: 'rose-300', hex: '#fda4af', textHex: '#0a0b0e' },
  {
    label: 'Emerald 300',
    token: 'emerald-300',
    hex: '#6ee7b7',
    textHex: '#0a0b0e',
  },
  {
    label: 'Purple 300',
    token: 'purple-300',
    hex: '#d8b4fe',
    textHex: '#0a0b0e',
  },
  { label: 'Sky 400', token: 'sky-400', hex: '#38bdf8', textHex: '#0a0b0e' },
  {
    label: 'Slate 300',
    token: 'slate-300',
    hex: '#cbd5e1',
    textHex: '#0a0b0e',
  },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function DevOverlayPage() {
  const [radius, setRadius] = useState(8);
  const [accentIdx, setAccentIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accent = SWATCHES[accentIdx];

  const cssVars: React.CSSProperties = {
    ['--radius-base' as string]: `${radius}px`,
    ['--accent' as string]: accent.hex,
    ['--accent-text' as string]: accent.textHex,
  };

  const handleCopy = useCallback(() => {
    const css = `:root {\n  --radius-base: ${radius}px;\n  --accent: ${accent.hex}; /* ${accent.token} */\n}`;
    navigator.clipboard.writeText(css).catch(() => {});
    setCopied(true);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopied(false), 1800);
  }, [radius, accent]);

  return (
    <div
      style={{
        ...cssVars,
        background: CARBON.page,
        minHeight: '100dvh',
        color: '#e2e4e9',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <header
        style={{
          borderBottom: `1px solid ${CARBON.border}`,
          background: CARBON.surface0,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Link
          href='/exp/shell-v1'
          style={{
            color: '#6b7280',
            fontSize: '13px',
            fontWeight: 450,
            textDecoration: 'none',
            letterSpacing: '-0.01em',
            transition: 'color 150ms ease-out',
          }}
        >
          ← Shell v1
        </Link>
        <span style={{ color: CARBON.border, fontSize: '13px' }}>/</span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#c9cdd6',
            letterSpacing: '-0.01em',
          }}
        >
          Dev overlay
        </span>
        <span style={{ color: '#4b5563', fontSize: '13px', fontWeight: 400 }}>
          · Radius + accent
        </span>

        <div style={{ flex: 1 }} />

        <button
          type='button'
          onClick={handleCopy}
          style={{
            background: copied ? accent.hex : CARBON.surface2,
            color: copied ? accent.textHex : '#9ca3af',
            border: `1px solid ${copied ? accent.hex : CARBON.border}`,
            borderRadius: '6px',
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            cursor: 'pointer',
            transition: `all 220ms ${EASE_CINEMATIC}`,
          }}
        >
          {copied ? 'Copied!' : 'Copy CSS'}
        </button>
      </header>

      <div
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '40px 24px',
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: '32px',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <section>
            <Label>Border radius</Label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginTop: '10px',
              }}
            >
              <input
                type='range'
                min={0}
                max={24}
                step={1}
                value={radius}
                onChange={e => setRadius(Number(e.target.value))}
                style={{ flex: 1, accentColor: accent.hex, cursor: 'pointer' }}
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#9ca3af',
                  minWidth: '36px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.01em',
                }}
              >
                {radius}px
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '4px',
              }}
            >
              {['0', '6', '12', '18', '24'].map(v => (
                <span
                  key={v}
                  style={{
                    fontSize: '10px',
                    color: '#4b5563',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {v}
                </span>
              ))}
            </div>
          </section>

          <section>
            <Label>Accent tone</Label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                marginTop: '10px',
              }}
            >
              {SWATCHES.map((s, i) => (
                <button
                  type='button'
                  key={s.token}
                  title={s.label}
                  onClick={() => setAccentIdx(i)}
                  style={{
                    background: s.hex,
                    border: `2px solid ${i === accentIdx ? '#ffffff' : 'transparent'}`,
                    borderRadius: '6px',
                    height: '32px',
                    cursor: 'pointer',
                    transition:
                      'border-color 150ms ease-out, transform 150ms ease-out',
                    transform: i === accentIdx ? 'scale(1.08)' : 'scale(1)',
                    boxShadow:
                      i === accentIdx ? `0 0 0 3px ${s.hex}40` : 'none',
                  }}
                  aria-label={s.label}
                  aria-pressed={i === accentIdx}
                />
              ))}
            </div>
            <p
              style={{
                fontSize: '11px',
                color: '#6b7280',
                marginTop: '8px',
                letterSpacing: '-0.01em',
              }}
            >
              {accent.label} — {accent.hex}
            </p>
          </section>

          <section>
            <Label>Current values</Label>
            <pre
              style={{
                marginTop: '10px',
                background: CARBON.surface1,
                border: `1px solid ${CARBON.border}`,
                borderRadius: '6px',
                padding: '12px',
                fontSize: '11px',
                color: '#9ca3af',
                lineHeight: 1.7,
                letterSpacing: '-0.005em',
              }}
            >
              {`:root {
  --radius-base: ${radius}px;
  --accent: ${accent.hex};
  /* ${accent.token} */
}`}
            </pre>
          </section>
        </div>

        <div
          style={{
            background: CARBON.surface1,
            border: `1px solid ${CARBON.border}`,
            borderRadius: '12px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
          }}
        >
          <SectionTitle>Primitives preview</SectionTitle>

          <PreviewRow label='Button · Status pill · Avatar'>
            <button
              type='button'
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-text)',
                border: 'none',
                borderRadius: 'var(--radius-base)',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                transition: `background 200ms ease-out, border-radius 200ms ${EASE_CINEMATIC}`,
              }}
            >
              Save changes
            </button>

            <button
              type='button'
              style={{
                background: 'transparent',
                color: '#9ca3af',
                border: `1px solid ${CARBON.border}`,
                borderRadius: 'var(--radius-base)',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                transition: `border-radius 200ms ${EASE_CINEMATIC}`,
              }}
            >
              Cancel
            </button>

            <span
              style={{
                background:
                  'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: 'var(--accent)',
                border:
                  '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                borderRadius: 'calc(var(--radius-base) * 1.5)',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                transition: `border-radius 200ms ${EASE_CINEMATIC}`,
              }}
            >
              Live
            </span>

            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'calc(var(--radius-base) * 1.2)',
                background: `color-mix(in srgb, var(--accent) 20%, ${CARBON.surface2})`,
                border:
                  '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--accent)',
                transition: `border-radius 200ms ${EASE_CINEMATIC}`,
                flexShrink: 0,
              }}
            >
              TW
            </div>
          </PreviewRow>

          <PreviewRow label='Text input (focus ring uses accent)'>
            <FocusInput
              accentHex={accent.hex}
              border={CARBON.border}
              surface={CARBON.surface0}
            />
          </PreviewRow>

          <PreviewRow label='Card'>
            <div
              style={{
                background: CARBON.surface0,
                border: `1px solid ${CARBON.border}`,
                borderRadius: 'var(--radius-base)',
                padding: '16px',
                width: '100%',
                transition: `border-radius 200ms ${EASE_CINEMATIC}`,
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#e2e4e9',
                  letterSpacing: '-0.01em',
                  marginBottom: '6px',
                }}
              >
                Track title
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  letterSpacing: '-0.005em',
                }}
              >
                Artist · 128 BPM · 3:42
              </div>
              <div
                style={{
                  marginTop: '12px',
                  height: '3px',
                  background: CARBON.border,
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '62%',
                    height: '100%',
                    background: 'var(--accent)',
                    borderRadius: '999px',
                    transition: 'background 200ms ease-out',
                  }}
                />
              </div>
            </div>
          </PreviewRow>

          <PreviewRow label='Drawer / sheet corner'>
            <div
              style={{
                width: '100%',
                height: '80px',
                background: CARBON.surface2,
                border: `1px solid ${CARBON.border}`,
                borderRadius:
                  'calc(var(--radius-base) * 2) calc(var(--radius-base) * 2) 0 0',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '10px',
                transition: `border-radius 200ms ${EASE_CINEMATIC}`,
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '4px',
                  background: CARBON.border,
                  borderRadius: '999px',
                }}
              />
            </div>
          </PreviewRow>

          <PreviewRow label='Badge cluster'>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['Techno', 'Melodic', 'Peak Hour', '130–136 BPM'].map(tag => (
                <span
                  key={tag}
                  style={{
                    background: CARBON.surface2,
                    border: `1px solid ${CARBON.border}`,
                    borderRadius: 'var(--radius-base)',
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: '#9ca3af',
                    letterSpacing: '-0.005em',
                    transition: `border-radius 200ms ${EASE_CINEMATIC}`,
                  }}
                >
                  {tag}
                </span>
              ))}
              <span
                style={{
                  background:
                    'color-mix(in srgb, var(--accent) 12%, transparent)',
                  border:
                    '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  borderRadius: 'var(--radius-base)',
                  padding: '3px 9px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--accent)',
                  letterSpacing: '-0.005em',
                  transition: `border-radius 200ms ${EASE_CINEMATIC}, background 200ms ease-out`,
                }}
              >
                + Add tag
              </span>
            </div>
          </PreviewRow>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: '11px',
        fontWeight: 600,
        color: '#6b7280',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: '11px',
        fontWeight: 600,
        color: '#4b5563',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        marginBottom: '-16px',
      }}
    >
      {children}
    </p>
  );
}

function PreviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: '11px',
          color: '#4b5563',
          marginBottom: '10px',
          letterSpacing: '-0.005em',
        }}
      >
        {label}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FocusInput({
  accentHex,
  border,
  surface,
}: {
  accentHex: string;
  border: string;
  surface: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type='text'
      placeholder='Search tracks…'
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        background: surface,
        color: '#e2e4e9',
        border: `1px solid ${focused ? accentHex : border}`,
        borderRadius: 'var(--radius-base)',
        padding: '8px 12px',
        fontSize: '13px',
        fontWeight: 400,
        letterSpacing: '-0.01em',
        outline: 'none',
        boxShadow: focused ? `0 0 0 2px ${accentHex}33` : 'none',
        transition: `border-color 150ms ease-out, box-shadow 150ms ease-out, border-radius 200ms ${EASE_CINEMATIC}`,
        width: '220px',
      }}
    />
  );
}
