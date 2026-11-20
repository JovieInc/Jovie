import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceLocationCell } from './AudienceLocationCell';

function renderCell(node: ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{node}</TooltipProvider>);
}

describe('AudienceLocationCell', () => {
  it('decodes an encoded location label', async () => {
    const { container } = renderCell(
      <AudienceLocationCell locationLabel='S%C3%A3o%20Paulo%2C%20BR' />
    );

    expect(screen.getByText('São Paulo, BR')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the raw label when decoding fails', async () => {
    const { container } = renderCell(
      <AudienceLocationCell locationLabel='S%E3o Paulo' />
    );

    expect(screen.getByText('S%E3o Paulo')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows Unknown when there is no location', async () => {
    const { container } = renderCell(
      <AudienceLocationCell locationLabel={null} className='custom' />
    );

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(container.querySelector('.custom')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps an RTL place name readable', async () => {
    const { container } = renderCell(
      <div dir='rtl'>
        <AudienceLocationCell locationLabel='دبي، الإمارات' />
      </div>
    );

    expect(screen.getByText('دبي، الإمارات')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
