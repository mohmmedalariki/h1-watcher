// tests/db.test.js — Unit tests for JSON DB wrapper
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { load, save, createEmptyDb, addPrograms } from '../src/db.js';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let testDir;
let testDbPath;

beforeEach(async () => {
    testDir = join(tmpdir(), `h1-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    testDbPath = join(testDir, 'db.json');
});

afterEach(async () => {
    if (existsSync(testDir)) {
        await rm(testDir, { recursive: true, force: true });
    }
});

describe('load', () => {
    it('returns empty DB when file does not exist', async () => {
        const db = await load(join(testDir, 'nonexistent.json'));

        expect(db).toEqual({ programs: {}, last_run: null });
    });

    it('loads existing valid DB file', async () => {
        const data = {
            programs: { '1': { handle: 'test', name: 'Test', first_seen: '2024-01-01T00:00:00Z' } },
            last_run: '2024-01-01T00:00:00Z',
        };
        await writeFile(testDbPath, JSON.stringify(data), 'utf-8');

        const db = await load(testDbPath);

        expect(db.programs['1'].handle).toBe('test');
        expect(db.last_run).toBe('2024-01-01T00:00:00Z');
    });

    it('returns empty DB on invalid JSON', async () => {
        await writeFile(testDbPath, '{{{invalid json', 'utf-8');

        const db = await load(testDbPath);

        expect(db).toEqual({ programs: {}, last_run: null });
    });

    it('returns empty DB on invalid structure', async () => {
        await writeFile(testDbPath, JSON.stringify({ foo: 'bar' }), 'utf-8');

        const db = await load(testDbPath);

        expect(db).toEqual({ programs: {}, last_run: null });
    });
});

describe('save', () => {
    it('saves DB to file and creates directory', async () => {
        const nestedPath = join(testDir, 'nested', 'deep', 'db.json');
        const db = createEmptyDb();
        addPrograms(db, [
            {
                id: '1',
                handle: 'test',
                name: 'Test',
                state: 'public_mode',
                submission_state: 'open',
                offers_bounties: true,
                started_accepting_at: null,
            },
        ]);

        await save(db, nestedPath);

        expect(existsSync(nestedPath)).toBe(true);
        const loaded = await load(nestedPath);
        expect(loaded.programs['1'].handle).toBe('test');
        expect(loaded.last_run).toBeTruthy();
    });

    it('updates last_run timestamp on save', async () => {
        const db = createEmptyDb();
        expect(db.last_run).toBeNull();

        await save(db, testDbPath);

        expect(db.last_run).toBeTruthy();
        const ts = new Date(db.last_run).getTime();
        expect(ts).toBeGreaterThan(0);
    });
});
