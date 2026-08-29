import { expect, test } from '@playwright/test';
import { selectCardPaymentMethod } from './stripe-helpers';

test.describe('Stripe card payment method selection', () => {
  test.describe.configure({ retries: 0 });
  test.use({ storageState: { cookies: [], origins: [] } });

  test('checks the semantic radio when hosted presentation chrome covers it', async ({
    page,
  }) => {
    await page.setContent(`
      <div style="position: relative; width: 240px; height: 80px">
        <label for="card-method">Card</label>
        <input
          id="card-method"
          type="radio"
          name="payment-method"
          aria-label="Card"
          style="position: absolute; left: 16px; top: 42px"
        />
        <button
          type="button"
          aria-label="Pay with card"
          data-testid="card-accordion-item-button"
          style="position: absolute; inset: 0; z-index: 2"
        >
          Card accordion
        </button>
      </div>
    `);

    const cardRadio = page.getByRole('radio', { name: 'Card' });
    await expect(cardRadio).not.toBeChecked();

    await selectCardPaymentMethod(page);

    await expect(cardRadio).toBeChecked();
  });
});
