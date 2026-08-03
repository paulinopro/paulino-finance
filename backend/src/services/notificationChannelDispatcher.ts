import { sendWhatsAppMessage } from './openWaService';
import { sendTelegramMessage } from './telegramService';
import { sendPushForNotification } from './webPushService';

export type NotificationChannel = 'PUSH' | 'TELEGRAM' | 'WHATSAPP';

export type ChannelDeliveryResult = {
  channel: NotificationChannel;
  ok: boolean;
  errorCode?: string;
};

type DeliveryInput = {
  userId: number;
  notificationId: number;
  title: string;
  message: string;
  telegram?: { enabled: boolean; chatId: string | null };
  whatsapp?: { enabled: boolean; phone: string | null };
  pushEnabled: boolean;
};

function logDeliveryFailure(
  channel: NotificationChannel,
  input: Pick<DeliveryInput, 'userId' | 'notificationId'>,
  errorCode: string
): void {
  console.error('[notifications] channel delivery failed', {
    channel,
    userId: input.userId,
    notificationId: input.notificationId,
    errorCode,
  });
}

async function settleDelivery(
  channel: NotificationChannel,
  input: Pick<DeliveryInput, 'userId' | 'notificationId'>,
  delivery: () => Promise<{ ok: boolean; errorCode?: string }>
): Promise<ChannelDeliveryResult> {
  try {
    const result = await delivery();
    if (!result.ok) {
      const errorCode = result.errorCode || 'SEND_FAILED';
      logDeliveryFailure(channel, input, errorCode);
      return { channel, ok: false, errorCode };
    }
    return { channel, ok: true };
  } catch {
    logDeliveryFailure(channel, input, 'SEND_FAILED');
    return { channel, ok: false, errorCode: 'SEND_FAILED' };
  }
}

export async function dispatchNotificationChannels(input: DeliveryInput): Promise<ChannelDeliveryResult[]> {
  const deliveries: Array<Promise<ChannelDeliveryResult>> = [];

  if (input.telegram?.enabled && input.telegram.chatId) {
    deliveries.push(settleDelivery('TELEGRAM', input, async () => ({
      ok: await sendTelegramMessage(input.telegram!.chatId!, input.message),
    })));
  }

  if (input.whatsapp?.enabled && input.whatsapp.phone) {
    deliveries.push(settleDelivery('WHATSAPP', input, async () => {
      const result = await sendWhatsAppMessage(input.whatsapp!.phone!, input.message);
      return result.ok ? { ok: true } : { ok: false, errorCode: result.code };
    }));
  }

  if (input.pushEnabled) {
    deliveries.push(settleDelivery('PUSH', input, async () => {
      await sendPushForNotification(input.userId, {
        title: input.title,
        message: input.message,
        notificationId: input.notificationId,
      });
      return { ok: true };
    }));
  }

  return Promise.all(deliveries);
}
