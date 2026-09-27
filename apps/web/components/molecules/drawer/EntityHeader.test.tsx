import { render, screen } from '@testing-library/react';
import { CheckCircle2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import {
  EntityHeader,
  EntityHeaderStatusGlyph,
  EntityHeaderThumbnail,
} from './EntityHeader';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    alt,
    ...props
  }: {
    readonly src: string;
    readonly alt: string;
    readonly fill?: boolean;
    readonly [key: string]: unknown;
  }) => <img alt={alt} {...props} />,
}));

describe('EntityHeader', () => {
  it('renders one dominant title and a quiet details line', () => {
    render(
      <EntityHeader
        thumbnail={<EntityHeaderThumbnail variant='person' name='Tim White' />}
        title='Tim White'
        subtitle='Brand partnerships · Worldwide'
      />
    );

    const title = screen.getByTestId('entity-header-title');
    const details = screen.getByTestId('entity-header-details-row');

    expect(title).toHaveTextContent('Tim White');
    expect(title).toHaveClass('font-semibold', 'text-primary-token');
    expect(details).toHaveTextContent('Brand partnerships · Worldwide');
    expect(details).toHaveClass('text-secondary-token');
    expect(details.className).not.toContain('font-semibold');
  });

  it('omits the details row entirely when no subtitle or status glyph exist', () => {
    render(
      <EntityHeader
        thumbnail={<EntityHeaderThumbnail variant='person' name='Tim White' />}
        title='Tim White'
      />
    );

    expect(screen.queryByTestId('entity-header-details-row')).toBeNull();
  });

  it('renders the trailing actions slot', () => {
    render(
      <EntityHeader
        thumbnail={<EntityHeaderThumbnail variant='person' name='Tim White' />}
        title='Tim White'
        actions={<button type='button'>More actions</button>}
      />
    );

    expect(
      screen.getByRole('button', { name: 'More actions' })
    ).toBeInTheDocument();
  });

  it('does not clamp the subtitle by default outside stable layout', () => {
    render(<EntityHeader title='Audience member' subtitle='Artist team' />);
    expect(screen.getByText('Artist team')).not.toHaveClass('line-clamp-1');
  });

  it('reserves optional slots in stable layout', () => {
    render(
      <EntityHeader
        title='Long entity name'
        stableLayout
        reserveFooterSlot
        data-testid='entity-header'
      />
    );

    expect(screen.getByText('Long entity name')).toHaveClass(
      'line-clamp-1',
      'min-h-6'
    );
    expect(screen.getByTestId('entity-header-meta-slot')).toHaveClass(
      'invisible'
    );
  });

  it('renders stable metadata as a single horizontal rail', () => {
    render(
      <EntityHeader
        title='Track title'
        stableLayout
        meta={
          <>
            <span>3:42</span>
            <span>USRC12345678</span>
            <span>Explicit</span>
          </>
        }
      />
    );

    const rail = screen.getByTestId(
      'entity-header-meta-slot'
    ).firstElementChild;
    expect(rail).toHaveClass('overflow-x-auto', 'whitespace-nowrap');
  });

  it('preserves the subtitle row when requested', () => {
    render(
      <EntityHeader title='Audience member' stableLayout reserveSubtitleSlot />
    );

    const title = screen.getByText('Audience member');
    expect(title).toBeInTheDocument();
    expect(title.parentElement?.nextElementSibling).toHaveClass(
      'invisible',
      'min-h-4'
    );
  });

  it('assigns media, identity, metadata, and actions to explicit grid cells', () => {
    render(
      <EntityHeader
        layout='grid'
        title='Alex Rivera'
        subtitle='Management'
        thumbnail={<span>AR</span>}
        meta={<span>North America</span>}
        actions={<button type='button'>More actions</button>}
        data-testid='entity-header'
      />
    );

    const header = screen.getByTestId('entity-header');
    const image = header.querySelector('[data-entity-header-image]');
    const identity = header.querySelector('[data-entity-header-identity]');
    const metadata = header.querySelector('[data-entity-header-metadata]');
    const actions = header.querySelector('[data-entity-header-actions]');

    expect(header).toHaveAttribute('data-layout', 'grid');
    expect(header).toHaveClass(
      'grid',
      'grid-cols-[auto_minmax(0,1fr)_auto]',
      'grid-rows-[auto_auto]'
    );
    expect(image).toHaveClass('col-start-1', 'row-span-2', 'row-start-1');
    expect(identity).toHaveClass('col-start-2', 'row-start-1');
    expect(metadata).toHaveClass('col-span-2', 'col-start-2', 'row-start-2');
    expect(actions).toHaveClass('col-start-3', 'row-start-1');
  });
});

