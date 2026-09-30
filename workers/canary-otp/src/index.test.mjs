import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { classifyProductLanes } from '../../../scripts/lib/product-lane-classifier.mjs';
import worker from './index.ts';

const now = 1_800_000_000_000;
const email = 'signup+jovie-prod-waitlist-canary@canary.example.com';
const token = 'test-only-credential-not-for-production-0000';

test('CI selects the existing web lane for worker-only changes', () => {
  for (const path of [
    'workers/canary-otp/src/index.ts',
    'workers/canary-otp/package.json',
    'workers/canary-otp/wrangler.example.toml',
  ]) {
    assert.ok(classifyProductLanes([path]).selectedLanes.includes('web'));
  }
  assert.throws(() =>
    classifyProductLanes(['workers/canary-otp-other/src/index.ts'])
  );
});

function setup(t) {
  t.mock.method(Date, 'now', () => now);
  const kv = {
    value: null,
    writes: 0,
    reads: 0,
    async put(key, value, options) {
      assert.equal(key, 'latest');
      assert.equal(options.expirationTtl, 300);
      this.writes++;
      this.value = JSON.parse(value);
    },
    async get(key, type) {
      assert.equal(key, 'latest');
      assert.equal(type, 'json');
      this.reads++;
      return this.value;
    },
  };
  const env = {
    OTP_STATE: kv,
    OTP_CHECK_TOKEN: token,
    OTP_CHECK_ORIGIN: 'https://otp.example.com',
    CANARY_EMAIL: email,
    CANARY_FROM: 'no-reply@jov.ie',
  };
  return { env, kv };
}

function mail(overrides = {}, raw) {
  const body =
    raw ??
    `From: Jovie <no-reply@jov.ie>\r\nTo: ${email}\r\nDate: ${new Date(now).toUTCString()}\r\nSubject: Sign in to Jovie\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nYour Jovie verification code: 123456\r\n`;
  return {
    to: email,
    rawSize: new TextEncoder().encode(body).length,
    raw: new Response(body).body,
    rejected: null,
    setReject(reason) {
      this.rejected = reason;
    },
    ...overrides,
  };
}

function request(body = { email, sinceMs: now - 1000 }, options = {}) {
  return new Request('https://otp.example.com/latest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    ...options,
  });
}

test('MIME email persists only the code and times, and authorized run reads it without caching', async t => {
  const { env, kv } = setup(t);
  const message = mail();
  await worker.email(message, env);
  assert.equal(message.rejected, null);
  assert.deepEqual(kv.value, {
    otp: '123456',
    issuedAtMs: now,
    receivedAtMs: now,
  });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.deepEqual(await response.json(), kv.value);
});

test('handles multipart base64 mail using the real MIME parser', async t => {
  const { env, kv } = setup(t);
  const raw = `From: no-reply@jov.ie\r\nDate: ${new Date(now).toUTCString()}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=canary\r\n\r\n--canary\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('Your Jovie verification code: 654321').toString('base64')}\r\n--canary--\r\n`;
  await worker.email(mail({}, raw), env);
  assert.equal(kv.value.otp, '654321');
});

test('rejects unrelated recipients and oversized declared or actual mail before storing', async t => {
  const { env, kv } = setup(t);
  for (const message of [
    mail({ to: 'someone@jov.ie' }),
    mail({ rawSize: 65537 }),
    mail({ rawSize: 1 }, 'x'.repeat(65537)),
    mail({ raw: null }),
  ]) {
    await worker.email(message, env);
    assert.equal(message.rejected, 'Mail not accepted');
  }
  assert.equal(kv.writes, 0);
});

test('rejects wrong sender, old/missing/future dates, and missing/ambiguous OTPs', async t => {
  const { env, kv } = setup(t);
  const good = `From: no-reply@jov.ie\r\nDate: ${new Date(now).toUTCString()}\r\n\r\nYour verification code: 123456`;
  const fixtures = [
    good.replace('no-reply@jov.ie', 'attacker@example.com'),
    good.replace(
      new Date(now).toUTCString(),
      new Date(now - 301000).toUTCString()
    ),
    good.replace(
      new Date(now).toUTCString(),
      new Date(now + 31000).toUTCString()
    ),
    good.replace(new Date(now).toUTCString(), 'invalid'),
    'Subject: No date or sender\r\n\r\nYour verification code: 123456',
    good.replace('123456', '1234567'),
    `${good}\nYour verification code: 654321`,
    good.replace('Your verification code: 123456', 'Nothing here'),
  ];
  for (const raw of fixtures) {
    const message = mail({}, raw);
    await worker.email(message, env);
    assert.equal(message.rejected, 'Mail not accepted');
  }
  assert.equal(kv.writes, 0);
});

