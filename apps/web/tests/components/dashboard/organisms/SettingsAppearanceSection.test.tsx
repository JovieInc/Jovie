import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsAppearanceSection } from '@/components/dashboard/organisms/SettingsAppearanceSection';

const setThemeMock = vi.fn();
const updateThemeMock = vi.fn();
const setHighContrastMock = vi.fn();
const saveHighContrastMock = vi.fn();

const themeState = {
  theme: 'system',
  resolvedTheme: 'dark',
};

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: themeState.theme,
    resolvedTheme: themeState.resolvedTheme,
    setTheme: setThemeMock,
  }),
}));

vi.mock('@/lib/hooks/useHighContrast', () => ({
  useHighContrast: () => ({
    isHighContrast: false,
    setHighContrast: setHighContrastMock,
  }),
}));

vi.mock('@/lib/queries', () => ({
  useThemeMutation: () => ({
    updateTheme: updateThemeMock,
    isPending: false,
  }),
  useHighContrastMutation: () => ({
    setHighContrast: saveHighContrastMock,
    isPending: false,
  }),
}));

describe('SettingsAppearanceSection', () => {
  const renderSection = () =>
    render(
      <TooltipProvider>
        <SettingsAppearanceSection />
      </TooltipProvider>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    themeState.theme = 'system';
    themeState.resolvedTheme = 'dark';
  });

  it('renders all appearance controls including resolved system value', () => {
    renderSection();

    expect(screen.getByTestId('theme-option-light')).toBeInTheDocument();
    expect(screen.getByTestId('theme-option-dark')).toBeInTheDocument();
    expect(screen.getByTestId('theme-option-system')).toBeInTheDocument();
    expect(screen.getAllByText('Dark').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByLabelText('Toggle high contrast mode')
    ).toBeInTheDocument();
  });

  it('updates persisted theme when an option is selected', () => {
    renderSection();

    fireEvent.click(screen.getByTestId('theme-option-light'));

    expect(setThemeMock).toHaveBeenCalledWith('light');
    expect(updateThemeMock).toHaveBeenCalledWith('light', false);
  });
});
