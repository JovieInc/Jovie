import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ONBOARDING_TOOL_FIELD_RAW_FOCUS_FIXTURE_TEST_ID,
  OnboardingToolFieldRawFocusFixture,
  RETIRED_ONBOARDING_TOOL_FIELD_RAW_FOCUS,
} from './fixtures/onboarding-tool-field-raw-focus';
import {
  ONBOARDING_TOOL_FIELD_DENSITY,
  ONBOARDING_TOOL_FIELD_FOCUS,
  ONBOARDING_TOOL_FIELD_MOTION,
  ONBOARDING_TOOL_FIELD_SURFACE,
  OnboardingToolField,
  onboardingToolFieldClassName,
} from './OnboardingToolField';

const here = path.dirname(fileURLToPath(import.meta.url));

function readSource(filename: string): string {
  return readFileSync(path.join(here, filename), 'utf8');
}

function fieldIdFor(label: string): string {
  return `onboarding-tool-field-${label.replaceAll(/\s+/g, '-').toLowerCase()}`;
}

function FieldExample({
  density,
  label,
  disabled = false,
  defaultValue,
  className,
}: {
  readonly density: 'picker' | 'compact';
  readonly label: string;
  readonly disabled?: boolean;
  readonly defaultValue?: string;
  readonly className?: string;
}) {
  const fieldId = fieldIdFor(label);
  return (
    <OnboardingToolField
      density={density}
      htmlFor={fieldId}
      className={className}
    >
      <span className='sr-only'>{label}</span>
      <input
        id={fieldId}
        aria-label={label}
        disabled={disabled}
        defaultValue={defaultValue}
        placeholder={label}
        className='min-w-0 flex-1 bg-transparent focus:outline-none'
      />
    </OnboardingToolField>
  );
}

describe('OnboardingToolField', () => {
  it('owns one surface, focus, and motion recipe for both densities', () => {
    expect(onboardingToolFieldClassName('picker')).toContain(
      ONBOARDING_TOOL_FIELD_SURFACE
    );
    expect(onboardingToolFieldClassName('compact')).toContain(
      ONBOARDING_TOOL_FIELD_FOCUS
    );
    expect(onboardingToolFieldClassName('picker')).toContain(
      ONBOARDING_TOOL_FIELD_MOTION
    );
    expect(ONBOARDING_TOOL_FIELD_FOCUS).toContain('focus-within:border-focus');
    expect(ONBOARDING_TOOL_FIELD_FOCUS).toContain('focus-within:ring-focus/16');
    expect(ONBOARDING_TOOL_FIELD_MOTION).toContain(
      'motion-reduce:transition-none'
    );
  });

  it('preserves picker spacing versus compact height', () => {
    const { rerender } = render(
      <FieldExample density='picker' label='Search Spotify artists' />
    );
    const picker = screen
      .getByLabelText('Search Spotify artists')
      .closest('[data-slot="onboarding-tool-field"]');

    expect(picker).toHaveAttribute('data-density', 'picker');
    expect(picker).toHaveClass(
      ...ONBOARDING_TOOL_FIELD_DENSITY.picker.split(' ')
    );
    expect(picker).not.toHaveClass('h-9');

    rerender(<FieldExample density='compact' label='Edit Proposed Handle' />);
    const compact = screen
      .getByLabelText('Edit Proposed Handle')
      .closest('[data-slot="onboarding-tool-field"]');

    expect(compact).toHaveAttribute('data-density', 'compact');
    expect(compact).toHaveClass(
      ...ONBOARDING_TOOL_FIELD_DENSITY.compact.split(' ')
    );
    expect(compact).not.toHaveClass('mt-3');
  });

  it('keeps keyboard focus on the inner input while the owner carries the ring', async () => {
    const user = userEvent.setup();
    render(<FieldExample density='compact' label='Social Profile URL' />);

    const input = screen.getByLabelText('Social Profile URL');
    await user.tab();

    expect(input).toHaveFocus();
    expect(input.matches(':focus-visible')).toBe(true);

    const owner = input.closest('[data-slot="onboarding-tool-field"]');
    expect(owner).toHaveClass(
      'focus-within:border-focus',
      'focus-within:ring-2',
      'focus-within:ring-focus/16'
    );
    expect(owner).not.toHaveClass(
      'focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.035)]'
    );
  });

  it('renders unfocused and focused owners without changing geometry', () => {
    render(
      <>
        <FieldExample density='compact' label='Idle Handle' />
        <FieldExample density='compact' label='Focused Handle' />
      </>
    );
    const idle = screen
      .getByLabelText('Idle Handle')
      .closest('[data-slot="onboarding-tool-field"]');
    const focusedInput = screen.getByLabelText('Focused Handle');
    focusedInput.focus();

    expect(focusedInput).toHaveFocus();
    expect(
      focusedInput.closest('[data-slot="onboarding-tool-field"]')?.className
    ).toBe(idle?.className);
  });

  it('keeps disabled fields on the same owner without the raw recipe', () => {
    render(
      <FieldExample density='compact' label='Edit Proposed Handle' disabled />
    );
    const owner = screen
      .getByLabelText('Edit Proposed Handle')
      .closest('[data-slot="onboarding-tool-field"]');

    expect(screen.getByLabelText('Edit Proposed Handle')).toBeDisabled();
    expect(owner).toHaveClass('border-subtle', 'bg-surface-0');
    expect(owner?.className).not.toContain('rgba(255,255,255,0.035)');
  });
});

