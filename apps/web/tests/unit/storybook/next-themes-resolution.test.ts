import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import storybookConfig, {
  storybookAddonsForEnvironment,
} from '../../../.storybook/main';

describe('Storybook next-themes resolution', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps automatic a11y enabled outside dedicated manual Axe suites', () => {
    expect(storybookAddonsForEnvironment(false, false)).toContain(
      '@storybook/addon-a11y'
    );
    expect(storybookAddonsForEnvironment(true, false)).not.toContain(
      '@storybook/addon-a11y'
    );
    expect(storybookAddonsForEnvironment(false, true)).not.toContain(
      '@storybook/addon-a11y'
    );
  });

  it('uses manual Axe mode only when explicitly enabled', () => {
    vi.stubEnv('JOVIE_STORYBOOK_MANUAL_AXE', '1');
    expect(storybookAddonsForEnvironment(false)).not.toContain(
      '@storybook/addon-a11y'
    );

    for (const disabled of ['0', 'true', '']) {
      vi.stubEnv('JOVIE_STORYBOOK_MANUAL_AXE', disabled);
      expect(storybookAddonsForEnvironment(false)).toContain(
        '@storybook/addon-a11y'
      );
    }
  });

  it('keeps the full story catalog when Playwright owns the Axe scans', async () => {
    vi.stubEnv('JOVIE_LIVE_STORYBOOK_CERT', '0');
    vi.stubEnv('JOVIE_STORYBOOK_MANUAL_AXE', '1');
    vi.resetModules();
    const { default: manualConfig } = await import('../../../.storybook/main');

    expect(manualConfig.addons).not.toContain('@storybook/addon-a11y');
    expect(manualConfig.stories).toEqual([
      './stories/**/*.stories.@(js|jsx|ts|tsx|mdx)',
      '../components/**/*.stories.@(js|jsx|ts|tsx|mdx)',
      '../../../packages/ui/**/*.stories.@(js|jsx|ts|tsx|mdx)',
    ]);
  });

  it('resolves the bare package import to the script-free mock', async () => {
    const viteFinal = storybookConfig.viteFinal;
    expect(viteFinal).toBeTypeOf('function');
    if (!viteFinal) {
      throw new Error('Storybook must define viteFinal');
    }

    type ViteFinal = NonNullable<typeof viteFinal>;
    const storybookViteConfig = await viteFinal(
      {
        resolve: {
          alias: [{ find: 'existing-alias', replacement: '/existing' }],
        },
      } as Parameters<ViteFinal>[0],
      {} as Parameters<ViteFinal>[1]
    );
    const aliases = storybookViteConfig.resolve?.alias;

    expect(Array.isArray(aliases)).toBe(true);
    if (!Array.isArray(aliases)) {
      throw new Error('Storybook aliases must be normalized to an array');
    }

    const themeAliasIndex = aliases.findIndex(
      alias => typeof alias.find === 'string' && alias.find === 'next-themes'
    );
    const projectAliasIndex = aliases.findIndex(
      alias => typeof alias.find === 'string' && alias.find === '@'
    );
    const themeAlias = aliases[themeAliasIndex];

    expect(themeAliasIndex).toBeGreaterThanOrEqual(0);
    expect(projectAliasIndex).toBeGreaterThan(themeAliasIndex);
    expect(themeAlias?.replacement).toMatch(
      /\.storybook\/next-themes-mock\.tsx$/
    );

    const stringAliases = aliases.filter(
      alias => typeof alias.find === 'string'
    );
    const resolverScript = `
      import { resolveConfig } from 'vite';
      const aliases = JSON.parse(process.env.STORYBOOK_ALIASES);
      const config = await resolveConfig(
        { configFile: false, resolve: { alias: aliases } },
        'serve'
      );
      const resolved = await config.createResolver()(
        'next-themes',
        ${JSON.stringify(fileURLToPath(import.meta.url))}
      );
      process.stdout.write(resolved ?? '');
    `;
    const resolvedThemeProvider = execFileSync(
      process.execPath,
      ['--input-type=module', '--eval', resolverScript],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          STORYBOOK_ALIASES: JSON.stringify(stringAliases),
        },
      }
    );

    expect(resolvedThemeProvider).toBe(themeAlias?.replacement);
    expect(resolvedThemeProvider).not.toMatch(/node_modules\/next-themes\//);
  });
});
