/** Tiny markdown renderers. Marker characters are built, not written inline, so generator code holds no prose. */
const DASH = '-';
const TICK = '`';
const FENCE = TICK.repeat(3);
const HASH = '#';

export const heading = (level: number, text: string) =>
  [HASH.repeat(level), text].join(' ');
export const code = (text: string) => [TICK, text, TICK].join('');
export const bullets = (items: readonly string[]) =>
  items.map(item => [DASH, item].join(' ')).join('\n');
export const numbered = (items: readonly string[]) =>
  items.map((item, index) => [`${index + 1}.`, item].join(' ')).join('\n');
export const fence = (language: string, body: string) =>
  [FENCE + language, body, FENCE].join('\n');
export const comment = (text: string) => ['<!--', text, '-->'].join(' ');
export const page = (blocks: readonly string[]) => `${blocks.join('\n\n')}\n`;
