import { describe, expect, it } from 'vitest';
import { homepageWhatYouGet } from '@/lib/flags/homepage';

describe('homepage flags exports', () => {
  it('defines homepageWhatYouGet flag function', () => {
    expect(homepageWhatYouGet).toBeTypeOf('function');
  });
});
