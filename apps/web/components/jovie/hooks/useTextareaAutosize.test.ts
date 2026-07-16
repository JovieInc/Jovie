import { describe, expect, it } from 'vitest';
import { getTextareaMeasurementText } from './useTextareaAutosize';

describe('getTextareaMeasurementText', () => {
  it('does not add a second visual row to a single-line slash query', () => {
    expect(getTextareaMeasurementText('/')).toBe('/\u200b');
    expect(getTextareaMeasurementText('/').split('\n')).toHaveLength(1);
  });

  it('preserves an intentional trailing newline for measurement', () => {
    expect(getTextareaMeasurementText('line\n')).toBe('line\n\u200b');
    expect(getTextareaMeasurementText('line\n').split('\n')).toHaveLength(2);
  });
});
