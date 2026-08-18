import { defineEval } from 'eve/evals';
import { equals, satisfies } from 'eve/evals/expect';

import { jovieCoreChatAuth } from '../../agent/channels/eve';
import { capabilityManifest } from '../../agent/tools/jovie_capability_manifest';
import { postSessionRaw, SESSION_PATH } from './shared';

export default defineEval({
  description:
    'Missing/wrong route auth and dead transport stay fail-closed; no write.',
  tags: ['core-chat', 'strict', 'fail-closed'],
  async test(t) {
    const missing = await jovieCoreChatAuth(
      new Request(`https://eve.example.com${SESSION_PATH}`)
    );
    const wrong = await jovieCoreChatAuth(
      new Request(`https://eve.example.com${SESSION_PATH}`, {
        headers: { authorization: 'Bearer wrong-token' },
      })
    );

    t.check(missing, equals(null));
    t.check(wrong, equals(null));
    t.check(capabilityManifest('core_chat').writePerformed, equals(false));

    const malformed = await t.target.fetch(SESSION_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    t.check(malformed.ok, equals(false));

    const empty = await t.target.fetch(SESSION_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
    });
    t.check(empty.ok, equals(false));

    const missingMessage = await t.target.fetch(SESSION_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    t.check(missingMessage.ok, equals(false));

    const missingAuth = await postSessionRaw({
      targetUrl: t.target.url,
      hostHeader: 'eve.example.com',
      body: JSON.stringify({ message: 'shadow observation' }),
    });
    t.check(
      missingAuth.status,
      satisfies(
        status => status === 401,
        'missing auth off-loopback fails closed with 401'
      )
    );
    t.check(
      missingAuth.body,
      satisfies(
        (body: string) => !body.includes('"writePerformed":true'),
        '401 body does not claim a write'
      )
    );

    const wrongAuth = await postSessionRaw({
      targetUrl: t.target.url,
      hostHeader: 'eve.example.com',
      headers: { authorization: 'Bearer wrong-token' },
      body: JSON.stringify({ message: 'shadow observation' }),
    });
    t.check(
      wrongAuth.status,
      satisfies(
        status => status === 401,
        'wrong bearer off-loopback fails closed with 401'
      )
    );

    let transportFailed = false;
    try {
      await fetch(`http://127.0.0.1:1${SESSION_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'should not reach a session' }),
        signal: AbortSignal.timeout(400),
      });
    } catch {
      transportFailed = true;
    }
    t.check(transportFailed, equals(true));

    const unknownRoute = await t.target.fetch('/eve/v1/not-a-session', {
      method: 'POST',
    });
    t.check(unknownRoute.ok, equals(false));
  },
});
