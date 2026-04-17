import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Jovie — Investor Portal';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * OG card for investor portal link previews.
 * Dark, branded, enticing but opaque — no sensitive info.
 * Shows in Slack/email/iMessage when an investor link is pasted.
 */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 30% 20%, #1a1a2e 0%, #08090a 60%)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Logo text */}
      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: '-0.02em',
          marginBottom: 16,
        }}
      >
        Jovie
      </div>

      {/* Tagline — enticing but opaque */}
      <div
        style={{
          fontSize: 24,
          fontWeight: 400,
          color: 'rgba(255, 255, 255, 0.6)',
          letterSpacing: '-0.01em',
        }}
      >
        The platform artists actually use
      </div>

      {/* Subtle accent line */}
      <div
        style={{
          width: 60,
          height: 3,
          background: '#8b1eff',
          borderRadius: 4,
          marginTop: 32,
        }}
      />
    </div>,
    { ...size }
  );
}
