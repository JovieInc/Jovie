import type { AlbumArtStyleId, AlbumArtStylePreset } from './types';

export const ALBUM_ART_STYLES: Record<AlbumArtStyleId, AlbumArtStylePreset> = {
  neo_pop_collage: {
    id: 'neo_pop_collage',
    label: 'Neo Pop',
    description: 'Surreal digital collage with saturated pop color.',
    backgroundPrompt:
      'A surreal glossy digital collage for contemporary music artwork, saturated pop pinks, cyan and yellow accents, hyper-detailed 3D objects, cinematic depth, premium editorial composition, high contrast.',
    overlayTheme: {
      layout: 'bottom_band',
      titleMinSize: 118,
      titleMaxSize: 260,
      artistMinSize: 52,
      artistMaxSize: 92,
      textColor: '#ffffff',
      shadowColor: 'rgba(0,0,0,0.55)',
      plateColor: 'rgba(0,0,0,0.42)',
    },
  },
  chrome_noir: {
    id: 'chrome_noir',
    label: 'Chrome Noir',
    description: 'Silver, smoke, and hard light.',
    backgroundPrompt:
      'A cinematic album cover background with black and polished chrome surfaces, silver reflections, smoke, hard rim light, dramatic object composition, clean negative space, high-end music campaign aesthetic.',
    overlayTheme: {
      layout: 'center_stack',
      titleMinSize: 108,
      titleMaxSize: 230,
      artistMinSize: 48,
      artistMaxSize: 82,
      textColor: '#f7f7f2',
      shadowColor: 'rgba(0,0,0,0.7)',
      plateColor: 'rgba(5,5,5,0.34)',
    },
  },
  analog_dream: {
    id: 'analog_dream',
    label: 'Analog Dream',
    description: '35mm grain, bloom, and tactile texture.',
    backgroundPrompt:
      'A tactile photographed album cover background with 35mm film grain, soft bloom, worn paper texture, muted red blue and green tones, real objects arranged like an art-directed still life, nostalgic but modern.',
    overlayTheme: {
      layout: 'bottom_band',
      titleMinSize: 104,
      titleMaxSize: 218,
      artistMinSize: 46,
      artistMaxSize: 78,
      textColor: '#fff8ea',
      shadowColor: 'rgba(55,35,20,0.55)',
      plateColor: 'rgba(20,14,10,0.38)',
    },
  },
  minimal_icon: {
    id: 'minimal_icon',
    label: 'Icon',
    description: 'One strong symbol with clean space.',
    backgroundPrompt:
      'A minimal premium album cover background with one strong central abstract symbol, restrained color palette, clean negative space, editorial design, subtle texture, iconic and memorable.',
    overlayTheme: {
      layout: 'quiet_corner',
      titleMinSize: 92,
      titleMaxSize: 188,
      artistMinSize: 42,
      artistMaxSize: 70,
      textColor: '#f5f1e8',
      shadowColor: 'rgba(0,0,0,0.42)',
      plateColor: 'rgba(0,0,0,0.24)',
    },
  },
};

export function getAlbumArtStyle(
  styleId: AlbumArtStyleId | undefined
): AlbumArtStylePreset {
  return styleId ? ALBUM_ART_STYLES[styleId] : ALBUM_ART_STYLES.neo_pop_collage;
}

export function isAlbumArtStyleId(value: string): value is AlbumArtStyleId {
  return value in ALBUM_ART_STYLES;
}
