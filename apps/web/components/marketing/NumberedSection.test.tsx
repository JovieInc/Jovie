import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NumberedSection } from './NumberedSection';
import storyMeta, { Default } from './NumberedSection.stories';

describe('NumberedSection', () => {
  it('renders the numbered marketing section contract with bounded heading', () => {
    render(
      <NumberedSection
        sectionNumber='1.0'
        sectionTitle='Intake'
        heading='Start with the release.'
        description='Capture the artist, asset, and release context.'
      >
        <div>Release plan preview</div>
      </NumberedSection>
    );

    expect(screen.getByText('1.0')).toBeInTheDocument();
    expect(screen.getByText('Intake →')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Start with the release.',
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByText('Capture the artist, asset, and release context.')
    ).toBeInTheDocument();
    expect(screen.getByText('Release plan preview')).toBeInTheDocument();
  });

  it('keeps the adjacent Storybook receipt bound to the production component', () => {
    expect(storyMeta.component).toBe(NumberedSection);
    expect(Default.args?.sectionNumber).toBe('1.0');
    expect(Default.args?.sectionTitle).toBe('Intake');
    expect(Default.args?.heading).toBe('Start with the release.');
    expect(Default.args?.children).toBeDefined();
  });
});
