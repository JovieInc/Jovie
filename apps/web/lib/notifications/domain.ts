import { AUDIENCE_IDENTIFIED_COOKIE } from '@/constants/app';
import { buildInvalidRequestResponse } from '@/lib/notifications/response';

export {
  getNotificationStatusDomain,
  updateContentPreferencesDomain,
  updateNotificationPreferencesDomain,
} from './status';
export { subscribeToNotificationsDomain } from './subscribe';
export { unsubscribeFromNotificationsDomain } from './unsubscribe';
export { buildInvalidRequestResponse };
export const AUDIENCE_COOKIE_NAME = AUDIENCE_IDENTIFIED_COOKIE;
