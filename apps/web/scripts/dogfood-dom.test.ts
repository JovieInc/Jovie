import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectDogfoodDocument } from './dogfood-dom';
import { scanDogfood } from './dogfood-scanners';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
describe('read-only dogfood DOM collection', () => {
  beforeEach(() => {
    // jsdom has no layout engine. Geometry is an explicit synthetic measurement.
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue({
      length: 1,
    } as DOMRectList);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 29,
    } as DOMRect);
  });
  const collect = () =>
    collectDogfoodDocument({
      id: 'dom-fixture',
      navLabel: 'Inbox',
      brand: 'Jovie',
    });

  it.each(['', 'plaintext-only', 'true'])(
    'excludes the entire contenteditable="%s" draft subtree',
    value => {
      document.body.innerHTML = `<p>Published copy</p><div contenteditable="${value}">private_draft<span>nested_draft</span><span contenteditable="false">private_widget</span><button>private_button</button><h1>private_heading</h1></div><textarea>private_input</textarea>`;
      const sample = collect();
      expect(sample.visibleText).toEqual(['Published copy']);
      expect(JSON.stringify(sample)).not.toContain('private_');
      expect(JSON.stringify(sample)).not.toContain('nested_draft');
    }
  );

  it('respects native effective editability without relying on attribute spelling', () => {
    document.body.innerHTML =
      '<p>Published copy</p><div><span>private_draft</span></div>';
    Object.defineProperty(document.querySelector('div'), 'isContentEditable', {
      value: true,
    });
    expect(collect().visibleText).toEqual(['Published copy']);
  });

  it('detects JSON split across contiguous syntax-highlight spans', () => {
    document.body.innerHTML =
      '<p><span>{</span><span>"</span><span>id</span><span>"</span><span>:</span><span>"</span><span>x</span><span>"</span><span>}</span></p>';
    const sample = collect();
    expect(sample.visibleText).toEqual(['{"id":"x"}']);
    expect(scanDogfood([sample]).counts.machineText).toBe(1);
  });

  it('does not concatenate across blocks, explicit line breaks or excluded editors', () => {
    document.body.innerHTML =
      '<p>{</p><p>"</p><div><span>{</span><br><span>"</span></div><div>{<span style="display:block">separate</span>"</div><p>{<span contenteditable="">private_draft</span>"</p>';
    const sample = collect();
    expect(sample.visibleText).toEqual([
      '{',
      '"',
      '{',
      '"',
      '{',
      'separate',
      '"',
      '{',
      '"',
    ]);
    expect(scanDogfood([sample]).counts.machineText).toBe(0);
  });
  it('collects visible copy, heights, titles and populated table columns', () => {
    document.title = 'Inbox | Jovie';
    document.body.innerHTML = `<h1>Inbox</h1><p>lifestyle_only</p>
      <p hidden>hidden_enum</p><div style="display:none"><span>hidden_enum</span></div>
      <script type="application/json">{"internal":"data"}</script>
      <textarea>editable_enum</textarea><button>High priority</button>
      <table><thead><tr><th>Rank</th><th>Actions</th><th>Clicks</th></tr></thead>
      <tbody><tr><td>—</td><td><button aria-label="Open"></button></td><td>0</td></tr></tbody></table>`;
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
