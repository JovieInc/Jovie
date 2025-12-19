import type { NotificationProvider } from '@/lib/notifications/providers/types';
import type {
  NotificationChannelResult,
  NotificationDeliveryChannel,
  SmsMessage,
} from '@/types/notifications';

export class SmsStubProvider implements NotificationProvider {
  provider = 'sms_stub';

  async sendSms(message: SmsMessage): Promise<NotificationChannelResult> {
    void message;
    return {
      channel: 'sms' as NotificationDeliveryChannel,
      status: 'skipped',
      provider: this.provider,
      detail: 'SMS delivery not configured',
    };
  }
}
