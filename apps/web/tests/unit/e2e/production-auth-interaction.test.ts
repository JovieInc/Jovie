import { describe, expect, it, vi } from 'vitest';
import {
  prepareProductionAuthEmailForm,
  waitForProductionDashboardContent,
} from '../../e2e/utils/production-auth-interaction';

describe('production auth interaction hydration gate', () => {
  it('waits for full load before refilling the controlled email and enabling submit', async () => {
    document.body.innerHTML = `
      <form data-auth-email-code-step="email">
        <input name="emailAddress" type="email" autocomplete="email" />
        <button type="submit">Email me a Code</button>
      </form>
    `;

    const calls: string[] = [];
    const identifierInput = {
      waitFor: vi.fn(async () => {
        calls.push('input-visible');
      }),
      fill: vi.fn(async (value: string) => {
        calls.push(`fill:${value}`);
      }),
    };
    const submitButton = {
      waitFor: vi.fn(async () => {
        calls.push('submit-visible');
      }),
    };
    const form = {
      waitFor: vi.fn(async () => {
        calls.push('form-visible');
      }),
      locator: vi.fn((selector: string) =>
        selector === 'button[type="submit"]'
          ? { ...submitButton, first: () => submitButton }
          : { ...identifierInput, first: () => identifierInput }
      ),
    };
    const page = {
      waitForLoadState: vi.fn(async () => {
        calls.push('load');
      }),
      locator: vi.fn(() => ({ ...form, first: () => form })),
      waitForFunction: vi.fn(
        async (predicate: (selector: string) => boolean, selector: string) => {
          calls.push('submit-enabled');
          expect(predicate(selector)).toBe(true);
        }
      ),
    };

    const controls = await prepareProductionAuthEmailForm(
      page as never,
      'smoke@example.com'
    );

    expect(controls).toEqual({ identifierInput, submitButton });
    expect(calls).toEqual([
      'load',
      'form-visible',
      'input-visible',
      'submit-visible',
      'fill:',
      'fill:smoke@example.com',
      'submit-enabled',
    ]);
  });

  it('waits for meaningful dashboard content instead of sampling an empty main', async () => {
    document.body.innerHTML = '<main></main>';

    const page = {
      waitForFunction: vi.fn(
        async (
          predicate: (options: {
            selector: string;
            minimumLength: number;
          }) => string | false,
          options: { selector: string; minimumLength: number }
        ) => {
          expect(predicate(options)).toBe(false);

          const main = document.querySelector('main');
          expect(main).not.toBeNull();
          if (main) {
            main.textContent =
              'Your dashboard is ready with real authenticated content.';
          }

          const content = predicate(options);
          expect(content).toBe(
            'Your dashboard is ready with real authenticated content.'
          );
          return { jsonValue: vi.fn(async () => content) };
        }
      ),
    };

    await expect(
      waitForProductionDashboardContent(page as never, 20_000)
    ).resolves.toBe('Your dashboard is ready with real authenticated content.');
    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      { selector: 'main', minimumLength: 30 },
      { timeout: 20_000 }
    );
  });
});
