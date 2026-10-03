import { chromium } from '@playwright/test';
const b = await chromium.launch();
const cases = [
  ['/tim/the-sound?dsp=spotify', {}],
  ['/tim/the-sound?dsp=apple_music', {}],
  ['/tim/the-sound?dsp=youtube', {}],
  ['/tim/the-sound?dsp=tidal', {}],
  ['/tim/the-sound?dsp=bogus', {}],
  ['/tim/the-sound?dsp=spotify&utm_source=cert&utm_campaign=x', {}],
  ['/tim/the-sound', { cookie: 'spotify' }],
  ['/tim/the-sound?noredirect=1', { cookie: 'spotify' }],
];
for (const [u, o] of cases) {
  const ctx = await b.newContext();
  if (o.cookie) {
    const name = process.env.LISTEN_COOKIE || 'jovie_dsp';
    await ctx.addCookies([{ name, value: o.cookie, domain: 'jov.ie', path: '/' }]);
  }
  const p = await ctx.newPage();
  const tracks = [];
  p.on('request', r => r.url().includes('/api/track') && tracks.push(r.postData()?.slice(0, 120)));
  await p.route(/^(?!https:\/\/jov\.ie).*(spotify|apple|youtube|tidal|deezer)\.com.*/, r => r.fulfill({ status: 200, body: 'dsp' }));
  await p.goto('https://jov.ie' + u, { waitUntil: 'load' }).catch(e => {});
  await p.waitForTimeout(3500);
  console.log(u, JSON.stringify(o), '=>', p.url().slice(0, 110), 'track:', tracks.length);
  await ctx.close();
}
await b.close();
