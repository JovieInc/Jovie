import { ImageResponse } from 'next/og';
import { JOVIE_PATH } from '@/lib/brand';
import { loadDMSansFont, loadSatoshiFont } from '@/lib/share/image-utils';

export const runtime = 'nodejs';
export const revalidate = false;
export const alt = 'Jovie Brand';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const [satoshiFont, dmSansFont] = await Promise.all([
    loadSatoshiFont(),
    loadDMSansFont(),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#08090a',
        fontFamily: 'Satoshi, sans-serif',
      }}
    >
      <svg
        width='220'
        height='220'
        viewBox='0 0 360 360'
        xmlns='http://www.w3.org/2000/svg'
        aria-hidden='true'
      >
        <path fill='#F5F4F0' d={JOVIE_PATH} />
      </svg>
      <div
        style={{
          marginTop: 56,
          fontSize: 84,
          fontWeight: 700,
          color: '#F5F4F0',
          letterSpacing: 0,
        }}
      >
        Jovie Brand
      </div>
      <div
        style={{
          marginTop: 16,
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 26,
          color: 'rgba(245,244,240,0.6)',
          letterSpacing: 0,
        }}
      >
        One loop. Every release.
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: 'Satoshi',
          data: satoshiFont,
          weight: 700,
          style: 'normal',
        },
        {
          name: 'DM Sans',
          data: dmSansFont,
          weight: 400,
          style: 'normal',
        },
      ],
    }
  );
}
