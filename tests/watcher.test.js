// tests/watcher.test.js — Integration tests for watcher orchestrator
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { run } from '../src/watcher.js';
import { createEmptyDb, addPrograms, save } from '../src/db.js';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeProgram(id, handle, opts = {}) {
    return {
        id: String(id),
        handle,
        name: opts.name || handle,
        state: 'public_mode',
        submission_state: 'open',
        offers_bounties: opts.offers_bounties ?? true,
        started_accepting_at: null,
    };
}

let testDir;
let testDbPath;

beforeEach(async () => {
    testDir = join(tmpdir(), `h1-watcher-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    testDbPath = join(testDir, 'db.json');

    // Set required env vars
    process.env.H1_API_USERNAME = 'testuser';
    process.env.H1_API_TOKEN = 'testtoken';
});

afterEach(async () => {
    if (existsSync(testDir)) {
        await rm(testDir, { recursive: true, force: true });
    }
    delete process.env.H1_API_USERNAME;
    delete process.env.H1_API_TOKEN;
});

describe('watcher.run — integration scenarios', () => {
    it('Scenario 1: Empty DB → new programs → alert + DB updated', async () => {
        const mockPrograms = [
            makeProgram(1, 'acme', { name: 'Acme Corp' }),
            makeProgram(2, 'betacorp', { name: 'Beta Corp', offers_bounties: false }),
        ];
        const mockNotify = vi.fn().mockResolvedValue({ telegram: true, discord: true });
        const mockRecon = vi.fn().mockResolvedValue(false);

        const result = await run({
            fetchPrograms: async () => mockPrograms,
            notifyFn: mockNotify,
            dispatchReconFn: mockRecon,
            dbPath: testDbPath,
        });

        // All programs are new
        expect(result.newPrograms).toHaveLength(2);
        expect(result.totalPrograms).toBe(2);

        // Alert was called with new programs
        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify.mock.calls[0][0]).toHaveLength(2);

        // DB was saved
        expect(existsSync(testDbPath)).toBe(true);
        const saved = JSON.parse(readFileSync(testDbPath, 'utf-8'));
        expect(Object.keys(saved.programs)).toHaveLength(2);
        expect(saved.last_run).toBeTruthy();
    });

    it('Scenario 2: All programs known → no alert', async () => {
        // Pre-populate DB
        const db = createEmptyDb();
        addPrograms(db, [
            makeProgram(1, 'acme'),
            makeProgram(2, 'betacorp'),
        ]);
        await save(db, testDbPath);

        const mockNotify = vi.fn();
        const mockRecon = vi.fn().mockResolvedValue(false);

        const result = await run({
            fetchPrograms: async () => [makeProgram(1, 'acme'), makeProgram(2, 'betacorp')],
            notifyFn: mockNotify,
            dispatchReconFn: mockRecon,
            dbPath: testDbPath,
        });

        expect(result.newPrograms).toHaveLength(0);
        // Alert was NOT called
        expect(mockNotify).not.toHaveBeenCalled();
    });

    it('Scenario 3: Mix of known + new → alert only for new', async () => {
        // Pre-populate DB with program 1
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(1, 'acme')]);
        await save(db, testDbPath);

        const mockNotify = vi.fn().mockResolvedValue({ telegram: true, discord: false });
        const mockRecon = vi.fn().mockResolvedValue(false);

        const result = await run({
            fetchPrograms: async () => [
                makeProgram(1, 'acme'),
                makeProgram(2, 'betacorp'),
                makeProgram(3, 'gammainc'),
            ],
            notifyFn: mockNotify,
            dispatchReconFn: mockRecon,
            dbPath: testDbPath,
        });

        // Only 2 new programs
        expect(result.newPrograms).toHaveLength(2);
        expect(result.newPrograms.map((p) => p.handle)).toEqual(['betacorp', 'gammainc']);

        // Alert called with only new programs
        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify.mock.calls[0][0]).toHaveLength(2);

        // DB now has all 3
        const saved = JSON.parse(readFileSync(testDbPath, 'utf-8'));
        expect(Object.keys(saved.programs)).toHaveLength(3);
    });

    it('Scenario 4: No DB file exists → treated as empty (first run)', async () => {
        const noExistPath = join(testDir, 'subdir', 'db.json');
        const mockNotify = vi.fn().mockResolvedValue({ telegram: false, discord: false });
        const mockRecon = vi.fn().mockResolvedValue(false);

        const result = await run({
            fetchPrograms: async () => [makeProgram(1, 'newprog')],
            notifyFn: mockNotify,
            dispatchReconFn: mockRecon,
            dbPath: noExistPath,
        });

        expect(result.newPrograms).toHaveLength(1);
        expect(existsSync(noExistPath)).toBe(true);
    });

    it('Scenario 5: API returns empty list → no alerts, DB unchanged', async () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(1, 'acme')]);
        await save(db, testDbPath);

        const mockNotify = vi.fn();
        const mockRecon = vi.fn().mockResolvedValue(false);

        const result = await run({
            fetchPrograms: async () => [],
            notifyFn: mockNotify,
            dispatchReconFn: mockRecon,
            dbPath: testDbPath,
        });

        expect(result.newPrograms).toHaveLength(0);
        expect(result.totalPrograms).toBe(0);
        expect(mockNotify).not.toHaveBeenCalled();

        // DB should still have program 1
        const saved = JSON.parse(readFileSync(testDbPath, 'utf-8'));
        expect(Object.keys(saved.programs)).toHaveLength(1);
    });
});
