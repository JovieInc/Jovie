/**
 * Facebook Conversions API (CAPI) Forwarding
 *
 * Forwards pixel events to Facebook via the Conversions API.
 * https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import { logger } from '@/lib/utils/logger';
import type {
  ForwardingResult,
  NormalizedEvent,
  PlatformConfig,
} from './types';

const FACEBOOK_API_VERSION = 'v18.0';
const FACEBOOK_API_URL = 'https://graph.facebook.com';

/**
 * Map our event types to Facebook standard events
 */
function mapEventToFacebook(eventType: NormalizedEvent['eventType']): string {
  switch (eventType) {
    case 'page_view':
      return 'PageView';
    case 'link_click':
      return 'ViewContent';
    case 'form_submit':
      return 'Lead';
    case 'scroll_depth':
      return 'ViewContent';
    default:
      return 'PageView';
  }
}

/**
 * Forward an event to Facebook Conversions API
 */
export async function forwardToFacebook(
  event: NormalizedEvent,
  config: PlatformConfig
): Promise<ForwardingResult> {
  const { pixelId, accessToken } = config;

  try {
    const url = `${FACEBOOK_API_URL}/${FACEBOOK_API_VERSION}/${pixelId}/events?access_token=${accessToken}`;

    const payload = {
      data: [
        {
          event_name: mapEventToFacebook(event.eventType),
          event_time: event.eventTime,
          event_id: event.eventId,
          event_source_url: event.sourceUrl,
          action_source: 'website',
          user_data: {
            // We only send hashed/anonymized data
            client_ip_address: event.ipHash, // Already hashed
            client_user_agent: event.userAgent,
          },
          custom_data: {
            content_type: 'profile',
            ...(event.linkId && { content_ids: [event.linkId] }),
            ...(event.linkUrl && { content_name: event.linkUrl }),
            ...(event.utmSource && { utm_source: event.utmSource }),
            ...(event.utmMedium && { utm_medium: event.utmMedium }),
            ...(event.utmCampaign && { utm_campaign: event.utmCampaign }),
          },
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('[Facebook CAPI] Forward failed', {
        status: response.status,
        error: errorBody,
        eventId: event.eventId,
      });

      return {
        platform: 'facebook',
        success: false,
        error: `HTTP ${response.status}: ${errorBody}`,
      };
    }

    const result = await response.json();

    return {
      platform: 'facebook',
      success: true,
      responseId: result.events_received?.toString(),
    };
  } catch (error) {
    logger.error('[Facebook CAPI] Forward error', {
      error,
      eventId: event.eventId,
    });

    return {
      platform: 'facebook',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
