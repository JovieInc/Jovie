import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

describe('Card state compositions', () => {
  it('keeps the header and one next action in an empty data card', () => {
    render(
      <Card data-testid='card'>
        <CardHeader>
          <CardTitle>Upcoming releases</CardTitle>
          <CardDescription>Nothing scheduled yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <button type='button'>Add a release</button>
        </CardContent>
      </Card>
    );

    expect(
      screen.getByRole('heading', { name: 'Upcoming releases' })
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing scheduled yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add a release' })
    ).toBeInTheDocument();
  });

  it('clamps a long right-to-left title inside the card', () => {
    render(
      <div dir='rtl'>
        <Card data-testid='card'>
          <CardHeader>
            <CardTitle maxLines={2}>
              دليل الإيرادات للفنانين المستقلين لحملات الإصدار متعددة المنصات
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    );

    const title = screen.getByRole('heading', { level: 3 });
    expect(title).toHaveClass('line-clamp-2');
    expect(title).toHaveAttribute('data-content-length', 'long');
    expect(screen.getByTestId('card')).toHaveClass('min-w-0', 'max-w-full');
  });
});

describe('Card accessibility', () => {
  it('has no axe violations for default, empty, long, partial and RTL cards', async () => {
    const { container } = render(
      <main>
        <Card asChild>
          <article>
            <CardHeader>
              <CardTitle asChild>
                <h2>Audience insights</h2>
              </CardTitle>
              <CardDescription>Last synced 2m ago</CardDescription>
            </CardHeader>
            <CardContent>12.4K profile views</CardContent>
          </article>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>Upcoming releases</h2>
            </CardTitle>
            <CardDescription>Nothing scheduled yet.</CardDescription>
          </CardHeader>
          <CardFooter>
            <button type='button'>Add a release</button>
          </CardFooter>
        </Card>
        <Card className='max-w-xs'>
          <CardHeader>
            <CardTitle asChild maxLines={2}>
              <h2>
                Independent Artist Revenue Playbook for Multi-Platform Release
                Campaigns
              </h2>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card contentState='partial'>
          <CardContent>Showing cached metrics</CardContent>
        </Card>
        <div dir='rtl' lang='ar'>
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>ملخص الفواتير</h2>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
        <Card variant='hoverable' asChild>
          <a href='#release'>
            <CardContent>Open release</CardContent>
          </a>
        </Card>
      </main>
    );

    await expectNoA11yViolations(container);
  });
});
