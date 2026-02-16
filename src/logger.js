// src/logger.js — Structured logger with secret masking
// Ensures no secret values ever appear in logs

const LOG_LEVELS = { error: 0, warn: 1, info: 2 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

/**
 * List of env var names that hold secret values.
 * Their values will be masked if they accidentally appear in log output.
 */
const SECRET_ENV_KEYS = [
  'H1_API_USERNAME',
  'H1_API_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'DISCORD_WEBHOOK_URL',
  'GH_PUSH_TOKEN',
];

/** Build a list of secret values to scrub from log messages */
function getSecretValues() {
  const secrets = [];
  for (const key of SECRET_ENV_KEYS) {
    const val = process.env[key];
    if (val && val.length > 0) {
      secrets.push(val);
    }
  }
  return secrets;
}

/**
 * Mask any secret values that might appear in a log message.
 * Also issues GitHub Actions ::add-mask:: for each secret on first use.
 */
let masksEmitted = false;

export function emitGitHubMasks() {
  if (masksEmitted) return;
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const val of getSecretValues()) {
      // This tells GitHub Actions to redact this value from all logs
      process.stdout.write(`::add-mask::${val}\n`);
    }
  }
  masksEmitted = true;
}

function maskSecrets(message) {
  let masked = String(message);
  for (const secret of getSecretValues()) {
    masked = masked.replaceAll(secret, '***REDACTED***');
  }
  return masked;
}

function formatMessage(level, message, data) {
  const timestamp = new Date().toISOString();
  const safeMessage = maskSecrets(message);
  const base = `[${timestamp}] [${level.toUpperCase()}] ${safeMessage}`;
  if (data !== undefined) {
    const safeData = maskSecrets(JSON.stringify(data));
    return `${base} ${safeData}`;
  }
  return base;
}

export const logger = {
  error(message, data) {
    if (currentLevel >= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, data));
    }
  },
  warn(message, data) {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, data));
    }
  },
  info(message, data) {
    if (currentLevel >= LOG_LEVELS.info) {
      console.log(formatMessage('info', message, data));
    }
  },
};

export default logger;
