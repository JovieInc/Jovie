/**
 * Shared StoryLayout component for ImageResponse rendering.
 * All story images (1080x1920) share this shell: black bg, Jovie branding,
 * content slot, white CTA pill, URL text.
 *
 * Analogous to AdCreativeLayout in retargeting/ad-creative/route.tsx.
 */

import { THEME } from './image-utils';

interface StoryLayoutProps {
  readonly children: React.ReactNode;
  readonly ctaText: string;
  readonly urlText: string;
  readonly eyebrowText?: string;
}

export function StoryLayout({
  children,
  ctaText,
  urlText,
  eyebrowText,
}: StoryLayoutProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: THEME.bg,
        color: THEME.text,
        fontFamily: 'Satoshi, sans-serif',
        padding: '120px 80px',
        position: 'relative',
      }}
    >
      {/* Jovie branding */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          display: 'flex',
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: 'rgba(255, 255, 255, 0.3)',
        }}
      >
        Jovie
      </div>

      {eyebrowText ? (
        <div
          style={{
            position: 'absolute',
            top: 140,
            display: 'flex',
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: THEME.textMuted,
          }}
        >
          {eyebrowText}
        </div>
      ) : null}

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: 48,
          width: '100%',
        }}
      >
        {children}
      </div>

      {/* CTA pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 56px',
          borderRadius: 999,
          fontSize: 28,
          fontWeight: 600,
          color: THEME.buttonText,
          background: THEME.buttonBg,
          letterSpacing: '-0.01em',
          marginBottom: 40,
        }}
      >
        {ctaText}
      </div>

      {/* URL text */}
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          display: 'flex',
          fontSize: 22,
          fontWeight: 500,
          color: THEME.textMuted,
          letterSpacing: '-0.02em',
        }}
      >
        {urlText}
      </div>
    </div>
  );
}
