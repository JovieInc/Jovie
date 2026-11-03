// Time to first visible assistant word per chat turn (golden-path step 8).
import { writeFileSync } from 'node:fs';

const QUESTIONS = [
  'What should I do this week to get more listeners?',
  'How many Spotify followers do I have?',
  'What is my latest release?',
  'What plan am I on?',
  'Write a short post announcing my latest release.',
  'hi',
];
export default async function flowLatency({
  page,
  snap,
  settle,
  otp,
  email,
  ORIGIN,
}) {
  await page.goto(`${ORIGIN}/signin`, { waitUntil: 'domcontentloaded' });
  await settle(2000);
  await page
    .getByRole('textbox', { name: /^email/i })
    .first()
    .fill(email);
  const started = Date.now();
  await page
    .getByRole('button', { name: /send sign-in code/i })
    .first()
    .click();
  const code = await otp(started);
  await page
    .getByLabel(/one-time password/i)
    .first()
    .focus()
    .catch(() => {});
  await page.keyboard.type(code, { delay: 60 });
  await page
    .waitForURL(u => !u.pathname.startsWith('/signin'), { timeout: 30000 })
    .catch(() => {});
  const results = [];
  for (const q of QUESTIONS) {
    await page.goto(`${ORIGIN}/app/chat`, { waitUntil: 'domcontentloaded' });
    await settle(3000);
    const input = page
      .locator('textarea, [aria-label="Chat message input" i]')
      .first();
    await input.click();
    await input.fill(q);
    const t0 = Date.now();
    await input.press('Enter');
    let firstVisible = null;
    while (Date.now() - t0 < 90000) {
      const txt = await page
        .locator('[data-role="assistant"]')
        .last()
        .innerText()
        .catch(() => '');
      if (txt.replace(/\s+/g, '').length >= 3) {
        firstVisible = Date.now() - t0;
        break;
      }
      await page.waitForTimeout(100);
    }
    await settle(1500);
    await snap(`latency ${q.slice(0, 30)}`);
    const text = await page
      .locator('[data-role="assistant"]')
      .last()
      .innerText()
      .catch(() => '');
    results.push({ q, firstVisibleMs: firstVisible, head: text.slice(0, 160) });
    console.error('LAT', JSON.stringify(results.at(-1)));
  }
  writeFileSync(
    `${process.env.OUT}/latency.json`,
    JSON.stringify(results, null, 1)
  );
}
