// tests/alerter.test.js — Unit tests for Telegram + Discord alerter
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    formatMessage,
    formatDiscordMessage,
    sendTelegram,
    sendDiscord,
    notify,
} from '../src/alerter.js';

const samplePrograms = [
    {
        id: '1',
        handle: 'acme',
        name: 'Acme Corp',
        offers_bounties: true,
    },
    {
        id: '2',
        handle: 'betacorp',
        name: 'Beta Corp',
        offers_bounties: false,
    },
];

function mockResponse(status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => 'ok',
    };
}

describe('formatMessage (Telegram)', () => {
    it('formats single program', () => {
        const msg = formatMessage([samplePrograms[0]]);

        expect(msg).toContain('1 new HackerOne program detected');
        expect(msg).toContain('Acme Corp');
        expect(msg).toContain('<code>acme</code>');
        expect(msg).toContain('💰 Bounty');
        expect(msg).toContain('https://hackerone.com/acme');
    });

    it('formats multiple programs with plural', () => {
        const msg = formatMessage(samplePrograms);

        expect(msg).toContain('2 new HackerOne programs detected');
        expect(msg).toContain('Acme Corp');
        expect(msg).toContain('Beta Corp');
        expect(msg).toContain('🏅 VDP');
    });
});

describe('formatDiscordMessage', () => {
    it('uses Discord markdown (** instead of *)', () => {
        const msg = formatDiscordMessage(samplePrograms);

        expect(msg).toContain('**h1-watcher**');
        expect(msg).toContain('**Acme Corp**');
        expect(msg).toContain('<https://hackerone.com/acme>');
    });
});

describe('sendTelegram', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('skips when credentials are missing', async () => {
        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_CHAT_ID;

        const result = await sendTelegram('test message');

        expect(result).toBe(false);
    });

    it('sends message when configured', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'fake-bot-token';
        process.env.TELEGRAM_CHAT_ID = '12345';

        const mockFetch = vi.fn().mockResolvedValue(mockResponse(200));

        const result = await sendTelegram('test message', { fetchFn: mockFetch });

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('api.telegram.org');
        expect(url).toContain('fake-bot-token');
        const body = JSON.parse(options.body);
        expect(body.chat_id).toBe('12345');
        expect(body.text).toBe('test message');
        expect(body.parse_mode).toBe('HTML');
    });

    it('returns false on API error', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'fake-bot-token';
        process.env.TELEGRAM_CHAT_ID = '12345';

        const mockFetch = vi.fn().mockResolvedValue(mockResponse(400));

        const result = await sendTelegram('test', { fetchFn: mockFetch });

        expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'fake-bot-token';
        process.env.TELEGRAM_CHAT_ID = '12345';

        const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

        const result = await sendTelegram('test', { fetchFn: mockFetch });

        expect(result).toBe(false);
    });
});

describe('sendDiscord', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('skips when webhook URL is missing', async () => {
        delete process.env.DISCORD_WEBHOOK_URL;

        const result = await sendDiscord('test message');

        expect(result).toBe(false);
    });

    it('sends message when configured', async () => {
        process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/fake';

        const mockFetch = vi.fn().mockResolvedValue(mockResponse(204));

        const result = await sendDiscord('test message', { fetchFn: mockFetch });

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe('https://discord.com/api/webhooks/fake');
        const body = JSON.parse(options.body);
        expect(body.content).toBe('test message');
        expect(body.username).toBe('h1-watcher');
    });

    it('returns false on webhook error', async () => {
        process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/fake';

        const mockFetch = vi.fn().mockResolvedValue(mockResponse(400));

        const result = await sendDiscord('test', { fetchFn: mockFetch });

        expect(result).toBe(false);
    });
});

describe('notify', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('returns false for both when no programs', async () => {
        const result = await notify([]);

        expect(result).toEqual({ telegram: false, discord: false });
    });

    it('returns false for both when programs is null', async () => {
        const result = await notify(null);

        expect(result).toEqual({ telegram: false, discord: false });
    });

    it('sends to all configured channels', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'fake-bot-token';
        process.env.TELEGRAM_CHAT_ID = '12345';
        process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/fake';

        const mockFetch = vi.fn().mockResolvedValue(mockResponse(200));

        const result = await notify(samplePrograms, { fetchFn: mockFetch });

        expect(result.telegram).toBe(true);
        expect(result.discord).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });
});
