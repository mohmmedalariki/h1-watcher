// src/alerter.js — Telegram + Discord webhook alerter (pluggable)
import logger from './logger.js';

const TELEGRAM_MAX_LENGTH = 4096;
const DISCORD_MAX_LENGTH = 2000;

/**
 * Escape HTML special characters for Telegram HTML mode.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Format a single program entry for Telegram (HTML).
 * @param {object} p
 * @returns {string}
 */
function formatTelegramEntry(p) {
    const bounty = p.offers_bounties ? '💰 Bounty' : '🏅 VDP';
    const safeName = escapeHtml(p.name);
    const safeHandle = escapeHtml(p.handle);
    return `• <b>${safeName}</b> (<code>${safeHandle}</code>) — ${bounty}\n  → https://hackerone.com/${p.handle}`;
}

/**
 * Format a single program entry for Discord.
 * @param {object} p
 * @returns {string}
 */
function formatDiscordEntry(p) {
    const bounty = p.offers_bounties ? '💰 Bounty' : '🏅 VDP';
    return `• **${p.name}** (\`${p.handle}\`) — ${bounty}\n  → <https://hackerone.com/${p.handle}>`;
}

/**
 * Format an array of new programs into a human-readable message (Telegram).
 * @param {object[]} programs
 * @returns {string}
 */
export function formatMessage(programs) {
    const header = `🔔 <b>h1-watcher</b> — ${programs.length} new HackerOne program${programs.length > 1 ? 's' : ''} detected!`;
    const lines = programs.map(formatTelegramEntry);
    return `${header}\n\n${lines.join('\n\n')}`;
}

/**
 * Format message specifically for Discord.
 * @param {object[]} programs
 * @returns {string}
 */
export function formatDiscordMessage(programs) {
    const header = `🔔 **h1-watcher** — ${programs.length} new HackerOne program${programs.length > 1 ? 's' : ''} detected!`;
    const lines = programs.map(formatDiscordEntry);
    return `${header}\n\n${lines.join('\n\n')}`;
}

/**
 * Split programs into chunked messages that fit within a character limit.
 * Each chunk gets a header with the part number.
 *
 * @param {object[]} programs - all new programs
 * @param {Function} entryFormatter - formats a single program into a string
 * @param {string} headerPrefix - bold prefix like "*h1-watcher*" or "**h1-watcher**"
 * @param {number} maxLength - max chars per message
 * @returns {string[]} array of message strings
 */
export function chunkMessages(programs, entryFormatter, headerPrefix, maxLength) {
    if (programs.length === 0) return [];

    // Try single message first
    const singleHeader = `🔔 ${headerPrefix} — ${programs.length} new HackerOne program${programs.length > 1 ? 's' : ''} detected!`;
    const allEntries = programs.map(entryFormatter);
    const singleMessage = `${singleHeader}\n\n${allEntries.join('\n\n')}`;

    if (singleMessage.length <= maxLength) {
        return [singleMessage];
    }

    // Need to split into multiple messages
    const chunks = [];
    let currentEntries = [];
    let currentLength = 0;

    for (const entry of allEntries) {
        // Estimate chunk header length (generous)
        const chunkHeader = `🔔 ${headerPrefix} — ${programs.length} new programs (part ${chunks.length + 1}):\n\n`;
        const separatorLength = currentEntries.length > 0 ? 2 : 0; // '\n\n'
        const projectedLength = chunkHeader.length + currentLength + separatorLength + entry.length;

        if (projectedLength > maxLength && currentEntries.length > 0) {
            // Finalize current chunk
            const header = `🔔 ${headerPrefix} — ${programs.length} new programs (part ${chunks.length + 1}):`;
            chunks.push(`${header}\n\n${currentEntries.join('\n\n')}`);
            currentEntries = [];
            currentLength = 0;
        }

        currentEntries.push(entry);
        currentLength += (currentEntries.length > 1 ? 2 : 0) + entry.length;
    }

    // Finalize last chunk
    if (currentEntries.length > 0) {
        const header = `🔔 ${headerPrefix} — ${programs.length} new programs (part ${chunks.length + 1}):`;
        chunks.push(`${header}\n\n${currentEntries.join('\n\n')}`);
    }

    return chunks;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a Telegram message via Bot API.
 * Automatically splits long messages into chunks.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.
 *
 * @param {string} text - message text (Markdown)
 * @param {object} [deps] - injectable dependencies
 * @param {Function} [deps.fetchFn] - fetch implementation
 * @returns {Promise<boolean>} true if sent successfully
 */
export async function sendTelegram(text, deps = {}) {
    const fetchFn = deps.fetchFn || fetch;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        logger.info('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing), skipping');
        return false;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const response = await fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            logger.error(`Telegram API error: HTTP ${response.status} — ${body}`);
            return false;
        }

        logger.info('Telegram notification sent successfully');
        return true;
    } catch (error) {
        logger.error(`Telegram send failed: ${error.message}`);
        return false;
    }
}

