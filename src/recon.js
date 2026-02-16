// src/recon.js — Optional recon trigger (Phase 3 stub)
// When AUTO_RECON=true, dispatches a repository_dispatch event
// to trigger a recon pipeline for newly discovered programs.

import logger from './logger.js';

/**
 * Check if auto-recon is enabled via environment variable.
 * @returns {boolean}
 */
export function isEnabled() {
    const val = process.env.AUTO_RECON?.toLowerCase();
    return val === 'true' || val === '1';
}

/**
 * Dispatch a recon event for new programs.
 * Sends a repository_dispatch event to the configured GitHub repo.
 *
 * Requires:
 * - GH_PUSH_TOKEN (or GITHUB_TOKEN)
 * - GITHUB_REPOSITORY (auto-set in GitHub Actions)
 *
 * @param {object[]} newPrograms - array of new program objects
 * @param {object} [deps] - injectable dependencies
 * @param {Function} [deps.fetchFn] - fetch implementation
 * @returns {Promise<boolean>}
 */
export async function dispatchRecon(newPrograms, deps = {}) {
    if (!isEnabled()) {
        logger.info('Auto-recon is disabled (set AUTO_RECON=true to enable)');
        return false;
    }

    if (!newPrograms || newPrograms.length === 0) {
        return false;
    }

    const fetchFn = deps.fetchFn || fetch;
    const token = process.env.GH_PUSH_TOKEN || process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;

    if (!token || !repo) {
        logger.warn('Cannot dispatch recon: GH_PUSH_TOKEN/GITHUB_TOKEN or GITHUB_REPOSITORY not set');
        return false;
    }

    const url = `https://api.github.com/repos/${repo}/dispatches`;
    try {
        const response = await fetchFn(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                event_type: 'new-h1-program',
                client_payload: {
                    programs: newPrograms.map((p) => ({
                        handle: p.handle,
                        name: p.name,
                        offers_bounties: p.offers_bounties,
                    })),
                },
            }),
        });

        if (response.status === 204 || response.ok) {
            logger.info(`Recon dispatch sent for ${newPrograms.length} program(s)`);
            return true;
        }

        logger.error(`Recon dispatch failed: HTTP ${response.status}`);
        return false;
    } catch (error) {
        logger.error(`Recon dispatch error: ${error.message}`);
        return false;
    }
}

export default { isEnabled, dispatchRecon };
