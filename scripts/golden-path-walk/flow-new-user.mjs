// Golden path flow: homepage -> claim handle -> ... (exploratory, extended as we learn the flow)
export default async function flow({
  page,
  snap,
  settle,
  otp,
  email,
  ARTIST,
  ORIGIN,
}) {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await settle(2500);
  await snap('homepage');
  const reject = page.getByRole('button', { name: /reject all/i });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await settle(800);
  }
  const handle = process.env.HANDLE ?? `gp${Date.now().toString(36).slice(-6)}`;
  const input = page.getByRole('textbox').first();
  await input.click();
  await input.pressSequentially(handle, { delay: 70 });
  await settle(1500);
  await snap('homepage handle typed');
  await page
    .getByRole('button', { name: /^claim$/i })
    .first()
    .click();
  await page.waitForLoadState('domcontentloaded');
  await settle(4000);
  await snap('after claim click');
  await settle(6000);
  await snap('after claim settle');
  await pickArtist(arguments[0]);
  // A fresh handle per walk that differs from the homepage one, so every walk
  // exercises the handle-change path without colliding with an earlier walk's
  // reservation (2026-10-31 pm: a fixed default was already reserved).
  const typed = process.env.REPLY1 ?? `${handle}x`;
  await say(arguments[0], typed, 'reply handle');
  const ctx = arguments[0];
  const btn = ctx.page.getByTestId('onboarding-confirm-handle').last();
  if (await btn.isDisabled().catch(() => true)) {
    const change = ctx.page
      .getByRole('button', { name: /change handle/i })
      .last();
    if (await change.isVisible().catch(() => false)) await change.click();
    const f = ctx.page.getByLabel(/edit (proposed )?handle/i).last();
    await f.fill('');
    await f.pressSequentially(`${typed}y`.slice(0, 30), { delay: 60 });
    await ctx.settle(2500);
    await ctx.snap('handle edited');
  }
  await clickIf(arguments[0], /confirm handle/i, 'confirm handle');
  await say(arguments[0], 'Under 500', 'reply audience');
  if (process.env.SOCIAL)
    await say(arguments[0], process.env.SOCIAL, 'reply social');
  const signedUpAt = Date.now();
  await emailSignup(arguments[0]);
  // Time to the waitlist receipt is the walk's exit metric; a walk that never
  // reaches it in 45s is a defect, not a slow pass.
  const reached = await page
    .waitForURL(u => u.pathname.startsWith('/waitlist'), { timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  await settle(2500);
  await snap('post signup final', {
    receiptReached: reached,
    receiptMs: reached ? Date.now() - signedUpAt : null,
  });
}

export async function pickArtist({ page, snap, settle, ARTIST }) {
  const s = page.getByPlaceholder(/search spotify artists/i).first();
  await s.click();
  await s.pressSequentially(ARTIST, { delay: 60 });
  await settle(3000);
  await snap('spotify search results');
  const opt = page
    .getByRole('option', { name: new RegExp(ARTIST, 'i') })
    .first();
  if (await opt.isVisible().catch(() => false)) await opt.click();
  else await page.getByText(ARTIST, { exact: true }).first().click();
  await settle(3000);
  await snap('artist picked');
  await settle(8000);
  await snap('artist picked settle');
}

export async function say({ page, snap, settle }, text, label) {
  const input = page
    .locator('textarea, [aria-label="Chat message input" i]')
    .first();
  await input.click();
  await input.pressSequentially(text, { delay: 40 });
  await settle(500);
  await input.press('Enter');
  await settle(4000);
  await snap(`${label} sent`);
  await settle(8000);
  await snap(`${label} settle`);
}

export async function clickIf(
  { page, snap, settle },
  nameRe,
  label,
  wait = 8000
) {
  const b = page.getByRole('button', { name: nameRe }).last();
  await b.waitFor({ state: 'visible', timeout: 20000 });
  await b.click();
  await settle(3000);
  await snap(`${label} clicked`);
  await settle(wait);
  await snap(`${label} settle`);
}

export async function emailSignup({ page, snap, settle, otp, email }) {
  const field = page.getByRole('textbox', { name: /^email/i }).last();
  await field.click();
  await field.pressSequentially(email, { delay: 25 });
  await settle(800);
  await snap('signup email typed');
  const started = Date.now();
  await page
    .getByRole('button', { name: /send sign-in code/i })
    .last()
    .click();
  const code = await otp(started);
  await settle(1500);
  await snap('signup otp step');
  const codeInput = page.getByLabel(/one-time password/i).first();
  await codeInput.focus().catch(() => {});
  await page.keyboard.type(code, { delay: 90 });
  await settle(2500);
  await snap('signup code entered');
  await settle(10000);
  await snap('after signup settle');
}
