import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectDogfoodDocument } from './dogfood-dom';
import { scanDogfood } from './dogfood-scanners';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
describe('read-only dogfood DOM collection', () => {
  it('collects visible copy, heights, titles and populated table columns', () => {
    document.title = 'Inbox | Jovie';
    document.body.innerHTML = `<h1>Inbox</h1><p>lifestyle_only</p>
      <p hidden>hidden_enum</p><div style="display:none"><span>hidden_enum</span></div>
      <script type="application/json">{"internal":"data"}</script>
      <textarea>editable_enum</textarea><button>High priority</button>
      <table><thead><tr><th>Rank</th><th>Actions</th><th>Clicks</th></tr></thead>
      <tbody><tr><td>—</td><td><button aria-label="Open"></button></td><td>0</td></tr></tbody></table>`;
    // jsdom has no layout engine. Geometry is an explicit synthetic measurement.
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue({
      length: 1,
    } as DOMRectList);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 29,
    } as DOMRect);
    const sample = collectDogfoodDocument({
      id: 'dom-fixture',
      navLabel: 'Inbox',
      brand: 'Jovie',
    });
    expect(sample.visibleText).toContain('lifestyle_only');
    expect(sample.visibleText.join(' ')).not.toMatch(
      /hidden_enum|editable_enum|internal/
    );
    expect(sample.columns.map(column => column.cells)).toEqual([
      ['—'],
      ['interactive'],
      ['0'],
    ]);
    expect(scanDogfood([sample]).counts).toEqual({
      machineText: 1,
      routeTitle: 0,
      buttonHeight: 1,
      casing: 1,
      emptyColumn: 1,
    });
  });
});
