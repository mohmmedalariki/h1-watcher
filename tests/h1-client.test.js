// tests/h1-client.test.js — Unit tests for HackerOne API client
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    validateCredentials,
    buildAuthHeader,
    normalizeProgram,
    fetchPublicPrograms,
    fetchWithRetry,
} from '../src/h1-client.js';

// Helper: create a mock response
function mockResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

// Sample H1 API responses
const samplePrograms = {
    data: [
        {
            id: 1,
            type: 'program',
            attributes: {
                handle: 'acme',
                name: 'Acme Corp',
                state: 'public_mode',
                submission_state: 'open',
                offers_bounties: true,
                started_accepting_at: '2024-01-15T00:00:00Z',
            },
        },
        {
            id: 2,
            type: 'program',
            attributes: {
                handle: 'privateone',
                name: 'Private Program',
                state: 'soft_launched',
                submission_state: 'open',
                offers_bounties: false,
                started_accepting_at: null,
            },
        },
        {
            id: 3,
            type: 'program',
            attributes: {
                handle: 'betacorp',
                name: 'Beta Corp',
                state: 'public_mode',
                submission_state: 'open',
                offers_bounties: false,
                started_accepting_at: null,
            },
        },
    ],
    links: {},
};

describe('validateCredentials', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('returns credentials when both are set', () => {
        process.env.H1_API_USERNAME = 'testuser';
        process.env.H1_API_TOKEN = 'testtoken';

        const { username, token } = validateCredentials();

        expect(username).toBe('testuser');
        expect(token).toBe('testtoken');
    });

    it('throws when H1_API_USERNAME is missing', () => {
        delete process.env.H1_API_USERNAME;
        process.env.H1_API_TOKEN = 'testtoken';

        expect(() => validateCredentials()).toThrow('H1_API_USERNAME');
    });

    it('throws when H1_API_TOKEN is missing', () => {
        process.env.H1_API_USERNAME = 'testuser';
        delete process.env.H1_API_TOKEN;

        expect(() => validateCredentials()).toThrow('H1_API_TOKEN');
    });

    it('throws when both are missing', () => {
        delete process.env.H1_API_USERNAME;
        delete process.env.H1_API_TOKEN;

        expect(() => validateCredentials()).toThrow('H1_API_USERNAME');
        expect(() => validateCredentials()).toThrow('H1_API_TOKEN');
    });
});

describe('buildAuthHeader', () => {
    it('creates a valid Basic Auth header', () => {
        const header = buildAuthHeader('user', 'pass');
        const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString();

        expect(header.startsWith('Basic ')).toBe(true);
        expect(decoded).toBe('user:pass');
    });
});

describe('normalizeProgram', () => {
    it('normalizes a program object correctly', () => {
        const raw = {
            id: 42,
            attributes: {
                handle: 'testprog',
                name: 'Test Program',
                state: 'public_mode',
                submission_state: 'open',
                offers_bounties: true,
                started_accepting_at: '2024-06-01T00:00:00Z',
            },
        };

        const result = normalizeProgram(raw);

        expect(result).toEqual({
            id: '42',
            handle: 'testprog',
            name: 'Test Program',
            state: 'public_mode',
            submission_state: 'open',
            offers_bounties: true,
            started_accepting_at: '2024-06-01T00:00:00Z',
        });
    });

    it('falls back to handle when name is missing', () => {
        const raw = {
            id: 1,
            attributes: {
                handle: 'myhandle',
                state: 'public_mode',
                submission_state: 'open',
            },
        };

        const result = normalizeProgram(raw);

        expect(result.name).toBe('myhandle');
    });
});

describe('fetchPublicPrograms', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env.H1_API_USERNAME = 'testuser';
        process.env.H1_API_TOKEN = 'testtoken';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('fetches and filters public programs', async () => {
        const mockFetch = vi.fn().mockResolvedValue(mockResponse(samplePrograms));

        const programs = await fetchPublicPrograms({ fetchFn: mockFetch });

        // Should filter out the private program (state: soft_launched)
        expect(programs).toHaveLength(2);
        expect(programs[0].handle).toBe('acme');
        expect(programs[1].handle).toBe('betacorp');
    });

    it('handles pagination via links.next', async () => {
        const page1 = {
            data: [samplePrograms.data[0]], // acme (public)
            links: { next: 'https://api.hackerone.com/v1/hackers/programs?page%5Bnumber%5D=2' },
        };
        const page2 = {
            data: [samplePrograms.data[2]], // betacorp (public)
            links: {},
        };

        const mockFetch = vi
            .fn()
            .mockResolvedValueOnce(mockResponse(page1))
            .mockResolvedValueOnce(mockResponse(page2));

        const programs = await fetchPublicPrograms({ fetchFn: mockFetch });

        expect(programs).toHaveLength(2);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when no data', async () => {
        const mockFetch = vi.fn().mockResolvedValue(mockResponse({ data: [], links: {} }));

        const programs = await fetchPublicPrograms({ fetchFn: mockFetch });

        expect(programs).toHaveLength(0);
    });
});
