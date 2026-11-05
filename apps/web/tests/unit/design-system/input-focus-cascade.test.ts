import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AnyNode, parse, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const globals = parse(
  readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
);
const designSystem = parse(
  readFileSync(join(process.cwd(), 'styles/design-system.css'), 'utf8')
);
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const ownerSelector =
  '.composite-field:has(:is(input, textarea, select):focus-visible)';
const resetSelector =
  '.composite-field :is(input, textarea, select):is(:focus, :focus-visible)';

function ancestor(rule: Rule, name: string): string | undefined {
  let node: AnyNode | undefined = rule.parent;
  while (node) {
    if (node.type === 'atrule' && node.name === name) return node.params;
    node = node.parent;
  }
  return undefined;
}

function rulesFor(selector: string): Rule[] {
  const rules: Rule[] = [];
  globals.walkRules(rule => {
    if (normalize(rule.selector) === selector) rules.push(rule);
  });
  return rules;
}

function declarations(rule: Rule): Record<string, string> {
  const result: Record<string, string> = {};
  rule.walkDecls(decl => {
    result[decl.prop] = decl.value;
  });
  return result;
}

describe('Input focus cascade contract', () => {
  it('keeps the imported generic text-control suppression in the base layer', () => {
    const rules: Rule[] = [];
    designSystem.walkRules(rule => {
      if (
        normalize(rule.selector) ===
        ':where( input, textarea, select, [contenteditable="true"], [role="textbox"] ):focus-visible'
      )
        rules.push(rule);
    });
    expect(rules).toHaveLength(1);
    expect(ancestor(rules[0], 'layer')).toBe('base');
    expect(declarations(rules[0])['box-shadow']).toBe('none');
  });

  it('gives the compound reset precedence over the actual later globals input fallback', () => {
    const imports: string[] = [];
    globals.walkAtRules('import', rule => {
      imports.push(rule.params);
    });
    expect(imports[0]).toBe('"tailwindcss"');
    expect(imports[1]).toBe('"../styles/design-system.css"');
    const layerOrder = globals.nodes.find(
      node => node.type === 'atrule' && node.name === 'layer' && !node.nodes
    );
    expect(layerOrder?.type === 'atrule' && normalize(layerOrder.params)).toBe(
      'theme, base, clerk, components, utilities'
    );

    const fallback: Rule[] = [];
    globals.walkRules(rule => {
      if (rule.selector.includes('input:not([type="hidden"])'))
        fallback.push(rule);
    });
    expect(fallback).toHaveLength(1);
    expect(ancestor(fallback[0], 'layer')).toBe('base');
    expect(fallback[0].toString()).toContain('focus-visible:ring-1');
    expect(fallback[0].toString()).not.toContain('composite-field');

    const [reset] = rulesFor(resetSelector);
    expect(reset).toBeDefined();
    expect(ancestor(reset, 'layer')).toBe('components');
    expect(declarations(reset)).toMatchObject({
      outline: 'none',
      'box-shadow': 'none',
    });
    expect(reset.source?.start?.offset).toBeLessThan(
      fallback[0].source?.start?.offset ?? 0
    );
    // Later base rules cannot repaint a child ring over its components-layer owner.
    expect(reset.selector).not.toMatch(/button|a\[|tabindex/);
  });

  it('retains one radius-following text owner and independent button focus', () => {
    const normal = rulesFor(ownerSelector).filter(
      rule => !ancestor(rule, 'media')
    );
    expect(normal).toHaveLength(1);
    expect(ancestor(normal[0], 'layer')).toBe('components');
    expect(declarations(normal[0])['box-shadow']).toContain(
      'var(--tw-ring-shadow)'
    );
    expect(normal[0].selector).not.toContain(':focus-within');
    const buttonFallback: Rule[] = [];
    globals.walkRules(rule => {
      if (rule.selector.includes('a[href]') && rule.selector.includes('button'))
        buttonFallback.push(rule);
    });
    expect(
      buttonFallback.some(
        rule =>
          ancestor(rule, 'layer') === 'base' &&
          rule.toString().includes('focus-visible:ring-2')
      )
    ).toBe(true);
  });

  it('supplies a visible system-color owner outline when forced colors removes shadows', () => {
    const forced = rulesFor(ownerSelector).filter(
      rule => ancestor(rule, 'media') === '(forced-colors: active)'
    );
    expect(forced).toHaveLength(1);
    expect(ancestor(forced[0], 'layer')).toBe('components');
    expect(declarations(forced[0])).toMatchObject({
      outline: '2px solid Highlight',
      'outline-offset': '2px',
    });
  });
});
