// src/watcher.js — Main entry point: fetch → diff → alert → persist
import { emitGitHubMasks } from './logger.js';
import logger from './logger.js';
import { fetchPublicPrograms } from './h1-client.js';
import db from './db.js';
import { notify } from './alerter.js';
import { dispatchRecon } from './recon.js';

const DB_PATH = process.env.DB_PATH || 'state/db.json';

/**
 * Main watcher logic.
 * Orchestrates: load state → fetch programs → diff → alert → save state.
 *
 * @param {object} [deps] - injectable dependencies for testing
 * @param {Function} [deps.fetchPrograms] - override fetchPublicPrograms
 * @param {Function} [deps.notifyFn] - override notify
 * @param {Function} [deps.dispatchReconFn] - override dispatchRecon
 * @param {string} [deps.dbPath] - override DB_PATH
 * @returns {Promise<{newPrograms: object[], totalPrograms: number}>}
 */
export async function run(deps = {}) {
    const fetchPrograms = deps.fetchPrograms || fetchPublicPrograms;
    const notifyFn = deps.notifyFn || notify;
    const dispatchReconFn = deps.dispatchReconFn || dispatchRecon;
    const dbPath = deps.dbPath || DB_PATH;

    // Emit GitHub Actions masks for secrets
    emitGitHubMasks();

    logger.info('h1-watcher starting...');

    // Step 1: Load previous state
    const state = await db.load(dbPath);

    // Step 2: Fetch current public programs
    const currentPrograms = await fetchPrograms();
    logger.info(`Fetched ${currentPrograms.length} public programs from HackerOne`);

    // Step 3: Diff to find new programs
    const newPrograms = db.diffPrograms(state, currentPrograms);

    if (newPrograms.length === 0) {
        logger.info('No new programs detected. Nothing to do.');
        // Still save to update last_run timestamp
        await db.save(state, dbPath);
        return { newPrograms: [], totalPrograms: currentPrograms.length };
    }

    logger.info(`🔔 Detected ${newPrograms.length} NEW program(s)!`);
    for (const p of newPrograms) {
        logger.info(`  → ${p.name} (${p.handle}) — ${p.offers_bounties ? 'Bounty' : 'VDP'}`);
    }

    // Step 4: Send alerts
    const alertResult = await notifyFn(newPrograms);
    logger.info('Alert results:', alertResult);

    // Step 5: Dispatch recon if enabled
    await dispatchReconFn(newPrograms);

    // Step 6: Add new programs to DB and save
    db.addPrograms(state, newPrograms);
    await db.save(state, dbPath);

    logger.info(`State updated: ${Object.keys(state.programs).length} total programs tracked`);
    return { newPrograms, totalPrograms: currentPrograms.length };
}

// Run if executed directly (not imported)
const isMainModule =
    process.argv[1] &&
    (process.argv[1].endsWith('/watcher.js') || process.argv[1].endsWith('\\watcher.js'));

if (isMainModule) {
    run()
        .then(({ newPrograms }) => {
            if (newPrograms.length > 0) {
                logger.info(`✅ Done. Alerted for ${newPrograms.length} new program(s).`);
            } else {
                logger.info('✅ Done. No new programs.');
            }
            process.exit(0);
        })
        .catch((error) => {
            logger.error(`❌ Fatal error: ${error.message}`);
            process.exit(1);
        });
}

export default { run };
