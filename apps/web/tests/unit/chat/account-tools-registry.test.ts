import { describe, expect, it } from 'vitest';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import { TOOL_UI_REGISTRY } from '@/lib/chat/tool-ui-registry';

describe('account chat tools registry', () => {
  it('registers account status, usage, and billing portal schemas', () => {
    expect(
      TOOL_SCHEMAS.showAccountStatus.inputSchema.safeParse({}).success
    ).toBe(true);
    expect(TOOL_SCHEMAS.showUsage.inputSchema.safeParse({}).success).toBe(true);
    expect(
      TOOL_SCHEMAS.openBillingPortal.inputSchema.safeParse({}).success
    ).toBe(true);
  });

  it('registers status UI metadata for account tools', () => {
    expect(TOOL_UI_REGISTRY.showAccountStatus).toMatchObject({
      label: 'Account',
      renderer: 'status',
    });
    expect(TOOL_UI_REGISTRY.showUsage).toMatchObject({
      label: 'Usage',
      renderer: 'status',
    });
    expect(TOOL_UI_REGISTRY.openBillingPortal).toMatchObject({
      label: 'Billing',
      renderer: 'status',
    });
  });
});
