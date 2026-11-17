import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CompactGlassModule } from './CompactGlassModule';

describe('CompactGlassModule certificate', () => {
  it('renders unlabeled content axe-clean', async () => {
    const { container } = render(
      <CompactGlassModule>
        <p>Release alerts</p>
      </CompactGlassModule>
    );

    expect(screen.getByText('Release alerts')).toBeInTheDocument();
    expect(container.querySelector('.compact-glass-module__label')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long label whole beside its content', async () => {
    const label =
      'Fans who opt in hear about every release, show and drop first, before anyone else';
    const { container } = render(
      <CompactGlassModule label={label} className='w-full'>
        <p>Release alerts</p>
      </CompactGlassModule>
    );

    expect(screen.getByText(label)).toHaveClass('compact-glass-module__label');
    expect(container.querySelector('.compact-glass-module')).toHaveClass(
      'w-full'
    );
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic label right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CompactGlassModule label='تحديثات المعجبين'>
          <p>تنبيهات الإصدار</p>
        </CompactGlassModule>
      </div>
    );

    expect(screen.getByText('تحديثات المعجبين')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
