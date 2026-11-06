// Returning creator canary: sign in -> dashboard -> public profile -> first valuable action (chat) -> upgrade
export default async function flowReturning({
  page,
  snap,
  settle,
  otp,
  email,
  ORIGIN,
}) {
  await page.goto(`${ORIGIN}/signin`, { waitUntil: 'domcontentloaded' });
  await settle(2500);
  await snap('signin');
  const reject = page.getByRole('button', { name: /reject all/i });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await settle(600);
  }
  const field = page.getByRole('textbox', { name: /^email/i }).first();
  await field.click();
  await field.pressSequentially(email, { delay: 25 });
  const started = Date.now();
  await page
    .getByRole('button', { name: /send sign-in code/i })
    .first()
    .click();
  const code = await otp(started);
  await settle(1200);
  await snap('signin otp step');
  await page
    .getByLabel(/one-time password/i)
    .first()
    .focus()
    .catch(() => {});
  await page.keyboard.type(code, { delay: 90 });
  await page
    .waitForURL(u => !u.pathname.startsWith('/signin'), { timeout: 30000 })
    .catch(() => {});
  await settle(2500);
  await snap('after signin landing');
  await settle(6000);
  await snap('dashboard settled');
  const handle = process.env.PROFILE_HANDLE ?? 'gooddropouts';
  await page.goto(`${ORIGIN}/${handle}`, { waitUntil: 'domcontentloaded' });
  await settle(3500);
  await snap('public profile');
  await page.goto(`${ORIGIN}/app/chat`, { waitUntil: 'domcontentloaded' });
  await settle(4000);
  await snap('chat home');
  const input = page
    .locator('textarea, [aria-label="Chat message input" i]')
    .first();
  await input.click();
  await input.pressSequentially(
    'What should I do this week to get more listeners?',
    { delay: 20 }
  );
  await input.press('Enter');
  await settle(5000);
  await snap('first action sent');
  await settle(20000);
  await snap('first action answered');
  await page.goto(`${ORIGIN}/app/settings/billing`, {
    waitUntil: 'domcontentloaded',
  });
  await settle(4000);
  await snap('billing upgrade');
  await page.goto(`${ORIGIN}/pricing`, { waitUntil: 'domcontentloaded' });
  await settle(3000);
  await snap('pricing');
}
