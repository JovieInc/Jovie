import type { NotificationProvider } from '@/lib/notifications/providers/types';
import type {
  InAppMessage,
  NotificationChannelResult,
  NotificationDeliveryChannel,
} from '@/types/notifications';

export class InAppStubProvider implements NotificationProvider {
  provider = 'in_app_stub';

  async sendInApp(message: InAppMessage): Promise<NotificationChannelResult> {
    void message;
    return {
      channel: 'in_app' as NotificationDeliveryChannel,
      status: 'skipped',
      provider: this.provider,
      detail: 'In-app delivery not configured',
    };
  }
}
