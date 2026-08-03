// Telegram types can fail to resolve cleanly under ts-node in Docker,
// but the runtime module is present. Use require and treat it as any.
// @ts-ignore - ignore type resolution for this import, we provide a loose type below
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TelegramBot = require('node-telegram-bot-api');

let bot: any | null = null;

function safeTelegramErrorMetadata(error: unknown): { code: string; statusCode?: number } {
  const candidate = error as {
    code?: unknown;
    response?: { statusCode?: unknown; body?: { error_code?: unknown } };
  };
  const rawCode = typeof candidate?.code === 'string' ? candidate.code : '';
  const code = /^[A-Z0-9_]{1,64}$/.test(rawCode) ? rawCode : 'UNKNOWN';
  const responseStatus = candidate?.response?.statusCode;
  const bodyStatus = candidate?.response?.body?.error_code;
  const statusCode = typeof responseStatus === 'number'
    ? responseStatus
    : typeof bodyStatus === 'number'
      ? bodyStatus
      : undefined;
  return statusCode === undefined ? { code } : { code, statusCode };
}

export const initializeTelegramBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('Telegram Bot Token not provided. Notifications via Telegram will be disabled.');
    return null;
  }

  try {
    bot = new TelegramBot(token, { polling: false });
    console.log('Telegram Bot initialized successfully');
    return bot;
  } catch (error) {
    console.error('[Telegram] TELEGRAM_INIT_FAILED', safeTelegramErrorMetadata(error));
    return null;
  }
};

export const sendTelegramMessage = async (chatId: string, message: string): Promise<boolean> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  // Check if token is configured
  if (!token || token === 'your-telegram-bot-token' || token.trim() === '') {
    console.error('Telegram Bot Token is not configured. Please set TELEGRAM_BOT_TOKEN in your environment variables.');
    return false;
  }

  // Initialize bot if not already initialized
  if (!bot) {
    try {
      bot = new TelegramBot(token, { polling: false });
      console.log('Telegram Bot initialized successfully');
    } catch (error: unknown) {
      console.error('[Telegram] TELEGRAM_INIT_FAILED', safeTelegramErrorMetadata(error));
      return false;
    }
  }

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    return true;
  } catch (error: unknown) {
    console.error('[Telegram] TELEGRAM_SEND_FAILED', safeTelegramErrorMetadata(error));
    return false;
  }
};

export const getTelegramBot = () => bot;
