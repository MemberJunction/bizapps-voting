import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MJ_SERVER_EXTENSIONS } from '../edge/server-extensions-manifest.js';

interface PackageManifest {
    memberjunction?: { serverExtensions?: Array<Record<string, unknown>> };
}

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as PackageManifest;

describe('ballot edge declaration', () => {
    it('owns its CORS, so the host global CORS middleware skips /vote and the edge answers its own preflights', () => {
        const edge = MJ_SERVER_EXTENSIONS.find((e) => e.DriverClass === 'VotingBallotEdge');
        expect(edge?.RootPath).toBe('/vote');
        expect(edge?.OwnsCORS).toBe(true);
    });

    it('declares the same edge in package.json as in the MJ_SERVER_EXTENSIONS export', () => {
        const declared = packageJson.memberjunction?.serverExtensions?.find((e) => e.DriverClass === 'VotingBallotEdge');
        expect(declared).toMatchObject({ Enabled: true, RootPath: '/vote', OwnsCORS: true });
    });
});
