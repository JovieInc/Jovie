/** Detector fixtures only. Neither viewport resize nor synthetic event dispatch
 * is evidence of a native keyboard, autofill sheet or password manager. */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  captureInputGeometry,
  commitAutofillValue,
} from './utils/browser-owned-input';

const options = {
  fieldSelector: '#email',
  actionSelector: '#submit',
  role: 'email',
};
const form = `<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="email" inputmode="email">
<button id="submit">Submit</button><output id="state"></output>`;

test('audits real DOM semantics including hidden email/password decoys', async ({
  page,
}) => {
  await page.setContent(form);
  const { semanticFindings } = await import(
    pathToFileURL(
      resolve(
        __dirname,
        '../../../../scripts/invariants/browser-owned-input.mjs'
      )
    ).href
  );
  const snapshot = () => page.evaluate(captureInputGeometry, options);
  expect(semanticFindings((await snapshot()).fields, ['email'])).toEqual([]);
  await page
    .locator('#email')
    .evaluate(input => input.removeAttribute('autocomplete'));
  expect(semanticFindings((await snapshot()).fields, ['email'])).toContain(
    'semantics:email:invalid'
  );
  await page
    .locator('#email')
    .evaluate(input => input.setAttribute('autocomplete', 'email'));
  await page
    .locator('body')
    .evaluate(body =>
      body.insertAdjacentHTML(
        'beforeend',
        '<input type="hidden" name="email" autocomplete="email">'
      )
    );
  expect(semanticFindings((await snapshot()).fields, ['email'])).toContain(
    'semantics:email:autofill-decoy'
  );
});

test('records visual/layout viewport deltas and exposes fixed offscreen actions', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(
    `<main style="height:100svh">${form}</main><style>#submit {position:fixed;top:750px} #email {margin-top:150px}</style>`
  );
  await page.locator('#email').focus();
  const before = await page.evaluate(captureInputGeometry, options);
  expect(before.focused).toBe(true);
  expect(before.actionHit).toBe(true);
  await page.setViewportSize({ width: 390, height: 430 });
  const after = await page.evaluate(captureInputGeometry, options);
  expect(after.visualHeight).toBeLessThan(before.visualHeight);
  expect(after.action.top).toBeGreaterThan(after.viewport.bottom);
  expect(after.actionHit).toBe(false);
  expect(after.fieldHit).toBe(true);
  await testInfo.attach('detector-only-viewport-samples', {
    body: JSON.stringify({ before, after }),
    contentType: 'application/json',
  });
  await testInfo.attach('detector-only-resize', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.evaluate(captureInputGeometry, options)).actionHit).toBe(
    true
  );
});

test('autofill input/change events update the same validation state as typing, while a broken listener is observable', async ({
  page,
}) => {
  await page.setContent(`${form}<script>
    const input = document.querySelector('#email');
    input.addEventListener('input', () => { document.querySelector('#state').textContent = input.validity.valid ? input.value : 'invalid'; });
  </script>`);
  const address = 'browser-fixture@example.test';
  await page.locator('#email').pressSequentially(address);
  const typed = await page.locator('#state').textContent();
  await page.locator('#email').fill('');
  await page.evaluate(commitAutofillValue, {
    selector: '#email',
    value: address,
  });
  await expect(page.locator('#state')).toHaveText(typed ?? '');
  await page.setContent(`${form}<script>
    document.querySelector('#email').addEventListener('keydown', event => { document.querySelector('#state').textContent = event.target.value; });
  </script>`);
  await page.evaluate(commitAutofillValue, {
    selector: '#email',
    value: address,
  });
  await expect(page.locator('#email')).toHaveValue(address);
  await expect(page.locator('#state')).toBeEmpty();
});
