/**
 * Google Measurement Protocol (GA4) Forwarding
 *
 * Forwards pixel events to Google Analytics 4 via Measurement Protocol.
 * https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */

import { logger } from '@/lib/utils/logger';
import type { ForwardingResult, NormalizedEvent, PlatformConfig } from './types';

const GOOGLE_MP_URL = 'https://www.google-analytics.com/mp/collect';

/**
 * Map our event types to Google GA4 events
 */
function mapEventToGoogle(
  eventType: NormalizedEvent['eventType']
): string {
  switch (eventType) {
    case 'page_view':
      return 'page_view';
    case 'link_click':
      return 'click';
    case 'form_submit':
      return 'generate_lead';
    case 'scroll_depth':
      return 'scroll';
    default:
      return 'page_view';
  }
}

/**
 * Forward an event to Google Measurement Protocol
 */
export async function forwardToGoogle(
  event: NormalizedEvent,
  config: PlatformConfig
): Promise<ForwardingResult> {
  const { pixelId: measurementId, accessToken: apiSecret } = config;

  try {
    // Client ID is required - we use the IP hash as a pseudo-anonymous identifier
    const clientId = event.ipHash.substring(0, 36) || 'anonymous';

    const url = `${GOOGLE_MP_URL}?measurement_id=${measurementId}&api_secret=${apiSecret}`;

    const payload = {
      client_id: clientId,
      timestamp_micros: event.eventTime * 1000000,
      events: [
        {
          name: mapEventToGoogle(event.eventType),
          params: {
            // Event parameters
            page_location: event.sourceUrl,
            page_referrer: event.referrer,
            engagement_time_msec: 100, // Required for session tracking

            // Custom parameters
            ...(event.linkId && { link_id: event.linkId }),
            ...(event.linkUrl && { link_url: event.linkUrl }),
            ...(event.formType && { form_type: event.formType }),

            // UTM parameters (GA4 handles these automatically if present in page_location)
            ...(event.utmSource && { campaign_source: event.utmSource }),
            ...(event.utmMedium && { campaign_medium: event.utmMedium }),
            ...(event.utmCampaign && { campaign_name: event.utmCampaign }),
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

    // Google MP returns 204 No Content on success
    if (response.status === 204 || response.ok) {
      return {
        platform: 'google',
        success: true,
      };
    }

    const errorBody = await response.text();
    logger.error('[Google MP] Forward failed', {
      status: response.status,
      error: errorBody,
      eventId: event.eventId,
    });

    return {
      platform: 'google',
      success: false,
      error: `HTTP ${response.status}: ${errorBody}`,
    };
  } catch (error) {
    logger.error('[Google MP] Forward error', {
      error,
      eventId: event.eventId,
    });

    return {
      platform: 'google',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