describe('OnboardingToolField states', () => {
  it('keeps typed text through a re-render that changes density and class', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FieldExample density='compact' label='Edit Proposed Handle' />
    );
    const input = screen.getByLabelText('Edit Proposed Handle');
    await user.type(input, 'newartist');
    expect(input).toHaveValue('newartist');

    rerender(
      <FieldExample
        density='picker'
        label='Edit Proposed Handle'
        className='mt-4'
      />
    );

    const after = screen.getByLabelText('Edit Proposed Handle');
    expect(after).toBe(input);
    expect(after).toHaveValue('newartist');
    expect(after.closest('[data-slot="onboarding-tool-field"]')).toHaveClass(
      'mt-4'
    );
  });

  it('focuses the inner input when the owner label is clicked', async () => {
    const user = userEvent.setup();
    render(<FieldExample density='picker' label='Search Spotify artists' />);
    const owner = screen
      .getByLabelText('Search Spotify artists')
      .closest('[data-slot="onboarding-tool-field"]') as HTMLElement;
    await user.click(owner);
    expect(screen.getByLabelText('Search Spotify artists')).toHaveFocus();
  });

  it('is axe-clean empty, with its placeholder as the prompt', async () => {
    const { container } = render(
      <FieldExample density='compact' label='Edit Proposed Handle' />
    );
    const input = screen.getByLabelText('Edit Proposed Handle');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Edit Proposed Handle');
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with a value, in both densities and disabled', async () => {
    const { container } = render(
      <>
        <FieldExample
          density='picker'
          label='Search Spotify artists'
          defaultValue='Test Artist'
        />
        <FieldExample
          density='compact'
          label='Edit Proposed Handle'
          defaultValue='validartist'
          disabled
        />
      </>
    );
    expect(screen.getByLabelText('Search Spotify artists')).toHaveValue(
      'Test Artist'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long value whole inside the owner', async () => {
    const url =
      'https://www.instagram.com/an.unusually.long.artist.handle.with.many.parts/?utm_source=linktree';
    const { container } = render(
      <FieldExample
        density='compact'
        label='Social Profile URL'
        defaultValue={url}
      />
    );
    const input = screen.getByLabelText('Social Profile URL');
    expect(input).toHaveValue(url);
    expect(input).toHaveClass('min-w-0', 'flex-1');
    await expectNoA11yViolations(container);
  });

  it('is axe-clean right to left and keeps typed text', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl'>
        <FieldExample density='picker' label='Search Spotify artists' />
      </div>
    );
    const input = screen.getByLabelText('Search Spotify artists');
    await user.type(input, 'فيروز');
    expect(input).toHaveValue('فيروز');
    await expectNoA11yViolations(container);
  });
});

describe('OnboardingToolField production sources', () => {
  const productionFiles = [
    'OnboardingToolField.tsx',
    'OnboardingToolArtifacts.tsx',
  ] as const;

  it('keeps production off the retired raw focus recipe', () => {
    for (const filename of productionFiles) {
      const source = readSource(filename);
      expect(source, filename).not.toContain(
        'focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.035)]'
      );
      expect(source, filename).not.toContain(
        'focus-within:border-white/[0.16]'
      );
      expect(source, filename).not.toContain('data-deliberate-red');
    }
  });

  it('keeps the stories theme switch on one meta-level ThemeFrame decorator', () => {
    const source = readSource('OnboardingToolField.stories.tsx');
    expect(source.match(/decorators:/g)).toHaveLength(1);
    expect(source).toContain('context.parameters.theme');
    expect(source).toContain("parameters: { theme: 'light' }");
  });

  it('uses one field owner for the three onboarding tool inputs', () => {
    const source = readSource('OnboardingToolArtifacts.tsx');
    expect(source).toContain("from './OnboardingToolField'");
    expect(source.match(/<OnboardingToolField\b/g)).toHaveLength(3);
    expect(source).toContain("density='picker'");
    expect(source.match(/density='compact'/g)).toHaveLength(2);
  });
});

describe('OnboardingToolFieldRawFocusFixture', () => {
  it('is a deliberate-red restoration of the retired raw focus recipe', () => {
    render(<OnboardingToolFieldRawFocusFixture />);
    const fixture = screen.getByTestId(
      ONBOARDING_TOOL_FIELD_RAW_FOCUS_FIXTURE_TEST_ID
    );

    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.className).toContain(
      RETIRED_ONBOARDING_TOOL_FIELD_RAW_FOCUS
    );
    expect(fixture.className).toContain(
      'focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.035)]'
    );
    expect(fixture.className).not.toContain('focus-within:border-focus');
  });

  it('fails when the retired raw recipe is restored onto the production owner', () => {
    render(
      <>
        <FieldExample density='compact' label='Edit Proposed Handle' />
        <OnboardingToolFieldRawFocusFixture />
      </>
    );

    const production = screen
      .getByLabelText('Edit Proposed Handle')
      .closest('[data-slot="onboarding-tool-field"]');
    const fixture = screen.getByTestId(
      ONBOARDING_TOOL_FIELD_RAW_FOCUS_FIXTURE_TEST_ID
    );

    expect(production).not.toHaveAttribute('data-deliberate-red');
    expect(production?.className).not.toContain(
      'focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.035)]'
    );
    expect(fixture.className).toContain(
      'focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.035)]'
    );
    expect(readSource('OnboardingToolField.tsx')).toContain(
      'focus-within:border-focus'
    );
  });
});
