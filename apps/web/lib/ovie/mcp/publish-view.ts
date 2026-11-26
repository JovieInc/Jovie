import { PublishViewError, publishView } from '@/lib/views/service.server';
import { OvieMcpInputError } from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUBLISH_VIEW_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['spec'],
  properties: {
    spec: { type: 'object' },
    view_id: { type: 'string', format: 'uuid' },
    created_by: { type: 'string', minLength: 1, maxLength: 80 },
  },
} as const;

/** Publishes as the authenticated app user; owner must be a users.id uuid. */
export async function publishViewForOwner(
  ownerUserId: string,
  input: {
    spec: unknown;
    viewId?: string;
    createdBy?: string;
  }
) {
  if (!UUID_PATTERN.test(ownerUserId))
    throw new OvieMcpInputError('authenticated app user subject is required');
  const viewId = input.viewId?.trim();
  if (viewId && !UUID_PATTERN.test(viewId))
    throw new OvieMcpInputError('view not found');
  try {
    const published = await publishView({
      ownerUserId,
      viewId: viewId || undefined,
      spec: input.spec,
      createdBy: input.createdBy?.trim().slice(0, 80) || 'agent',
    });
    return { id: published.id, version: published.version, url: published.url };
  } catch (error) {
    if (error instanceof PublishViewError) {
      throw new OvieMcpInputError(
        error.code === 'view_not_found' ? 'view not found' : 'invalid view spec'
      );
    }
    throw error;
  }
}
