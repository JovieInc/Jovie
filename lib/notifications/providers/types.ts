import type {
  EmailMessage,
  InAppMessage,
  NotificationChannelResult,
  SmsMessage,
} from '@/types/notifications';

export interface NotificationProvider {
  provider: string;
  sendEmail?: (message: EmailMessage) => Promise<NotificationChannelResult>;
  sendSms?: (message: SmsMessage) => Promise<NotificationChannelResult>;
  sendInApp?: (message: InAppMessage) => Promise<NotificationChannelResult>;
}
