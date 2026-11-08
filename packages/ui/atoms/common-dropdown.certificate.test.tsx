import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { CommonDropdown } from './common-dropdown';
import type { CommonDropdownItem } from './common-dropdown-types';

const capturedDropdownContentProps = vi.hoisted(
  () => [] as Array<Record<string, unknown>>
);
const capturedContextContentProps = vi.hoisted(
  () => [] as Array<Record<string, unknown>>
);

vi.mock('@radix-ui/react-dropdown-menu', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@radix-ui/react-dropdown-menu')>();
  const RecordingContent = React.forwardRef<
    React.ComponentRef<typeof actual.Content>,
    React.ComponentPropsWithoutRef<typeof actual.Content>
  >((props, ref) => {
    capturedDropdownContentProps.push(props as Record<string, unknown>);
    return <actual.Content ref={ref} {...props} />;
  });
  RecordingContent.displayName = 'RecordingDropdownContent';
  return { ...actual, Content: RecordingContent };
});

vi.mock('@radix-ui/react-context-menu', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@radix-ui/react-context-menu')>();
  const RecordingContent = React.forwardRef<
    React.ComponentRef<typeof actual.Content>,
    React.ComponentPropsWithoutRef<typeof actual.Content>
  >((props, ref) => {
    capturedContextContentProps.push(props as Record<string, unknown>);
    return <actual.Content ref={ref} {...props} />;
  });
  RecordingContent.displayName = 'RecordingContextContent';
  return { ...actual, Content: RecordingContent };
});

// Basic action items for testing
const basicItems: CommonDropdownItem[] = [
  { type: 'action', id: 'edit', label: 'Edit', onClick: vi.fn() },
  { type: 'separator', id: 'sep-1' },
  {
    type: 'action',
    id: 'delete',
    label: 'Delete',
    onClick: vi.fn(),
    variant: 'destructive',
  },
];

describe('CommonDropdown accessibility', () => {
  // The menu portals to document.body outside any page landmark, so axe runs
  // on the trigger's container and on the opened menu element itself.
  it('has no axe violations when open', async () => {
    const { container } = render(
      <CommonDropdown items={basicItems} open modal={false} />
    );
    const menu = await screen.findByRole('menu');
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(menu);
  });

  it('has no axe violations with long right-to-left labels', async () => {
    const { container } = render(
      <div dir='rtl'>
        <CommonDropdown
          aria-label='إجراءات الإصدار'
          items={[
            {
              type: 'action',
              id: 'rtl-copy',
              label: 'نسخ الرابط الذكي لمشاركته مع الجمهور وقوائم التشغيل',
              onClick: vi.fn(),
            },
          ]}
          open
          modal={false}
        />
      </div>
    );
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(await screen.findByRole('menu'));
  });
});
