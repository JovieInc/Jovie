import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DataCard } from './DataCard';

describe('DataCard certificate', () => {
  it('renders every slot and keeps the action usable', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { container } = render(
      <DataCard
        title='soundcloud.com/johndoe'
        subtitle='SoundCloud Profile'
        metadata='Last checked 3 minutes ago'
        badge='Verified'
        badgeVariant='success'
        actions={
          <Button size='sm' onClick={onEdit}>
            Edit
          </Button>
        }
      >
        <p>3 releases linked</p>
      </DataCard>
    );

    expect(screen.getByText('soundcloud.com/johndoe')).toHaveAttribute(
      'title',
      'soundcloud.com/johndoe'
    );
    expect(screen.getByText('Verified')).toHaveClass('text-success-text');
    expect(screen.getByText('3 releases linked')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('skips blank optional text for a partial card', async () => {
    const { container } = render(
      <DataCard
        title='spotify.com/artist/johndoe'
        subtitle='  '
        metadata=''
        badge=' '
      />
    );

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('.rounded-full')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('truncates long text with a title and stays axe-clean in RTL', async () => {
    const longTitle =
      'soundcloud.com/johndoe-official-artist-account-with-a-very-long-handle';
    const { container } = render(
      <div>
        <DataCard
          title={longTitle}
          subtitle='Connected from the label catalog import'
        />
        <div dir='rtl' lang='ar'>
          <DataCard title='ملف أنغامي' badge='خطأ' badgeVariant='error' />
        </div>
      </div>
    );

    expect(screen.getByText(longTitle)).toHaveClass('truncate');
    expect(
      screen.getByText('Connected from the label catalog import')
    ).toHaveAttribute('title', 'Connected from the label catalog import');
    expect(screen.getByText('خطأ')).toHaveClass('text-error-text');
    await expectNoA11yViolations(container);
  });
});
