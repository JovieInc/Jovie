import { defineEval } from 'eve/evals';
import { equals, satisfies } from 'eve/evals/expect';
import { coreChatSessionBody } from './shadow-payload';
import { SESSION_PATH } from './shared';

export default defineEval({
  description:
    'Real Eve session HTTP surface accepts a canonical core-chat shadow observation.',
  tags: ['core-chat', 'strict'],
  async test(t) {
    const body = coreChatSessionBody(
      'Register this Jovie core chat turn as a shadow observation.',
      'eval-session-succeeds'
    );

    const response = await t.target.fetch(SESSION_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await t.require(response.ok, equals(true));
    await t.require(
      response.status,
      satisfies(
        (status: number) => status >= 200 && status < 300,
        'POST /eve/v1/session returns a success status'
      )
    );

    const payload = (await response.json()) as { sessionId?: unknown };
    const sessionId = await t.require(
      payload.sessionId,
      satisfies(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
        'POST /eve/v1/session returns a session id'
      )
    );

    const session = await t.target.attachSession(String(sessionId));
    session.succeeded();
    session.event('session.started');
    session.event('message.received');
    session.noFailedActions();
  },
});
