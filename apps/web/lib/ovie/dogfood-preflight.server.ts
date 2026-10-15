import 'server-only';

import { createHash } from 'node:crypto';
import type {
  ExposureAdapter,
  ExposureIdentity,
  ObservedExposure,
} from '@jovie/release-channel-contracts/dogfood-exposure';
import {
  type DogfoodExposureRequest,
  type DogfoodRosterResolverDeps,
  defaultDogfoodRosterResolverDeps,
  resolveDogfoodExposureForSession,
} from './dogfood-roster.server';

/** Never send raw account/session identifiers to receipts or analytics. */
export function dogfoodSubjectRef(kind: string, subject: string): string {
  return createHash('sha256')
    .update(JSON.stringify([kind, subject]))
    .digest('hex');
}

/** Product drivers observe their actual client; authority always comes from the roster. */
export function jovieExposureAdapter(input: {
  readonly request: DogfoodExposureRequest;
  readonly runtime: Omit<ExposureAdapter, 'observe'> & {
    observe(): Promise<
      Omit<ObservedExposure, 'membership' | 'identity'> & {
        readonly identity: Omit<ExposureIdentity, 'actorRef'>;
      }
    >;
  };
  readonly deps?: DogfoodRosterResolverDeps;
  readonly now?: () => Date;
}): ExposureAdapter {
  const deps = input.deps ?? defaultDogfoodRosterResolverDeps;
  return {
    subscribe: input.runtime.subscribe,
    reconcile: input.runtime.reconcile,
    async observe() {
      const now = input.now?.() ?? new Date();
      const session = await deps.readSession(input.request.sessionId, now);
      const decision = await resolveDogfoodExposureForSession(
        input.request,
        deps,
        now
      );
      const runtime = await input.runtime.observe();
      return {
        ...runtime,
        identity: {
          ...runtime.identity,
          actorRef: decision.eligible
            ? dogfoodSubjectRef('actor', decision.actorKey)
            : '',
        },
        membership: {
          eligible:
            decision.eligible &&
            session !== null &&
            runtime.identity.accountRef ===
              dogfoodSubjectRef('account', session.accountSubject) &&
            runtime.identity.sessionRef ===
              dogfoodSubjectRef('session', session.id) &&
            runtime.identity.product === input.request.product &&
            runtime.identity.mode === input.request.mode &&
            runtime.identity.deviceRef ===
              dogfoodSubjectRef('device', input.request.deviceSubject ?? ''),
          bindingRef: decision.eligible
            ? dogfoodSubjectRef('binding', decision.bindingId)
            : '',
        },
      };
    },
  };
}
