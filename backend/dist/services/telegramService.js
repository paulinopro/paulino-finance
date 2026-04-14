"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTelegramBot = exports.sendTelegramMessage = exports.initializeTelegramBot = void 0;
// Telegram types can fail to resolve cleanly under ts-node in Docker,
// but the runtime module is present. Use require and treat it as any.
// @ts-ignore - ignore type resolution for this import, we provide a loose type below
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TelegramBot = require('node-telegram-bot-api');
let bot = null;
const initializeTelegramBot = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.log('Telegram Bot Token not provided. Notifications via Telegram will be disabled.');
        return null;
    }
    try {
        bot = new TelegramBot(token, { polling: false });
        console.log('Telegram Bot initialized successfully');
        return bot;
    }
    catch (error) {
        console.error('Error initializing Telegram Bot:', error);
        return null;
    }
};
exports.initializeTelegramBot = initializeTelegramBot;
const sendTelegramMessage = async (chatId, message) => {
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
        }
        catch (error) {
            console.error('Error initializing Telegram Bot:', error);
            return false;
        }
    }
    try {
        await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
        return true;
    }
    catch (error) {
        console.error('Error sending Telegram message:', error);
        if (error.response?.body) {
            const errorBody = error.response.body;
            console.error('Telegram API error:', errorBody.description || errorBody);
            // Provide more specific error messages
            if (errorBody.error_code === 401) {
                console.error('Invalid Telegram Bot Token. Please check your TELEGRAM_BOT_TOKEN.');
            }
            else if (errorBody.error_code === 400) {
                console.error('Invalid Chat ID or bot not started. Make sure you have started a conversation with the bot first.');
            }
            else if (errorBody.error_code === 404) {
                console.error('Chat ID not found. Make sure you have started a conversation with the bot and the Chat ID is correct.');
            }
        }
        if (error.code === 'ETELEGRAM') {
            console.error('Telegram API error details:', error.response?.body);
        }
        return false;
    }
};
exports.sendTelegramMessage = sendTelegramMessage;
const getTelegramBot = () => bot;
exports.getTelegramBot = getTelegramBot;
//# sourceMappingURL=telegramService.js.map