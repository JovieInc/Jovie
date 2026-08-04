import { typography } from '@jovie/ui/theme/tokens';
import { ImageResponse } from 'next/og';
import { JOVIE_PATH } from '@/lib/brand';
import { DESIGN_TOKENS } from '@/lib/design/generated/design-tokens';
import { loadSatoshiFont } from '@/lib/share/image-utils';

export const runtime = 'nodejs';
export const revalidate = false;
export const alt = 'Jovie Brand System';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const satoshiFont = await loadSatoshiFont();

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: DESIGN_TOKENS.brand.ink,
        fontFamily: typography.roles.display.family,
      }}
    >
      <svg
        width='220'
        height='220'
        viewBox='0 0 360 360'
        xmlns='http://www.w3.org/2000/svg'
        aria-hidden='true'
      >
        <path fill={DESIGN_TOKENS.brand.cream} d={JOVIE_PATH} />
      </svg>
      <div
        style={{
          marginTop: 56,
          fontSize: 84,
          fontWeight: 700,
          color: DESIGN_TOKENS.brand.cream,
          letterSpacing: 0,
        }}
      >
        Jovie Brand System
      </div>
      <div
        style={{
          marginTop: 16,
          fontFamily: typography.roles.display.family,
          fontSize: 26,
          color: DESIGN_TOKENS.gray['9'],
          letterSpacing: 0,
        }}
      >
        One system. Four surfaces.
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: typography.roles.display.family,
          data: satoshiFont,
          weight: 700,
          style: 'normal',
        },
      ],
    }
  );
}
