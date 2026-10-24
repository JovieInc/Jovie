import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, WEB_ROOT } from './blocking-ui-invariants';

const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');

describe('hover-reveal invariant (JOV-8957)', () => {
  it('uses opacity without hiding, removing, resizing, or moving the reserved box', () => {
    const source = read('packages/ui/atoms/hover-reveal.tsx');
    expect(source).toContain('opacity-0');
    expect(source).toContain('group-hover:opacity-100');
    expect(source).toContain('group-focus-within:opacity-100');
    expect(source).toContain('focus-within:opacity-100');
    expect(source).toContain('active:opacity-100');
    expect(source).toContain('has-aria-expanded:opacity-100');
    expect(source).toContain('has-aria-pressed:opacity-100');
    expect(source).toContain(
      "engaged && (inverse ? 'opacity-0' : 'opacity-100')"
    );
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).not.toMatch(
      /\b(?:hidden|invisible|collapse|display|visibility|translate|scale)-|return null|aria-hidden|tabIndex=/
    );
  });

  it.each([
    'components/organisms/opportunity-card/OpportunityRow.tsx',
    'components/features/opportunity-inbox/OpportunityInboxTourDateRow.tsx',
    'components/molecules/inspector/DspQuietRow.tsx',
    'components/molecules/drawer/DrawerEditableTextField.tsx',
    'components/organisms/table/atoms/TableCheckboxCell.tsx',
    'components/organisms/table/atoms/AudienceRowSelectionCell.tsx',
    'components/organisms/table/molecules/ToolbarFilterSuggestions.tsx',
  ])(
    'keeps %s on the shared primitive with a matching interaction contract',
    file => {
      const source = readFileSync(join(WEB_ROOT, file), 'utf8');
      expect(source).toContain('<HoverReveal');
      expect(source).not.toMatch(/group-hover(?:\/toolbar-filters)?:opacity-/);
      const test = readFileSync(
        join(WEB_ROOT, file.replace('.tsx', '.interaction.test.tsx')),
        'utf8'
      );
      expect(test).toContain('user');
    }
  );

  it('keeps release metadata and the agent entrypoint connected to the invariant', () => {
    const release = readFileSync(
      join(
        WEB_ROOT,
        'components/organisms/release-sidebar/ReleaseMetadata.tsx'
      ),
      'utf8'
    );
    expect(
      read('apps/web/components/molecules/drawer/DrawerPropertyRow.tsx')
    ).toContain('group grid w-full');
    for (const field of ['primaryIsrc', 'upc', 'label']) {
      expect(release).toContain(`copyValue={release.${field} ?? null}`);
    }
    expect(read('AGENTS.md')).toContain('docs/design-system/INVARIANTS.md');
    expect(read('docs/design-system/INVARIANTS.md')).toContain('HoverReveal');
  });
});
