// src/db.js — JSON file-based state persistence
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import logger from './logger.js';

const DEFAULT_DB_PATH = 'state/db.json';

/**
 * Create the initial empty database structure.
 * @returns {object}
 */
export function createEmptyDb() {
    return {
        programs: {},
        last_run: null,
    };
}

/**
 * Load the database from disk.
 * If the file doesn't exist, returns an empty DB.
 *
 * @param {string} [dbPath] - path to the db.json file
 * @returns {Promise<object>}
 */
export async function load(dbPath = DEFAULT_DB_PATH) {
    try {
        if (!existsSync(dbPath)) {
            logger.info(`No existing DB found at ${dbPath}, starting fresh`);
            return createEmptyDb();
        }

        const raw = await readFile(dbPath, 'utf-8');
        const data = JSON.parse(raw);

        // Validate structure
        if (!data || typeof data.programs !== 'object') {
            logger.warn('DB file has invalid structure, starting fresh');
            return createEmptyDb();
        }

        const knownCount = Object.keys(data.programs).length;
        logger.info(`Loaded DB with ${knownCount} known programs`);
        return data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('DB file not found, starting fresh');
            return createEmptyDb();
        }
        logger.error(`Error loading DB: ${error.message}`);
        return createEmptyDb();
    }
}

/**
 * Save the database to disk.
 * Creates parent directories if they don't exist.
 *
 * @param {object} db - the database object
 * @param {string} [dbPath] - path to the db.json file
 * @returns {Promise<void>}
 */
export async function save(db, dbPath = DEFAULT_DB_PATH) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }

    db.last_run = new Date().toISOString();
    await writeFile(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf-8');
    logger.info(`DB saved to ${dbPath}`);
}

/**
 * Get a Set of all known program IDs.
 * @param {object} db
 * @returns {Set<string>}
 */
export function getKnownIds(db) {
    return new Set(Object.keys(db.programs));
}

/**
 * Add an array of new programs to the database.
 * Skips programs that are already known (deduplication).
 *
 * @param {object} db - the database object (mutated in place)
 * @param {object[]} programs - array of normalized program objects
 * @returns {object[]} array of programs that were actually added (new ones)
 */
export function addPrograms(db, programs) {
    const knownIds = getKnownIds(db);
    const added = [];

    for (const program of programs) {
        if (!knownIds.has(String(program.id))) {
            db.programs[String(program.id)] = {
                handle: program.handle,
                name: program.name,
                state: program.state,
                submission_state: program.submission_state,
                offers_bounties: program.offers_bounties,
                started_accepting_at: program.started_accepting_at,
                first_seen: new Date().toISOString(),
            };
            added.push(program);
        }
    }

    return added;
}

/**
 * Diff current programs against the DB and return only new ones.
 *
 * @param {object} db - the database object
 * @param {object[]} currentPrograms - array of normalized program objects
 * @returns {object[]} array of new programs not yet in the DB
 */
export function diffPrograms(db, currentPrograms) {
    const knownIds = getKnownIds(db);
    return currentPrograms.filter((p) => !knownIds.has(String(p.id)));
}

export default { load, save, getKnownIds, addPrograms, diffPrograms, createEmptyDb };
