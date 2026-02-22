import { describe, expect, it } from 'vitest';

import {
  createProfileEditTool,
  EDITABLE_FIELDS,
  FIELD_DESCRIPTIONS,
  type ProfileEditContext,
} from '@/lib/ai/tools/profile-edit';

const testContext: ProfileEditContext = {
  displayName: 'Test Artist',
  bio: 'A cool bio about this artist.',
};

/** Helper to call execute and unwrap the result (AI SDK types include AsyncIterable union). */
async function executeTool(
  context: ProfileEditContext,
  args: { field: 'displayName' | 'bio'; newValue: string; reason?: string }
) {
  const tool = createProfileEditTool(context);
  const execute = tool.execute!;
  const result = await execute(args, {
    toolCallId: `test-${args.field}`,
    messages: [],
    abortSignal: new AbortController().signal,
  });
  // Result is the plain object (not AsyncIterable) when execute returns directly
  return result as {
    success: boolean;
    preview: {
      field: string;
      fieldLabel: string;
      currentValue: string | null;
      newValue: string;
      reason: string | undefined;
    };
  };
}

describe('createProfileEditTool', () => {
  it('returns a tool with description and execute function', () => {
    const tool = createProfileEditTool(testContext);

    expect(tool).toHaveProperty('description');
    expect(tool).toHaveProperty('execute');
    expect(typeof tool.execute).toBe('function');
    expect(tool.description).toContain('profile edit');
  });

  it('returns preview with displayName field', async () => {
    const result = await executeTool(testContext, {
      field: 'displayName',
      newValue: 'New Name',
      reason: 'Better branding',
    });

    expect(result).toEqual({
      success: true,
      preview: {
        field: 'displayName',
        fieldLabel: 'Display name shown on your profile',
        currentValue: 'Test Artist',
        newValue: 'New Name',
        reason: 'Better branding',
      },
    });
  });

  it('returns preview with bio field', async () => {
    const result = await executeTool(testContext, {
      field: 'bio',
      newValue: 'Updated bio text',
    });

    expect(result).toEqual({
      success: true,
      preview: {
        field: 'bio',
        fieldLabel: 'Artist bio/description',
        currentValue: 'A cool bio about this artist.',
        newValue: 'Updated bio text',
        reason: undefined,
      },
    });
  });

  it('returns null currentValue when bio is null', async () => {
    const contextWithNullBio: ProfileEditContext = {
      displayName: 'Artist',
      bio: null,
    };

    const result = await executeTool(contextWithNullBio, {
      field: 'bio',
      newValue: 'Brand new bio',
    });

    expect(result.preview.currentValue).toBeNull();
  });

  it('includes fieldLabel from FIELD_DESCRIPTIONS for each field', async () => {
    for (const field of EDITABLE_FIELDS.tier1) {
      const result = await executeTool(testContext, {
        field,
        newValue: 'test',
      });

      expect(result.preview.fieldLabel).toBe(FIELD_DESCRIPTIONS[field]);
    }
  });

  it('omits reason from preview when not provided', async () => {
    const result = await executeTool(testContext, {
      field: 'displayName',
      newValue: 'X',
    });

    expect(result.preview.reason).toBeUndefined();
  });
});

describe('EDITABLE_FIELDS', () => {
  it('tier1 contains displayName and bio', () => {
    expect(EDITABLE_FIELDS.tier1).toContain('displayName');
    expect(EDITABLE_FIELDS.tier1).toContain('bio');
  });

  it('blocked contains username and genres', () => {
    expect(EDITABLE_FIELDS.blocked).toContain('username');
    expect(EDITABLE_FIELDS.blocked).toContain('genres');
  });
});
