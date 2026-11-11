import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockFitLayout } from './fit-layout.test-utils';
import {
  HOME_LOOP_FIXTURE_ASKS,
  HOME_LOOP_FIXTURE_UNMEASURED_PULSE,
} from './fixtures';
import { HomeLoopCanvas, type HomeLoopCanvasProps } from './HomeLoopCanvas';
import { props } from './HomeLoopCanvas.test-fixtures';

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  })
);
vi.mock('@/components/feedback', () => ({ toast: toastMock }));

describe('HomeLoopCanvas', () => {
  it('reserves the shipping provenance layout across loading and unavailable states', () => {
    const { rerender } = render(
      <HomeLoopCanvas
        {...props({ reservePulseSourceCaption: true, loopStatus: 'loading' })}
      />
    );
    const layout = screen.getByTestId('home-loop-pulse').className;
    rerender(
      <HomeLoopCanvas {...props({ reservePulseSourceCaption: true })} />
    );
    expect(screen.getByTestId('home-loop-pulse').className).toBe(layout);
    rerender(
      <HomeLoopCanvas
        {...props({ reservePulseSourceCaption: true, pulse: [] })}
      />
    );
    expect(screen.getByTestId('home-loop-pulse').className).toBe(layout);
  });

  it('puts the company row above the shipping verdict with its caption', () => {
    render(
      <HomeLoopCanvas
        {...props({
          company: [
            {
              key: 'runway',
              label: 'Runway',
              value: '6 days',
              was: null,
              tone: 'bad',
              measured: true,
              target: 'Default dead · $23 cash',
            },
          ],
          pulseCaption: 'Shipping · compared with your visit 3h ago',
        })}
      />
    );
    const company = screen.getByRole('region', { name: 'Company' });
    expect(company).toHaveTextContent('6 days');
    expect(company).toHaveTextContent('Default dead · $23 cash');
    expect(
      company.compareDocumentPosition(
        screen.getByTestId('home-loop-constraint')
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByTestId('home-loop-pulse-caption')).toHaveTextContent(
      'compared with your visit 3h ago'
    );
  });

  it('omits the company row when the persona has none', () => {
    render(<HomeLoopCanvas {...props()} />);
    expect(screen.queryByRole('region', { name: 'Company' })).toBeNull();
  });

  it('renders every section populated with named headings and counts', () => {
    render(<HomeLoopCanvas {...props()} />);

    expect(screen.getByTestId('home-loop-constraint')).toHaveTextContent(
      '2 items are blocked'
    );
    expect(screen.getAllByTestId(/^home-loop-tile-/)).toHaveLength(7);
    expect(screen.getByTestId('home-loop-tile-prod')).toHaveTextContent(
      'Was 060037d'
    );
    expect(
      screen.getByRole('heading', { name: /Blocked On You/ })
    ).toBeVisible();
    expect(
      screen.getByTestId('home-loop-asks-section-count')
    ).toHaveTextContent('2');
    expect(screen.getAllByTestId('home-loop-kanban-card')).toHaveLength(6);
    expect(screen.getAllByTestId('home-loop-kanban-lane')).toHaveLength(6);
    expect(screen.getByTestId('home-loop-done')).toHaveTextContent('12 merges');
    for (const id of [
      'home-loop-asks-section',
      'home-loop-in-flight-section',
      'home-loop-done-section',
    ])
      expect(screen.getByTestId(id)).toHaveAttribute('data-state', 'populated');
  });

  it('names stage progress and attention for assistive tech, not color alone', () => {
    render(<HomeLoopCanvas {...props()} />);
    const [blocked] = screen.getAllByTestId('home-loop-kanban-card');
    expect(blocked).toHaveAttribute('data-attention', 'blocked');
    expect(blocked).toHaveTextContent('Blocked');
    expect(
      screen.getByRole('region', { name: 'Investigating: 1' })
    ).toContainElement(blocked as HTMLElement);
  });

  it('keeps one frame per section across loading, error, and empty states', () => {
    const { rerender } = render(
      <HomeLoopCanvas
        {...props({ loopStatus: 'loading', asksStatus: 'loading', pulse: [] })}
      />
    );
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    expect(screen.getByTestId('home-loop-constraint')).toHaveAttribute(
      'data-tone',
      'loading'
    );
    expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
      'aria-busy',
      'true'
    );

    const onRetryLoop = vi.fn();
    rerender(
      <HomeLoopCanvas
        {...props({
          loopStatus: 'error',
          asksStatus: 'error',
          pulse: [],
          onRetryLoop,
        })}
      />
    );
    // A failed read never claims the all-clear; the banner names the
    // failure (JOV-9019).
    const banner = screen.getByTestId('home-loop-constraint');
    expect(banner).toHaveTextContent('Shipping data could not load.');
    expect(banner).not.toHaveTextContent('Nothing is blocking shipping');
    expect(banner).toHaveAttribute('data-tone', 'unknown');
    expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
      'data-state',
      'error'
    );
    // Unavailable tiles keep their frames so sections below never move.
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    fireEvent.click(
      within(screen.getByTestId('home-loop-in-flight-section')).getByRole(
        'button',
        {
          name: 'Try again',
        }
      )
    );
    expect(onRetryLoop).toHaveBeenCalledOnce();

    rerender(
      <HomeLoopCanvas
        {...props({
          constraint: null,
          asks: [],
          rows: [],
          done: [],
          doneSummary: null,
        })}
      />
    );
    expect(screen.getByTestId('home-loop-constraint')).toHaveTextContent(
      'Nothing is blocking shipping'
    );
    expect(screen.getByText('Nothing needs your decision.')).toBeVisible();
    expect(screen.getByText('No work in flight.')).toBeVisible();
    expect(screen.getByText('Nothing has landed yet today.')).toBeVisible();
  });

  it('never claims the all-clear while no metric is measured', () => {
    render(
      <HomeLoopCanvas
        {...props({
          constraint: null,
          pulse: HOME_LOOP_FIXTURE_UNMEASURED_PULSE,
        })}
      />
    );
    const banner = screen.getByTestId('home-loop-constraint');
    expect(banner).toHaveTextContent('Shipping status is unknown');
    expect(banner).not.toHaveTextContent('Nothing is blocking shipping');
    expect(banner).toHaveAttribute('data-tone', 'unknown');
  });

  it('lets a constraint with its own read override the shipping loop state', () => {
    const blocker = { tone: 'bad' as const, text: 'Checkout fails' };
    const { rerender } = render(
      <HomeLoopCanvas
        {...props({ loopStatus: 'loading', constraint: blocker })}
        constraintStatus='ready'
      />
    );
    const banner = screen.getByTestId('home-loop-constraint');
    expect(banner).toHaveTextContent('Checkout fails');
    rerender(
      <HomeLoopCanvas
        {...props({ constraint: null })}
        constraintStatus='error'
      />
    );
    expect(banner).toHaveTextContent('Shipping status is unknown');
    expect(banner).toHaveAttribute('data-tone', 'unknown');
  });

  it('answers in one click and sends a written reply', () => {
    const onApprove = vi.fn();
    const onReply = vi.fn();
    render(<HomeLoopCanvas {...props({ onApprove, onReply })} />);
    const [first] = screen.getAllByTestId('home-loop-ask');
    const card = within(first as HTMLElement);

    fireEvent.click(card.getByTestId('home-loop-ask-approve'));
    expect(onApprove).toHaveBeenCalledWith(HOME_LOOP_FIXTURE_ASKS[0]);

    const send = card.getByRole('button', { name: 'Send Reply' });
    expect(send).toBeDisabled();
    fireEvent.change(card.getByRole('textbox'), {
      target: { value: 'Only for production' },
    });
    fireEvent.submit(send.closest('form') as HTMLFormElement);
    expect(onReply).toHaveBeenCalledWith(
      HOME_LOOP_FIXTURE_ASKS[0],
      'Only for production'
    );
  });

  it('fits the asks to their space and links the rest', () => {
    const restore = mockFitLayout('home-loop-asks', 250);
    try {
      const many = Array.from({ length: 5 }, (_, index) => ({
        ...HOME_LOOP_FIXTURE_ASKS[0],
        id: `ask-${index}`,
      })) as HomeLoopCanvasProps['asks'];
      render(
        <HomeLoopCanvas
          {...props({ asks: many, asksMoreHref: '/app/ov/inbox' })}
        />
      );
      const visible = screen
        .getAllByTestId('home-loop-ask')
        .filter(card => card.style.visibility !== 'hidden');
      expect(visible).toHaveLength(2);
      expect(screen.getByTestId('home-loop-asks-more')).toHaveAttribute(
        'href',
        '/app/ov/inbox'
      );
      expect(screen.getByTestId('home-loop-asks-more')).toHaveTextContent(
        '+3 more decisions'
      );
    } finally {
      restore();
    }
  });

  it('keeps the why collapsed until requested', () => {
    render(<HomeLoopCanvas {...props()} />);
    const [first] = screen.getAllByTestId('home-loop-ask');
    const toggle = within(first as HTMLElement).getByRole('button', {
      name: 'Why',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    ).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    ).toBeVisible();
  });

  it('replaces controls with the answer and restores them on failure', () => {
    const { rerender } = render(
      <HomeLoopCanvas
        {...props({
          answers: {
            'vercel-concurrency': { label: 'Approved', state: 'pending' },
          },
        })}
      />
    );
    const [first] = screen.getAllByTestId('home-loop-ask');
    expect(first).toHaveAttribute('data-answer-state', 'pending');
    expect(
      within(first as HTMLElement).queryByTestId('home-loop-ask-approve')
    ).toBeNull();
    expect(
      screen.getByTestId('home-loop-asks-section-count')
    ).toHaveTextContent('1');

    rerender(
      <HomeLoopCanvas
        {...props({
          answers: {
            'vercel-concurrency': {
              label: 'Not recorded. Try again.',
              state: 'failed',
            },
          },
        })}
      />
    );
    const [failed] = screen.getAllByTestId('home-loop-ask');
    expect(within(failed as HTMLElement).getByRole('alert')).toHaveTextContent(
      'Not recorded. Try again.'
    );
    expect(
      within(failed as HTMLElement).getByTestId('home-loop-ask-approve')
    ).toBeVisible();
  });
});
