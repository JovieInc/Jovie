import { describe, expect, it } from 'vitest';
import { headerTextClass } from '@/components/atoms/HeaderText';

describe('headerTextClass', () => {
  it('returns base text classes', () => {
    const result = headerTextClass({});
    expect(result).toContain('text-[14px]');
    expect(result).toContain('font-medium');
    expect(result).toContain('leading-5');
    expect(result).toContain('tracking-[-0.01em]');
  });

  it('returns primary tone classes by default', () => {
    const result = headerTextClass({});
    expect(result).toContain('text-primary-token');
  });

  it('returns primary tone classes when explicitly set', () => {
    const result = headerTextClass({ tone: 'primary' });
    expect(result).toContain('text-primary-token');
  });

  it('returns secondary tone classes', () => {
    const result = headerTextClass({ tone: 'secondary' });
    expect(result).toContain('text-secondary-token');
    expect(result).not.toContain('text-primary-token');
  });

  it('appends custom className', () => {
    const result = headerTextClass({ className: 'mt-4 px-2' });
    expect(result).toContain('mt-4');
    expect(result).toContain('px-2');
  });

  it('combines tone and custom className', () => {
    const result = headerTextClass({
      tone: 'secondary',
      className: 'extra-class',
    });
    expect(result).toContain('text-secondary-token');
    expect(result).toContain('extra-class');
  });
});
