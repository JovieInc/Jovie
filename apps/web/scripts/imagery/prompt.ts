/**
 * Plate prompt template, from canon/MARKETING.md "Imagery and color" and
 * "Focal point": one named accent hue, a lit wedge falling to black, a quiet
 * zone, and nothing else. The model only supplies soft texture; the grade
 * (grade.ts) enforces the hue, wedge and quiet zone in pixels, so a prompt
 * slip cannot ship a second hue.
 */
import type {
  ImageryStageSpec,
  StageAccent,
  StageRect,
} from '../../lib/imagery/stages';

export const ACCENT_HUE_NAME: Record<StageAccent, string> = {
  ion: 'cool azure blue',
  ultra: 'soft violet',
  pulse: 'muted magenta pink',
};

function regionName(rect: StageRect): string {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const h = cx < 0.4 ? 'left' : cx > 0.6 ? 'right' : 'center';
  const v = cy < 0.4 ? 'upper' : cy > 0.6 ? 'lower' : 'middle';
  return `${v} ${h}`;
}

export function buildPlatePrompt(stage: ImageryStageSpec): string {
  const hue = ACCENT_HUE_NAME[stage.light.accent];
  const origin = `${stage.light.origin.y < 0.5 ? 'top' : 'bottom'} ${stage.light.origin.x < 0.5 ? 'left' : 'right'}`;
  return [
    'Abstract matte background plate for a dark product website.',
    `One single hue only: ${hue}. All other tones are neutral black falloff.`,
    `One soft lit wedge of ${hue} light enters from the ${origin} corner and falls off to pure black across the rest of the frame.`,
    `Quiet zone: the ${regionName(stage.safeArea)} area stays near black with no light and no detail.`,
    'Surface: smooth matte satin or fine fog, extremely low contrast, no hard edges, no glossy glass, no glow orbs, no lens flare.',
    'No text, no letters, no logos, no UI, no people, no faces, no hands, no instruments, no microphones, no headphones, no stage, no crowd, no orange.',
  ].join(' ');
}
