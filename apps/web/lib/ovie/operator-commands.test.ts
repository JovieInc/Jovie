import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
import {
  buildOperatorCommands,
  isOvieSurface,
  OPERATOR_SEQUENCE_SHORTCUTS,
} from './operator-commands';

describe('operator sequence shortcuts', () => {
  it('binds G then H/I/S/F/C to the five daily destinations from the registry', () => {
    expect(OPERATOR_SEQUENCE_SHORTCUTS.map(s => [s.secondKey, s.href])).toEqual(
      ['overview', 'inbox', 'shipping', 'operations', 'costs'].map(id => {
        const item = ADMIN_NAV_REGISTRY.find(entry => entry.id === id);
        return [
          {
            overview: 'h',
            inbox: 'i',
            shipping: 's',
            operations: 'f',
            costs: 'c',
          }[id as 'overview'],
          item?.href,
        ];
      })
    );
  });

  it('never collides on a second key and never reuses the customer g-sequences', () => {
    const keys = OPERATOR_SEQUENCE_SHORTCUTS.map(s => s.secondKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(OPERATOR_SEQUENCE_SHORTCUTS.every(s => s.firstKey === 'g')).toBe(
      true
    );
  });
});

describe('operator commands', () => {
  it('lists every registry destination once, then the external web tools', () => {
    const commands = buildOperatorCommands();
    const go = commands.filter(c => c.group === 'go');
    expect(go.map(c => c.href)).toEqual(ADMIN_NAV_REGISTRY.map(i => i.href));
    expect(new Set(commands.map(c => c.id)).size).toBe(commands.length);
    expect(
      commands.filter(c => c.group === 'open').every(c => c.external)
    ).toBe(true);
    expect(commands.find(c => c.label === 'Fleet')?.shortcutLabel).toBe(
      'G then F'
    );
    expect(
      commands.find(c => c.label === 'Growth')?.shortcutLabel
    ).toBeUndefined();
  });

  it('recognises Ovie surfaces only', () => {
    expect(isOvieSurface('/app/ov')).toBe(true);
    expect(isOvieSurface('/app/ov/shipping')).toBe(true);
    expect(isOvieSurface('/app/admin/people')).toBe(true);
    expect(isOvieSurface('/app/ovx')).toBe(false);
    expect(isOvieSurface('/app/dashboard')).toBe(false);
    expect(isOvieSurface(null)).toBe(false);
  });
});
