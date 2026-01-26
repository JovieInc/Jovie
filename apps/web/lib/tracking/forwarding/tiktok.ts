/**
 * TikTok Events API Forwarding
 *
 * Forwards pixel events to TikTok via the Events API.
 * https://business-api.tiktok.com/portal/docs?id=1771101027431425
 */

import { logger } from '@/lib/utils/logger';
import type {
  ForwardingResult,
  NormalizedEvent,
  PlatformConfig,
} from './types';

const TIKTOK_API_URL =
  'https://business-api.tiktok.com/open_api/v1.3/event/track/';

/**
 * Map our event types to TikTok standard events
 */
function mapEventToTikTok(eventType: NormalizedEvent['eventType']): string {
  switch (eventType) {
    case 'page_view':
      return 'ViewContent';
    case 'link_click':
      return 'ClickButton';
    case 'form_submit':
      return 'SubmitForm';
    case 'scroll_depth':
      return 'ViewContent';
    default:
      return 'ViewContent';
  }
}

/**
 * Forward an event to TikTok Events API
 */
export async function forwardToTikTok(
  event: NormalizedEvent,
  config: PlatformConfig
): Promise<ForwardingResult> {
  const { pixelId, accessToken } = config;

  try {
    const payload = {
      pixel_code: pixelId,
      event: mapEventToTikTok(event.eventType),
      event_id: event.eventId,
      timestamp: new Date(event.eventTime * 1000).toISOString(),
      context: {
        page: {
          url: event.sourceUrl,
          referrer: event.referrer,
        },
        user_agent: event.userAgent,
        ip: event.ipHash, // Already hashed
      },
      properties: {
        content_type: 'profile',
        ...(event.linkId && { content_id: event.linkId }),
        ...(event.linkUrl && { content_name: event.linkUrl }),
        ...(event.utmSource && { utm_source: event.utmSource }),
        ...(event.utmMedium && { utm_medium: event.utmMedium }),
        ...(event.utmCampaign && { utm_campaign: event.utmCampaign }),
      },
    };

    const response = await fetch(TIKTOK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('[TikTok Events API] Forward failed', {
        status: response.status,
        error: errorBody,
        eventId: event.eventId,
      });

      return {
        platform: 'tiktok',
        success: false,
        error: `HTTP ${response.status}: ${errorBody}`,
      };
    }

    const result = await response.json();

    // TikTok returns { code: 0 } on success
    if (result.code === 0) {
      return {
        platform: 'tiktok',
        success: true,
        responseId: result.request_id,
      };
    }

    return {
      platform: 'tiktok',
      success: false,
      error: result.message || 'Unknown TikTok API error',
    };
  } catch (error) {
    logger.error('[TikTok Events API] Forward error', {
      error,
      eventId: event.eventId,
    });

    return {
      platform: 'tiktok',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
