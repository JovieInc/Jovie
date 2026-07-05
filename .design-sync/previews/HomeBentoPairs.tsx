// Authored preview — HomeBentoPairs. Paired bento feature grid (smart links,
// countdowns, tour, tips). This section is authored as a LIGHT band (text-black on
// bg-(--color-bg-base) with white cards) — unlike its dark siblings. The preview
// canvas defaults to the carbon dark tokens, so scope --color-bg-base back to the
// light value the section was designed for so the black heading reads correctly.
import { HomeBentoPairs } from 'apps/web/components';

export function Default() {
  return (
    <div style={{ ['--color-bg-base' as unknown as string]: '#f5f5f5' }}>
      <HomeBentoPairs />
    </div>
  );
}
