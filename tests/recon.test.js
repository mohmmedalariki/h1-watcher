// tests/recon.test.js — Unit tests for recon dispatch module
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isEnabled, dispatchRecon } from '../src/recon.js';

const samplePrograms = [
    { id: '1', handle: 'acme', name: 'Acme Corp', offers_bounties: true },
    { id: '2', handle: 'beta', name: 'Beta Corp', offers_bounties: false },
];

describe('isEnabled', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('returns false when AUTO_RECON is not set', () => {
        delete process.env.AUTO_RECON;
        expect(isEnabled()).toBe(false);
    });

    it('returns false when AUTO_RECON is "false"', () => {
        process.env.AUTO_RECON = 'false';
        expect(isEnabled()).toBe(false);
    });

    it('returns true when AUTO_RECON is "true"', () => {
        process.env.AUTO_RECON = 'true';
        expect(isEnabled()).toBe(true);
    });

    it('returns true when AUTO_RECON is "TRUE" (case-insensitive)', () => {
        process.env.AUTO_RECON = 'TRUE';
        expect(isEnabled()).toBe(true);
    });

    it('returns true when AUTO_RECON is "1"', () => {
        process.env.AUTO_RECON = '1';
        expect(isEnabled()).toBe(true);
    });
});

describe('dispatchRecon', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('returns false when AUTO_RECON is disabled', async () => {
        delete process.env.AUTO_RECON;
        const result = await dispatchRecon(samplePrograms);
        expect(result).toBe(false);
    });

    it('returns false when programs array is empty', async () => {
        process.env.AUTO_RECON = 'true';
        const result = await dispatchRecon([]);
        expect(result).toBe(false);
    });

    it('returns false when programs is null', async () => {
        process.env.AUTO_RECON = 'true';
        const result = await dispatchRecon(null);
        expect(result).toBe(false);
    });

    it('returns false when GH_PUSH_TOKEN and GITHUB_REPOSITORY are missing', async () => {
        process.env.AUTO_RECON = 'true';
        delete process.env.GH_PUSH_TOKEN;
        delete process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_REPOSITORY;

        const result = await dispatchRecon(samplePrograms);
        expect(result).toBe(false);
    });

    it('dispatches successfully and sends correct payload', async () => {
        process.env.AUTO_RECON = 'true';
        process.env.GH_PUSH_TOKEN = 'fake-token';
        process.env.GITHUB_REPOSITORY = 'owner/repo';

        const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });

        const result = await dispatchRecon(samplePrograms, { fetchFn: mockFetch });

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe('https://api.github.com/repos/owner/repo/dispatches');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer fake-token');

        const body = JSON.parse(options.body);
        expect(body.event_type).toBe('new-h1-program');
        expect(body.client_payload.programs).toHaveLength(2);
        expect(body.client_payload.programs[0].handle).toBe('acme');
        expect(body.client_payload.programs[1].offers_bounties).toBe(false);
    });

    it('returns false when dispatch returns error status', async () => {
        process.env.AUTO_RECON = 'true';
        process.env.GH_PUSH_TOKEN = 'fake-token';
        process.env.GITHUB_REPOSITORY = 'owner/repo';

        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => 'forbidden',
        });

        const result = await dispatchRecon(samplePrograms, { fetchFn: mockFetch });
        expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
        process.env.AUTO_RECON = 'true';
        process.env.GH_PUSH_TOKEN = 'fake-token';
        process.env.GITHUB_REPOSITORY = 'owner/repo';

        const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

        const result = await dispatchRecon(samplePrograms, { fetchFn: mockFetch });
        expect(result).toBe(false);
    });

    it('uses GITHUB_TOKEN when GH_PUSH_TOKEN is not set', async () => {
        process.env.AUTO_RECON = 'true';
        delete process.env.GH_PUSH_TOKEN;
        process.env.GITHUB_TOKEN = 'github-token';
        process.env.GITHUB_REPOSITORY = 'owner/repo';

        const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });

        const result = await dispatchRecon(samplePrograms, { fetchFn: mockFetch });

        expect(result).toBe(true);
        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers.Authorization).toBe('Bearer github-token');
    });
});
