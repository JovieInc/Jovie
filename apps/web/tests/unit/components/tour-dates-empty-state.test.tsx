import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TourDatesEmptyState } from '@/components/features/dashboard/organisms/tour-dates/TourDatesEmptyState';
import { toast } from '@/components/feedback';

const mutations = vi.hoisted(() => ({
  save: { mutateAsync: vi.fn(), isPending: false },
  connect: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('@/lib/queries', () => ({
  useSaveBandsintownApiKeyMutation: () => mutations.save,
  useConnectBandsintownMutation: () => mutations.connect,
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/**
 * JOV-4463: the Bandsintown setup flow lead visual must render the canonical
 * integration icon — an Icon name missing from the registry renders null and
 * leaves an empty rounded square in production.
 */
describe('TourDatesEmptyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutations.save.isPending = false;
    mutations.connect.isPending = false;
    mutations.save.mutateAsync.mockReset().mockResolvedValue({
      success: true,
      message: 'API key saved',
    });
    mutations.connect.mutateAsync.mockReset().mockResolvedValue({
      success: true,
      message: 'Tour dates connected',
      tourDates: [],
    });
  });

  describe('API key step', () => {
    it('uses the shared empty-state anatomy with a rendered lead icon', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey={false} />);

      const empty = screen.getByTestId('tour-dates-empty-state-api-key');
      expect(empty).toHaveAttribute(
        'data-empty-state-presentation',
        'workspace'
      );
      expect(
        screen.getByRole('heading', { name: 'Set Up Bandsintown Integration' })
      ).toBeInTheDocument();
      // JOV-4463: a missing Icon registry entry renders null.
      expect(empty.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
      expect(
        screen.getByRole('link', { name: 'artists.bandsintown.com' })
      ).toHaveAttribute('href', 'https://artists.bandsintown.com');
    });

    it('preserves the secure-key disclosure', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey={false} />);

      expect(
        screen.getByText(/encrypted and stored securely/i)
      ).toBeInTheDocument();
    });

    it('has one primary action', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey={false} />);

      expect(
        screen.getByRole('button', { name: /save api key/i })
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });

  describe('artist connect step', () => {
    it('uses the shared empty-state anatomy with a rendered lead icon', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey />);

      const empty = screen.getByTestId('tour-dates-empty-state-connect');
      expect(empty).toHaveAttribute(
        'data-empty-state-presentation',
        'workspace'
      );
      expect(
        screen.getByRole('heading', { name: 'Connect Your Tour Dates' })
      ).toBeInTheDocument();
      expect(empty.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
      expect(
        screen.getByRole('textbox', { name: 'Bandsintown Artist Name' })
      ).toBeInTheDocument();
    });

    it('has one primary action', () => {
      render(<TourDatesEmptyState profileId='profile-1' hasApiKey />);

      expect(
        screen.getByRole('button', { name: /connect bandsintown/i })
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });
});

const steps = [
  {
    name: 'API key',
    hasApiKey: false,
    label: 'Bandsintown API Key',
    action: /save api key/i,
    pendingAction: /saving/i,
    field: 'apiKey',
    mutation: mutations.save,
  },
  {
    name: 'artist connection',
    hasApiKey: true,
    label: 'Bandsintown Artist Name',
    action: /connect bandsintown/i,
    pendingAction: /connecting/i,
    field: 'artistName',
    mutation: mutations.connect,
  },
] as const;

for (const step of steps) {
  describe(`${step.name} interactions`, () => {
    const onConnected = vi.fn();
    const onApiKeySaved = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      mutations.save.isPending = false;
      mutations.connect.isPending = false;
      step.mutation.mutateAsync.mockReset().mockResolvedValue({
        success: true,
        message: 'Saved',
        tourDates: [],
      });
    });

    function renderStep() {
      return render(
        <TourDatesEmptyState
          profileId='synthetic-tour-profile'
          hasApiKey={step.hasApiKey}
          onConnected={onConnected}
          onApiKeySaved={onApiKeySaved}
        />
      );
    }

    it.each([{ isComposing: true }, { keyCode: 229 }])(
      'does not submit Enter while choosing an IME composition candidate (%j)',
      async composition => {
        renderStep();
        const input = screen.getByLabelText(step.label);
        fireEvent.change(input, { target: { value: 'synthetic-value' } });
        fireEvent.keyDown(input, { key: 'Enter', ...composition });
        expect(step.mutation.mutateAsync).not.toHaveBeenCalled();

        fireEvent.keyDown(input, { key: 'Enter', isComposing: false });
        await waitFor(() =>
          expect(step.mutation.mutateAsync).toHaveBeenCalledExactlyOnceWith({
            [step.field]: 'synthetic-value',
          })
        );
      }
    );

    it('submits trimmed input by keyboard and calls the matching success callback', async () => {
      const user = userEvent.setup();
      renderStep();
      const input = screen.getByLabelText(step.label);
      await user.type(input, '  synthetic-value  ');
      await user.keyboard('{Enter}');

      expect(step.mutation.mutateAsync).toHaveBeenCalledExactlyOnceWith({
        [step.field]: 'synthetic-value',
      });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved'));
      if (step.hasApiKey) {
        expect(onConnected).toHaveBeenCalledExactlyOnceWith([]);
        expect(onApiKeySaved).not.toHaveBeenCalled();
      } else {
        expect(onApiKeySaved).toHaveBeenCalledOnce();
        expect(onConnected).not.toHaveBeenCalled();
        expect(input).toHaveValue('');
      }
    });

    it('submits by the visible primary button', async () => {
      const user = userEvent.setup();
      renderStep();
      await user.type(screen.getByLabelText(step.label), 'synthetic-value');
      await user.click(screen.getByRole('button', { name: step.action }));
      expect(step.mutation.mutateAsync).toHaveBeenCalledExactlyOnceWith({
        [step.field]: 'synthetic-value',
      });
    });

    it('rejects whitespace without calling the mutation', () => {
      renderStep();
      const input = screen.getByLabelText(step.label);
      fireEvent.change(input, { target: { value: '   ' } });
      expect(screen.getByRole('button', { name: step.action })).toBeDisabled();
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(step.mutation.mutateAsync).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledOnce();
    });

    it('disables the input and action during the existing pending state', () => {
      step.mutation.isPending = true;
      renderStep();
      expect(screen.getByLabelText(step.label)).toBeDisabled();
      expect(
        screen.getByRole('button', { name: step.pendingAction })
      ).toBeDisabled();
    });

    it.each(['rejected request', 'unsuccessful response'])(
      'keeps the input available for retry after an %s',
      async failure => {
        if (failure === 'rejected request') {
          step.mutation.mutateAsync.mockRejectedValueOnce(
            new Error('Synthetic failure')
          );
        } else {
          step.mutation.mutateAsync.mockResolvedValueOnce({
            success: false,
            message: 'Synthetic provider failure',
          });
        }
        const user = userEvent.setup();
        renderStep();
        const input = screen.getByLabelText(step.label);
        await user.type(input, 'synthetic-value');
        await user.click(screen.getByRole('button', { name: step.action }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
        expect(input).toHaveValue('synthetic-value');
        expect(input).toBeEnabled();
        expect(onConnected).not.toHaveBeenCalled();
        expect(onApiKeySaved).not.toHaveBeenCalled();
      }
    );
  });
}
