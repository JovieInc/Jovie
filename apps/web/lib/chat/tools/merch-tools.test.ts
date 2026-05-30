import { describe, expect, it } from 'vitest';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';

describe('merch tool schemas', () => {
  it('createMerch has valid input schema', () => {
    const schema = TOOL_SCHEMAS.createMerch.inputSchema;
    expect(schema).toBeDefined();

    // Valid input
    const valid = schema.safeParse({
      prompt: 'tour merchandise',
      itemType: 'hoodie',
      makeLive: false,
    });
    expect(valid.success).toBe(true);
  });

  it('createMerch accepts minimal input', () => {
    const schema = TOOL_SCHEMAS.createMerch.inputSchema;
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('previewMerchOptions has valid input schema', () => {
    const schema = TOOL_SCHEMAS.previewMerchOptions.inputSchema;
    expect(schema).toBeDefined();

    const result = schema.safeParse({
      prompt: 'show me some hoodie ideas',
    });
    expect(result.success).toBe(true);
  });

  it('selectMerchDesign requires generationId', () => {
    const schema = TOOL_SCHEMAS.selectMerchDesign.inputSchema;
    expect(schema).toBeDefined();

    // Missing both optionNumber and optionId
    const invalid = schema.safeParse({
      generationId: '00000000-0000-0000-0000-000000000000',
    });
    expect(invalid.success).toBe(false);

    // With optionNumber
    const valid = schema.safeParse({
      generationId: '00000000-0000-0000-0000-000000000000',
      optionNumber: 1,
    });
    expect(valid.success).toBe(true);

    // With optionId
    const validById = schema.safeParse({
      generationId: '00000000-0000-0000-0000-000000000000',
      optionId: '00000000-0000-0000-0000-000000000001',
    });
    expect(validById.success).toBe(true);
  });

  it('selectMerchDesign rejects non-uuid generationId', () => {
    const schema = TOOL_SCHEMAS.selectMerchDesign.inputSchema;
    const result = schema.safeParse({
      generationId: 'not-a-uuid',
      optionNumber: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('TOOL_SCHEMAS descriptions', () => {
  it('createMerch has a useful description', () => {
    expect(TOOL_SCHEMAS.createMerch.description.length).toBeGreaterThan(10);
    expect(TOOL_SCHEMAS.createMerch.description).toContain('merch');
  });

  it('previewMerchOptions has a useful description', () => {
    expect(TOOL_SCHEMAS.previewMerchOptions.description.length).toBeGreaterThan(
      10
    );
    expect(TOOL_SCHEMAS.previewMerchOptions.description).toContain('merch');
  });

  it('selectMerchDesign has a useful description', () => {
    expect(TOOL_SCHEMAS.selectMerchDesign.description.length).toBeGreaterThan(
      10
    );
    expect(TOOL_SCHEMAS.selectMerchDesign.description).toContain('option');
  });
});
