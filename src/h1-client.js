// src/h1-client.js — HackerOne API client with Basic Auth and retry/backoff
import logger from './logger.js';

const H1_API_BASE = 'https://api.hackerone.com/v1';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Validate that required credentials are present in environment.
 * Fails fast with a clear error if missing.
 */
export function validateCredentials() {
    const username = process.env.H1_API_USERNAME;
    const token = process.env.H1_API_TOKEN;

    if (!username || !token) {
        const missing = [];
        if (!username) missing.push('H1_API_USERNAME');
        if (!token) missing.push('H1_API_TOKEN');
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}. ` +
            'Set these in your .env file or GitHub repository secrets.'
        );
    }

    return { username, token };
}

/**
 * Build Basic Auth header value.
 * @param {string} username
 * @param {string} token
 * @returns {string}
 */
export function buildAuthHeader(username, token) {
    const encoded = Buffer.from(`${username}:${token}`).toString('base64');
    return `Basic ${encoded}`;
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL with retry and exponential backoff.
 * Retries on 429 (rate limit) and 5xx server errors.
 *
 * @param {string} url
 * @param {object} options - fetch options
 * @param {number} attempt - current attempt number (internal)
 * @param {Function} [fetchFn] - fetch implementation (defaults to global fetch)
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options, attempt = 1, fetchFn = fetch) {
    try {
        const response = await fetchFn(url, options);

        // Retry on rate limit or server error
        if ((response.status === 429 || response.status >= 500) && attempt <= MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            logger.warn(
                `HTTP ${response.status} from ${url}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`
            );
            await sleep(delay);
            return fetchWithRetry(url, options, attempt + 1, fetchFn);
        }

        if (!response.ok) {
            throw new Error(`HackerOne API error: HTTP ${response.status} ${response.statusText}`);
        }

        return response;
    } catch (error) {
        if (attempt <= MAX_RETRIES && error.name !== 'Error') {
            // Network errors — retry
            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            logger.warn(
                `Network error fetching ${url}: ${error.message}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`
            );
            await sleep(delay);
            return fetchWithRetry(url, options, attempt + 1, fetchFn);
        }
        throw error;
    }
}

/**
 * Normalize a program object from the HackerOne JSON:API response.
 * @param {object} programData - A single item from `data[]`
 * @returns {object}
 */
export function normalizeProgram(programData) {
    const { id, attributes } = programData;
    return {
        id: String(id),
        handle: attributes.handle,
        name: attributes.name || attributes.handle,
        state: attributes.state,
        submission_state: attributes.submission_state,
        offers_bounties: attributes.offers_bounties ?? false,
        started_accepting_at: attributes.started_accepting_at || null,
    };
}

/**
 * Fetch all public programs from HackerOne API.
 * Handles pagination automatically.
 *
 * @param {object} [deps] - injectable dependencies for testing
 * @param {Function} [deps.fetchFn] - fetch implementation (defaults to global fetch)
 * @returns {Promise<object[]>} Array of normalized program objects
 */
export async function fetchPublicPrograms(deps = {}) {
    const fetchFn = deps.fetchFn || fetch;
    const { username, token } = validateCredentials();
    const authHeader = buildAuthHeader(username, token);

    const headers = {
        Accept: 'application/json',
        Authorization: authHeader,
    };

    const allPrograms = [];
    let url = `${H1_API_BASE}/hackers/programs`;

    while (url) {
        logger.info(`Fetching programs from: ${url.replace(/api\.hackerone\.com.*/, 'api.hackerone.com/...')}`);

        const response = await fetchWithRetry(url, { headers, method: 'GET' }, 1, fetchFn);
        const body = await response.json();

        if (body.data && Array.isArray(body.data)) {
            for (const item of body.data) {
                const program = normalizeProgram(item);
                // Filter: only public programs
                if (program.state === 'public_mode') {
                    allPrograms.push(program);
                }
            }
        }

        // Pagination: follow links.next if present
        url = body.links?.next || null;
    }

    logger.info(`Fetched ${allPrograms.length} public programs total`);
    return allPrograms;
}

export default { fetchPublicPrograms, validateCredentials };
