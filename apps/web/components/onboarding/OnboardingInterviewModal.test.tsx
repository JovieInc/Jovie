import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { OnboardingInterviewModal } from './OnboardingInterviewModal';

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/start',
  useRouter: () => router,
}));

const SESSION_KEY = 'jovie_onboarding_interview_submitted';
const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal'
);

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
});

afterAll(() => {
  if (originalShowModal) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      originalShowModal
    );
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  }
});

beforeEach(() => {
  window.sessionStorage.clear();
  router.replace.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderInterview() {
  return render(
    <StrictMode>
      <OnboardingInterviewModal initialRequested />
    </StrictMode>
  );
}

function mockFetch() {
  const fetchMock = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function answerEveryQuestion() {
  const answer = 'Pain.';

  for (let steps = 0; steps < 8; steps += 1) {
    const nextButton = screen.queryByRole('button', { name: 'Next' });
    if (!nextButton) break;
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: answer },
    });
    fireEvent.click(nextButton);
  }

  expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: answer },
  });
  const sendButton = screen.getByRole('button', { name: 'Send' });
  sendButton.focus();
  fireEvent.click(sendButton);
}

describe('OnboardingInterviewModal submission recovery', () => {
  it('closes and marks the interview submitted after a successful response', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    renderInterview();

    answerEveryQuestion();

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Quick Interview' })
      ).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBe('1');
  });

  it('submits the current answer when the user ends the interview early', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    renderInterview();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'A partial answer.' },
    });

    await user.click(screen.getByRole('button', { name: 'End Interview' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Quick Interview' })
      ).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe('string');
    const transcript = (
      JSON.parse(body as string) as {
        transcript: Array<{ answer: string | null }>;
      }
    ).transcript;
    expect(transcript).toHaveLength(1);
    expect(transcript[0]?.answer).toBe('A partial answer.');
  });

  it.each([400, 500])(
    'keeps the transcript available for retry after HTTP %i',
    async status => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValue(new Response(null, { status }));
      renderInterview();

      answerEveryQuestion();

      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(
        screen.getByRole('dialog', { name: 'Quick Interview' })
      ).toBeTruthy();
      const retryButton = screen.getByRole('button', {
        name: 'Retry interview submission',
      });
      expect(retryButton).toBeTruthy();
      expect(retryButton).toBe(document.activeElement);
      expect(screen.getByRole('textbox')).toHaveValue('Pain.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    }
  );

  it('retries the exact transcript after a network rejection without duplicate requests', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    renderInterview();

    answerEveryQuestion();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const originalBody = fetchMock.mock.calls[0]?.[1]?.body;

    await user.click(
      screen.getByRole('button', { name: 'Retry interview submission' })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(originalBody);
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Quick Interview' })
      ).toBeNull();
    });
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBe('1');
  });

  it('allows exiting without sending after a failed submission', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    renderInterview();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'A partial answer.' },
    });

    await user.click(screen.getByRole('button', { name: 'End Interview' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    const exitButton = screen.getByRole('button', {
      name: 'Exit without sending',
    });
    expect(exitButton).toBe(document.activeElement);
    await user.click(exitButton);

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Quick Interview' })
      ).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('lets an empty interview exit without a submission marker', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderInterview();

    await user.click(screen.getByRole('button', { name: 'End Interview' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Quick Interview' })
      ).toBeNull();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
