import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PitchEngagement } from './PitchEngagement';

const hoisted = vi.hoisted(() => ({ track: vi.fn(), beacon: vi.fn() }));

vi.mock('@/lib/analytics', () => ({ track: hoisted.track }));
vi.mock('@/lib/tracking/json-beacon', () => ({
  postJsonBeacon: hoisted.beacon,
}));

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observerCallback: ObserverCallback = () => undefined;
const observe = vi.fn();
const disconnect = vi.fn();

function Deck() {
  return (
    <main>
      <PitchEngagement />
      <section data-pitch-slide='problem' aria-label='Problem'>
        <h1>Artists drop more music with less work</h1>
      </section>
      <section data-pitch-slide='traction' aria-label='Traction'>
        <h2>Traction</h2>
      </section>
      <video data-pitch-demo-video aria-label='Product demo'>
        <track kind='captions' />
      </video>
      <details data-pitch-section='founder-letter'>
        <summary>Founder letter</summary>
        <p>Why now.</p>
      </details>
      <a href='#book' data-pitch-event='meeting_cta_clicked'>
        <span>Book a meeting</span>
      </a>
      <a href='#other' data-pitch-event='not_an_event'>
        Other link
      </a>
    </main>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(function (this: unknown, callback: ObserverCallback) {
      observerCallback = callback;
      return { observe, disconnect, unobserve: vi.fn() };
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('PitchEngagement', () => {
  it('renders nothing of its own and tracks the portal opening', async () => {
    const { container } = render(<PitchEngagement />);

    expect(container).toBeEmptyDOMElement();
    expect(hoisted.track).toHaveBeenCalledWith('portal_opened', {
      surface: 'pitch',
    });
    expect(hoisted.beacon).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('tracks a click on a known pitch action, from a nested element', async () => {
    const user = userEvent.setup();
    const { container } = render(<Deck />);

    await user.click(screen.getByText('Book a meeting'));
    expect(hoisted.track).toHaveBeenCalledWith('meeting_cta_clicked', {
      surface: 'pitch',
    });
    await user.click(screen.getByRole('link', { name: 'Other link' }));
    expect(hoisted.track).not.toHaveBeenCalledWith(
      'not_an_event',
      expect.anything()
    );
    await expectNoA11yViolations(container);
  });

  it('tracks opening the founder letter, and the demo start once and end', () => {
    render(<Deck />);
    const details = screen.getByText('Founder letter').closest('details')!;

    details.open = true;
    fireEvent(details, new Event('toggle'));
    const video = screen.getByLabelText('Product demo');
    fireEvent.play(video);
    fireEvent.play(video);
    fireEvent.ended(video);

    const names = hoisted.track.mock.calls.map(call => call[0]);
    expect(names).toContain('founder_letter_opened');
    expect(names.filter(name => name === 'demo_started')).toHaveLength(1);
    expect(names).toContain('demo_completed');
  });

  it('tracks each slide once as it scrolls into view', () => {
    render(<Deck />);
    expect(observe).toHaveBeenCalledTimes(2);
    const problem = screen.getByRole('region', { name: 'Problem' });

    observerCallback([{ isIntersecting: true, target: problem }]);
    observerCallback([{ isIntersecting: true, target: problem }]);
    observerCallback([
      {
        isIntersecting: false,
        target: screen.getByRole('region', { name: 'Traction' }),
      },
    ]);

    const progressed = hoisted.track.mock.calls.filter(
      call => call[0] === 'deck_progressed'
    );
    expect(progressed).toEqual([
      ['deck_progressed', { surface: 'pitch', slideId: 'problem' }],
    ]);
  });

  it('stops listening when unmounted', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Deck />);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);

    render(
      <a href='#book' data-pitch-event='meeting_cta_clicked'>
        Book again
      </a>
    );
    hoisted.track.mockClear();
    await user.click(screen.getByRole('link', { name: 'Book again' }));
    expect(hoisted.track).not.toHaveBeenCalled();
  });
});
