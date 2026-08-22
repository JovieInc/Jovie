import { describe, expect, it } from 'vitest';
import {
  ARTIST_JOVIE_TOOLS,
  assertIsolatedToolAllowed,
  authorizeIsolatedTool,
  customerJovieCanAccessSummerTools,
  IsolatedMemory,
  IsolationError,
  JOVIE_ARTIST_NAMESPACE,
  operatorContextVisibleToCustomerJovie,
  readIsolatedMemory,
  SUMMER_MEMORY_NAMESPACE,
} from '@/lib/ovie/isolation';

describe('operator/customer isolation (JOV-5212)', () => {
  it('keeps Summer memory unreadable from customer Jovie', () => {
    const summer = new IsolatedMemory(SUMMER_MEMORY_NAMESPACE);
    const jovie = new IsolatedMemory(JOVIE_ARTIST_NAMESPACE);
    summer.write('tim-operator-note', 'kanban priority');
    jovie.write('fan-name', 'Avery');

    expect(
      readIsolatedMemory(summer, SUMMER_MEMORY_NAMESPACE, 'tim-operator-note')
    ).toBe('kanban priority');
    expect(() =>
      readIsolatedMemory(summer, JOVIE_ARTIST_NAMESPACE, 'tim-operator-note')
    ).toThrow(IsolationError);
    expect(jovie.read('tim-operator-note')).toBeUndefined();
    expect(operatorContextVisibleToCustomerJovie()).toBe(false);
    expect(customerJovieCanAccessSummerTools()).toBe(false);
  });

  it('blocks Summer tools on customer Jovie and artist tools on Summer', () => {
    expect(
      authorizeIsolatedTool(JOVIE_ARTIST_NAMESPACE, 'get_org_state')
    ).toEqual({ allowed: false });
    expect(
      authorizeIsolatedTool(SUMMER_MEMORY_NAMESPACE, 'get_org_state')
    ).toEqual({ allowed: true });
    expect(
      authorizeIsolatedTool(SUMMER_MEMORY_NAMESPACE, ARTIST_JOVIE_TOOLS[0])
    ).toEqual({ allowed: false });
    expect(() =>
      assertIsolatedToolAllowed(JOVIE_ARTIST_NAMESPACE, 'search_gbrain')
    ).toThrow(/Customer Jovie cannot access Summer/);
    expect(() =>
      assertIsolatedToolAllowed(SUMMER_MEMORY_NAMESPACE, 'merchPropose')
    ).toThrow(/artist Jovie tools/);
  });
});
