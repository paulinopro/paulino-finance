describe('Telegram delivery error logging', () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeEach(() => {
    jest.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-token-must-not-leak';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('node-telegram-bot-api');
    if (originalToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalToken;
    }
  });

  it('logs only safe metadata when Telegram rejects a message', async () => {
    const providerError = Object.assign(new Error('provider rejected request'), {
      code: 'ETELEGRAM',
      response: {
        statusCode: 400,
        request: {
          url: 'https://api.telegram.org/bottelegram-token-must-not-leak/sendMessage',
          form: {
            chat_id: 'telegram-chat-must-not-leak',
            text: 'telegram-message-must-not-leak',
          },
        },
        body: {
          ok: false,
          error_code: 400,
          description: 'Bad Request',
          chat_id: 'telegram-chat-must-not-leak',
        },
      },
    });
    const sendMessage = jest.fn().mockRejectedValue(providerError);
    const TelegramBot = jest.fn().mockImplementation(() => ({ sendMessage }));
    jest.doMock('node-telegram-bot-api', () => TelegramBot);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { sendTelegramMessage } = require('./telegramService') as typeof import('./telegramService');

    await expect(sendTelegramMessage('telegram-chat-must-not-leak', 'telegram-message-must-not-leak'))
      .resolves.toBe(false);

    const logText = errorSpy.mock.calls.map((args) => JSON.stringify(args)).join('\n');
    expect(logText).toContain('TELEGRAM_SEND_FAILED');
    expect(logText).toContain('400');
    expect(logText).not.toContain('telegram-token-must-not-leak');
    expect(logText).not.toContain('telegram-chat-must-not-leak');
    expect(logText).not.toContain('telegram-message-must-not-leak');
    expect(logText).not.toContain('api.telegram.org');
    expect(logText).not.toContain('sendMessage');
  });
});
