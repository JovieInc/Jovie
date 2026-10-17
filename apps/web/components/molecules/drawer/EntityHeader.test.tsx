import { fireEvent, render, screen } from '@testing-library/react';
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
    priority: _priority,
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

  it('only clamps the subtitle in stable layout and reserves optional slots', () => {
    const first = render(
      <EntityHeader title='Audience member' subtitle='Artist team' />
    );
    expect(screen.getByText('Artist team')).not.toHaveClass('line-clamp-1');
    first.unmount();

    const second = render(
      <EntityHeader title='Long entity name' stableLayout reserveFooterSlot />
    );
    const title = screen.getByText('Long entity name');
    expect(title).toHaveClass('truncate', 'min-h-6');
    expect(title).not.toHaveClass('line-clamp-1');
    expect(screen.getByTestId('entity-header-meta-slot')).toHaveClass(
      'invisible'
    );
    expect(title.parentElement?.nextElementSibling).toHaveClass(
      'invisible',
      'min-h-4'
    );
    second.unmount();

    render(
      <EntityHeader title='Track title' stableLayout meta={<span>3:42</span>} />
    );
    expect(
      screen.getByTestId('entity-header-meta-slot').firstElementChild
    ).toHaveClass('overflow-x-auto', 'whitespace-nowrap');
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
      />
    );

    const header = screen.getByTestId('entity-header');
    expect(header).toHaveAttribute('data-layout', 'grid');
    expect(header).toHaveClass('grid', 'grid-cols-[auto_minmax(0,1fr)_auto]');
    expect(header.querySelector('[data-entity-header-image]')).toHaveClass(
      'row-span-2'
    );
    expect(header.querySelector('[data-entity-header-identity]')).toHaveClass(
      'col-start-2'
    );
    expect(header.querySelector('[data-entity-header-metadata]')).toHaveClass(
      'row-start-2'
    );
    expect(header.querySelector('[data-entity-header-actions]')).toHaveClass(
      'col-start-3'
    );
  });
});

describe('EntityHeader chrome layout', () => {
  it('renders title and actions in a utility bar', () => {
    const first = render(
      <EntityHeader layout='chrome' title='Contact Details' />
    );
    expect(screen.getByText('Contact Details')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    first.unmount();

    render(
      <EntityHeader
        layout='chrome'
        title={<span data-testid='custom-title'>Custom</span>}
        actions={<button type='button'>Edit</button>}
      />
    );
    expect(screen.getByTestId('custom-title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
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
    expect(thumb).toHaveClass('rounded-full');
    expect(thumb.firstElementChild).toHaveClass('bg-surface-2');
    expect(screen.getByTestId('provider-glyph')).toBeInTheDocument();
  });
});

describe('entity identity semantics across states and densities', () => {
  it.each([28, 40, 44, 48, 56, 72, 80])(
    'keeps person media circular at %ipx through failure and replacement',
    size => {
      const { container, rerender } = render(
        <EntityHeaderThumbnail
          variant='person'
          name='Alex Rivera'
          src='https://example.com/broken.jpg'
          size={size}
          data-testid='media'
        />
      );
      const media = screen.getByTestId('media');
      expect(media).toHaveStyle({ width: `${size}px`, height: `${size}px` });
      fireEvent.error(container.querySelector('img')!);
      expect(media).toHaveTextContent('AR');
      expect(media).toHaveClass('rounded-full');
      expect(
        screen.getByRole('img', { name: 'Alex Rivera' })
      ).toBeInTheDocument();
      rerender(
        <EntityHeaderThumbnail
          variant='person'
          name='Alex Rivera'
          src='https://example.com/replacement.jpg'
          size={size}
          data-testid='media'
        />
      );
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://example.com/replacement.jpg'
      );
      expect(media).toHaveStyle({ width: `${size}px`, height: `${size}px` });
    }
  );

  it('keeps verification on missing and failed person media, and removes it when the source flag clears', () => {
    const { container, rerender } = render(
      <EntityHeaderThumbnail
        variant='person'
        name='Alex Rivera'
        verified
        src='https://example.com/broken.jpg'
      />
    );
    fireEvent.error(container.querySelector('img')!);
    expect(
      screen.getByRole('img', { name: 'Verified Jovie Profile' })
    ).toBeInTheDocument();
    expect(screen.getByText('AR')).toBeInTheDocument();
    rerender(
      <EntityHeaderThumbnail
        variant='person'
        name='Alex Rivera'
        verified={false}
      />
    );
    expect(
      screen.queryByRole('img', { name: 'Verified Jovie Profile' })
    ).toBeNull();
  });

  it('never turns release/event/connection state into profile verification', () => {
    for (const variant of ['artwork', 'event', 'connection'] as const) {
      const { unmount } = render(
        <EntityHeaderThumbnail variant={variant} name='Entity' verified />
      );
      expect(
        screen.queryByRole('img', { name: 'Verified Jovie Profile' })
      ).toBeNull();
      unmount();
    }
  });

  it('preserves the complete artwork and media footprint after a failed image', () => {
    const { container } = render(
      <EntityHeaderThumbnail
        variant='artwork'
        name='Release'
        src='https://example.com/broken.jpg'
        size={40}
        data-testid='media'
      />
    );
    const image = screen.getByRole('img', { name: 'Release' });
    expect(image).toHaveClass('object-contain');
    fireEvent.error(image);
    expect(
      container.querySelector('[data-artwork-fallback]')
    ).toBeInTheDocument();
    expect(screen.getByTestId('media')).toHaveStyle({
      width: '40px',
      height: '40px',
    });
  });

  it('uses a UTC calendar date stamp, with a calendar icon for missing or invalid dates', () => {
    const { container, rerender } = render(
      <EntityHeaderThumbnail
        variant='event'
        name='Club night'
        eventDate='2026-06-12'
      />
    );
    expect(screen.getByText('JUN')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    rerender(
      <EntityHeaderThumbnail
        variant='event'
        name='Club night'
        eventDate='invalid'
      />
    );
    expect(container.querySelector('.lucide-calendar')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Club night' })).toBeInTheDocument();
  });

  it('supports explicit decorative media without hiding the verification label', () => {
    render(
      <EntityHeaderThumbnail
        variant='person'
        name='Alex Rivera'
        alt=''
        verified
      />
    );
    expect(screen.queryByRole('img', { name: 'Alex Rivera' })).toBeNull();
    expect(
      screen.getByRole('img', { name: 'Verified Jovie Profile' })
    ).toBeInTheDocument();
  });
});