describe('EntityHeader chrome layout', () => {
  it('renders a string title', () => {
    render(<EntityHeader layout='chrome' title='Contact Details' />);

    expect(screen.getByText('Contact Details')).toBeInTheDocument();
  });

  it('renders a ReactNode title', () => {
    render(
      <EntityHeader
        layout='chrome'
        title={<span data-testid='custom-title'>Custom</span>}
      />
    );

    expect(screen.getByTestId('custom-title')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('renders actions alongside the title', () => {
    render(
      <EntityHeader
        layout='chrome'
        title='Details'
        actions={<button type='button'>Edit</button>}
      />
    );

    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('renders without buttons when no actions are provided', () => {
    render(<EntityHeader layout='chrome' title='No Actions' />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('EntityHeaderStatusGlyph', () => {
  it('exposes the state name via aria-label and never as visible text', () => {
    render(
      <EntityHeaderStatusGlyph
        icon={CheckCircle2}
        label='Live on DSPs'
        tone='positive'
      />
    );

    expect(screen.getByLabelText('Live on DSPs')).toBeInTheDocument();
    // Tooltip content is not mounted until hover/focus opens it — the status
    // word must never appear as plain visible text in the header.
    expect(screen.queryAllByText('Live on DSPs')).toHaveLength(0);
  });

  it('hides the icon glyph from the accessibility tree (the label carries the name)', () => {
    render(<EntityHeaderStatusGlyph icon={CheckCircle2} label='Scheduled' />);

    const glyph = screen.getByTestId('entity-header-status-glyph');
    expect(glyph).toHaveAttribute('role', 'img');
    expect(glyph).toHaveAttribute('aria-label', 'Scheduled');
    expect(glyph.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('EntityHeaderThumbnail', () => {
  it('renders a circular person avatar with initials fallback', () => {
    render(
      <EntityHeaderThumbnail
        variant='person'
        name='Tim White'
        data-testid='thumb'
      />
    );

    const thumb = screen.getByTestId('thumb');
    expect(thumb).toHaveClass('rounded-full', 'size-14');
    expect(thumb).toHaveTextContent('TW');
  });

  it('renders release artwork as a never-cropped rounded square', () => {
    render(
      <EntityHeaderThumbnail
        variant='artwork'
        name='Midnight Drive'
        src='https://example.com/art.jpg'
        data-testid='thumb'
      />
    );

    const thumb = screen.getByTestId('thumb');
    expect(thumb).not.toHaveClass('rounded-full');
    const image = screen.getByRole('img', { name: 'Midnight Drive' });
    expect(image).toHaveClass('object-contain');
  });

  it('renders a provider glyph on a subtle tint for connections', () => {
    render(
      <EntityHeaderThumbnail
        variant='connection'
        icon={<span data-testid='provider-glyph'>S</span>}
        data-testid='thumb'
      />
    );

    const thumb = screen.getByTestId('thumb');
    expect(thumb).toHaveClass('rounded-full', 'bg-surface-2');
    expect(screen.getByTestId('provider-glyph')).toBeInTheDocument();
  });
});
