import { defineEval } from 'eve/evals';
import { equals, satisfies } from 'eve/evals/expect';

import { capabilityManifest } from '../../agent/tools/jovie_capability_manifest';
import {
  coreChatSessionBody,
  sessionBodyHasForbiddenKeys,
} from './shadow-payload';
import { SESSION_PATH, serializedEventsLeak } from './shared';

const LEAK_NEEDLE = 'sk_live_LEAK_CANARY';
const USER_NEEDLE = 'user_LEAK_CANARY';
const PROMPT_NEEDLE = 'JOVIE_SYSTEM_PROMPT_CANARY';

export default defineEval({
  description:
    'Shadow session POST omits user id, system prompt, and provider credentials.',
  tags: ['core-chat', 'strict', 'privacy'],
  async test(t) {
    const body = coreChatSessionBody(
      'Register this Jovie core chat turn as a shadow observation.',
      'eval-no-secrets'
    );
    const encoded = JSON.stringify(body);

    t.check(sessionBodyHasForbiddenKeys(body), equals([]));
    t.check(
      encoded,
      satisfies(
        (value: string) =>
          !value.includes(LEAK_NEEDLE) &&
          !value.includes(USER_NEEDLE) &&
          !value.includes(PROMPT_NEEDLE) &&
          !value.includes('systemPrompt') &&
          !value.includes('userId'),
        'encoded shadow body has no secrets, user id, or system prompt'
      )
    );

    await t.send({
      message: body.message,
      clientContext: body.clientContext,
    });

    t.succeeded();
    t.calledTool('jovie_capability_manifest', {
      input: { capability: 'core_chat' },
      output: capabilityManifest('core_chat'),
    });
    t.check(
      t.reply,
      satisfies(
        value => !String(value ?? '').includes('LEAK_DETECTED'),
        'fixture model saw no leaked user id, system prompt, or credentials'
      )
    );
    t.check(
      JSON.stringify(t.events),
      satisfies(
        (value: string) =>
          !value.includes(LEAK_NEEDLE) &&
          !value.includes(USER_NEEDLE) &&
          !value.includes(PROMPT_NEEDLE),
        'session events do not carry injected credentials or user ids'
      )
    );

    const stuffed = await t.target.fetch(SESSION_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...body,
        userId: USER_NEEDLE,
        systemPrompt: PROMPT_NEEDLE,
        credentials: { openai: LEAK_NEEDLE },
      }),
    });
    await t.require(stuffed.ok, equals(true));
    const created = (await stuffed.json()) as { sessionId?: unknown };
    const stuffedSessionId = await t.require(
      created.sessionId,
      satisfies(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
        'stuffed POST still opens a session id'
      )
    );
    const stuffedSession = await t.target.attachSession(
      String(stuffedSessionId)
    );
    stuffedSession.succeeded();
    stuffedSession.eventsSatisfy(
      'unknown leak fields never enter the session stream',
      events =>
        !serializedEventsLeak(events) &&
        !JSON.stringify(events).includes(LEAK_NEEDLE) &&
        !JSON.stringify(events).includes(USER_NEEDLE) &&
        !JSON.stringify(events).includes(PROMPT_NEEDLE)
    );
  },
});
