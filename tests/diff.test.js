// tests/diff.test.js — Unit tests for diff logic with 100% coverage
import { describe, it, expect } from 'vitest';
import { diffPrograms, createEmptyDb, addPrograms, getKnownIds } from '../src/db.js';

function makeProgram(id, handle = `prog-${id}`, opts = {}) {
    return {
        id: String(id),
        handle,
        name: opts.name || handle,
        state: 'public_mode',
        submission_state: 'open',
        offers_bounties: opts.offers_bounties ?? true,
        started_accepting_at: opts.started_accepting_at || null,
    };
}

describe('diffPrograms', () => {
    it('returns all programs when DB is empty', () => {
        const db = createEmptyDb();
        const current = [makeProgram(1), makeProgram(2), makeProgram(3)];

        const newOnes = diffPrograms(db, current);

        expect(newOnes).toHaveLength(3);
        expect(newOnes.map((p) => p.id)).toEqual(['1', '2', '3']);
    });

    it('returns empty array when current is empty', () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(1), makeProgram(2)]);

        const newOnes = diffPrograms(db, []);

        expect(newOnes).toHaveLength(0);
    });

    it('returns empty array when all programs are already known', () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(1), makeProgram(2), makeProgram(3)]);

        const current = [makeProgram(1), makeProgram(2), makeProgram(3)];
        const newOnes = diffPrograms(db, current);

        expect(newOnes).toHaveLength(0);
    });

    it('returns only new programs when mix of known and new', () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(1), makeProgram(2)]);

        const current = [makeProgram(1), makeProgram(2), makeProgram(3), makeProgram(4)];
        const newOnes = diffPrograms(db, current);

        expect(newOnes).toHaveLength(2);
        expect(newOnes.map((p) => p.id)).toEqual(['3', '4']);
    });

    it('handles numeric vs string ID comparisons correctly', () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram('100')]);

        const current = [{ ...makeProgram(100), id: 100 }]; // numeric ID
        const newOnes = diffPrograms(db, current);

        // Should recognize as same program (both normalize to string)
        expect(newOnes).toHaveLength(0);
    });

    it('handles programs that were removed from API (no re-alert)', () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(1), makeProgram(2), makeProgram(3)]);

        // Program 2 no longer in API response — we don't alert for removed programs
        const current = [makeProgram(1), makeProgram(3)];
        const newOnes = diffPrograms(db, current);

        expect(newOnes).toHaveLength(0);
    });

    it('works with a single new program', () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(1)]);

        const current = [makeProgram(1), makeProgram(2)];
        const newOnes = diffPrograms(db, current);

        expect(newOnes).toHaveLength(1);
        expect(newOnes[0].id).toBe('2');
    });
});

describe('addPrograms', () => {
    it('adds new programs and returns them', () => {
        const db = createEmptyDb();
        const programs = [makeProgram(1, 'alpha'), makeProgram(2, 'beta')];

        const added = addPrograms(db, programs);

        expect(added).toHaveLength(2);
        expect(Object.keys(db.programs)).toHaveLength(2);
        expect(db.programs['1'].handle).toBe('alpha');
        expect(db.programs['2'].handle).toBe('beta');
    });

    it('skips duplicate programs (deduplication)', () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(1, 'alpha')]);

        const added = addPrograms(db, [makeProgram(1, 'alpha'), makeProgram(2, 'beta')]);

        expect(added).toHaveLength(1);
        expect(added[0].id).toBe('2');
        expect(Object.keys(db.programs)).toHaveLength(2);
    });

    it('records first_seen timestamp', () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(1)]);

        expect(db.programs['1'].first_seen).toBeDefined();
        expect(new Date(db.programs['1'].first_seen).getTime()).toBeGreaterThan(0);
    });
});

describe('getKnownIds', () => {
    it('returns empty set for empty DB', () => {
        const db = createEmptyDb();
        const ids = getKnownIds(db);

        expect(ids.size).toBe(0);
    });

    it('returns correct set of IDs', () => {
        const db = createEmptyDb();
        addPrograms(db, [makeProgram(10), makeProgram(20), makeProgram(30)]);

        const ids = getKnownIds(db);

        expect(ids.size).toBe(3);
        expect(ids.has('10')).toBe(true);
        expect(ids.has('20')).toBe(true);
        expect(ids.has('30')).toBe(true);
    });
});
