import 'server-only';

export type HermesEventsPayload = {
  events: Array<Record<string, unknown>>;
  generatedAt?: string | null;
};

let latestPayload: HermesEventsPayload = { events: [], generatedAt: null };

const MAX_EVENTS = 200;

export function setHermesEventsPayload(payload: HermesEventsPayload): void {
  const events = payload.events.slice(-MAX_EVENTS);
  latestPayload = {
    events,
    generatedAt: payload.generatedAt ?? null,
  };
}

export function getHermesEventsPayload(): HermesEventsPayload {
  return {
    events: [...latestPayload.events],
    generatedAt: latestPayload.generatedAt,
  };
}
