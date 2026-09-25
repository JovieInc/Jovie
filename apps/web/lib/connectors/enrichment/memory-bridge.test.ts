import { describe, expect, it } from 'vitest';
import { memoryFixtureScope } from '@/lib/memory/dev-fixtures';
import { MemoryFixtureStore } from '@/lib/memory/fixture-store';
import { ConnectorMemoryBridge } from './memory-bridge';

describe('ConnectorMemoryBridge', () => {
  it('writes evidence-backed entity observations for gmail mentions', async () => {
    const store = new MemoryFixtureStore();
    const bridge = new ConnectorMemoryBridge(store);

    const result = await bridge.bridgeEntityMentions({
      scope: memoryFixtureScope,
      sourceType: 'gmail_message',
      externalId: 'gmail:fixture-msg-001',
      sourceMetadata: {
        subject: 'Booking Confirmation — Output Brooklyn',
        from: 'bookings@outputclub.com',
      },
      mentions: [
        {
          type: 'location',
          name: 'Output Brooklyn',
          confidence: 0.78,
          factKind: 'location_mentioned',
          metadata: { city: 'Brooklyn' },
        },
        {
          type: 'company',
          name: 'Output Club Bookings',
          confidence: 0.72,
          factKind: 'person_mentioned',
        },
      ],
    });

    expect(result.observationsCreated).toBe(2);
    expect(result.entitiesCreated).toBe(2);
    expect(store.entities[0]?.metadata).toMatchObject({
      connectorEnrichment: true,
      factKind: 'location_mentioned',
      city: 'Brooklyn',
    });
    expect(store.entities[1]?.metadata).toMatchObject({
      connectorEnrichment: true,
      factKind: 'person_mentioned',
    });
    expect(store.entities[1]?.metadata).not.toHaveProperty('city');
    expect(store.observations).toHaveLength(2);
    expect(
      store.observations.every(observation =>
        Boolean(observation.sourceRecordId)
      )
    ).toBe(true);
  });
});