/**
 * Send a Discord webhook message.
 * Requires DISCORD_WEBHOOK_URL env var.
 *
 * @param {string} text - message text
 * @param {object} [deps] - injectable dependencies
 * @param {Function} [deps.fetchFn] - fetch implementation
 * @returns {Promise<boolean>} true if sent successfully
 */
export async function sendDiscord(text, deps = {}) {
    const fetchFn = deps.fetchFn || fetch;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
        logger.info('Discord not configured (DISCORD_WEBHOOK_URL missing), skipping');
        return false;
    }

    try {
        const response = await fetchFn(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: text,
                username: 'h1-watcher',
            }),
        });

        // Discord returns 204 No Content on success
        if (!response.ok && response.status !== 204) {
            const body = await response.text();
            logger.error(`Discord webhook error: HTTP ${response.status} — ${body}`);
            return false;
        }

        logger.info('Discord notification sent successfully');
        return true;
    } catch (error) {
        logger.error(`Discord send failed: ${error.message}`);
        return false;
    }
}

/**
 * Send alert notifications to all configured channels.
 * Automatically chunks long messages to fit platform limits.
 *
 * @param {object[]} newPrograms - array of normalized program objects
 * @param {object} [deps] - injectable dependencies
 * @param {Function} [deps.fetchFn] - fetch implementation
 * @returns {Promise<{telegram: boolean, discord: boolean}>}
 */
export async function notify(newPrograms, deps = {}) {
    if (!newPrograms || newPrograms.length === 0) {
        logger.info('No new programs to notify about');
        return { telegram: false, discord: false };
    }

    logger.info(`Sending alerts for ${newPrograms.length} new program(s)`);

    // Chunk messages to fit platform limits
    const telegramChunks = chunkMessages(
        newPrograms, formatTelegramEntry, '<b>h1-watcher</b>', TELEGRAM_MAX_LENGTH
    );
    const discordChunks = chunkMessages(
        newPrograms, formatDiscordEntry, '**h1-watcher**', DISCORD_MAX_LENGTH
    );

    // Send Telegram messages sequentially with delay
    let telegramOk = false;
    if (telegramChunks.length > 0) {
        logger.info(`Sending ${telegramChunks.length} Telegram message(s)`);
        telegramOk = true;
        for (let i = 0; i < telegramChunks.length; i++) {
            const ok = await sendTelegram(telegramChunks[i], deps);
            if (!ok) telegramOk = false;
            if (i < telegramChunks.length - 1) await sleep(500); // rate limit
        }
    }

    // Send Discord messages sequentially with delay
    let discordOk = false;
    if (discordChunks.length > 0) {
        logger.info(`Sending ${discordChunks.length} Discord message(s)`);
        discordOk = true;
        for (let i = 0; i < discordChunks.length; i++) {
            const ok = await sendDiscord(discordChunks[i], deps);
            if (!ok) discordOk = false;
            if (i < discordChunks.length - 1) await sleep(500); // rate limit
        }
    }

    return { telegram: telegramOk, discord: discordOk };
}

export default { notify, formatMessage, formatDiscordMessage, sendTelegram, sendDiscord, chunkMessages };