test('unconfigured or malformed settings fail closed for both handlers', async t => {
  const { env, kv } = setup(t);
  for (const bad of [
    { OTP_CHECK_TOKEN: '' },
    { OTP_CHECK_ORIGIN: 'bad' },
    { OTP_CHECK_ORIGIN: 'http://otp.example.com' },
    { OTP_CHECK_ORIGIN: 'https://otp.example.com/path' },
    { CANARY_EMAIL: '' },
    { CANARY_FROM: '' },
  ]) {
    const config = { ...env, ...bad };
    const message = mail();
    await worker.email(message, config);
    assert.equal(message.rejected, 'Canary unavailable');
    assert.equal((await worker.fetch(request(), config)).status, 503);
  }
  assert.equal(kv.writes, 0);
  assert.equal(kv.reads, 0);
});

test('persistence failure throws for provider retry; read failure returns unavailable', async t => {
  const { env } = setup(t);
  env.OTP_STATE.put = async () => {
    throw new Error('storage outage');
  };
  const message = mail();
  await assert.rejects(worker.email(message, env), /storage outage/);
  env.OTP_STATE.get = async () => {
    throw new Error('read outage');
  };
  assert.equal((await worker.fetch(request(), env)).status, 503);
});

test('wrong route, query, origin or method never accesses the store', async t => {
  const { env, kv } = setup(t);
  for (const url of [
    'https://otp.example.com/other',
    'https://otp.example.com/latest?token=bad',
    'https://other.example.com/latest',
  ]) {
    assert.equal((await worker.fetch(new Request(url), env)).status, 404);
  }
  assert.equal(
    (await worker.fetch(new Request('https://otp.example.com/latest'), env))
      .status,
    405
  );
  assert.equal(kv.reads, 0);
});

test('missing, malformed and incorrect bearer credentials cannot read codes', async t => {
  const { env, kv } = setup(t);
  for (const headers of [
    {},
    { Authorization: 'Basic test' },
    { Authorization: 'Bearer wrong' },
    { Authorization: `Bearer ${'x'.repeat(300)}` },
  ]) {
    assert.equal(
      (await worker.fetch(request(undefined, { headers }), env)).status,
      401
    );
  }
  assert.equal(kv.reads, 0);
});

test('malformed, oversized and invalid request contracts fail without reading the store', async t => {
  const { env, kv } = setup(t);
  for (const body of [
    null,
    0,
    {},
    { email },
    { email, sinceMs: 'now' },
    { email, sinceMs: null },
    { email, sinceMs: now + 1 },
    { email, sinceMs: now - 300001 },
  ]) {
    assert.equal((await worker.fetch(request(body), env)).status, 400);
  }
  for (const body of ['{', 'x'.repeat(1025), null]) {
    assert.equal(
      (await worker.fetch(request(undefined, { body }), env)).status,
      400
    );
  }
  assert.equal(
    (
      await worker.fetch(
        request({ email: 'other@example.com', sinceMs: now }),
        env
      )
    ).status,
    403
  );
  assert.equal(kv.reads, 0);
});

test('missing, corrupt, expired, future and prior-run codes are never returned', async t => {
  const { env, kv } = setup(t);
  const good = { otp: '123456', issuedAtMs: now, receivedAtMs: now };
  for (const state of [
    null,
    { ...good, otp: 'bad' },
    { ...good, receivedAtMs: null },
    { ...good, issuedAtMs: null },
    { ...good, receivedAtMs: now - 2000 },
    { ...good, receivedAtMs: now + 1 },
    { ...good, issuedAtMs: now - 2000 },
    { ...good, issuedAtMs: now + 31000 },
  ]) {
    kv.value = state;
    assert.equal((await worker.fetch(request(), env)).status, 404);
  }
});

test('real TTL remains enforced independently if KV still exposes an expired entry', async t => {
  const { env, kv } = setup(t);
  kv.value = {
    otp: '123456',
    issuedAtMs: now - 301000,
    receivedAtMs: now - 301000,
  };
  assert.equal((await worker.fetch(request(), env)).status, 404);
});

test.afterEach(() => mock.restoreAll());
