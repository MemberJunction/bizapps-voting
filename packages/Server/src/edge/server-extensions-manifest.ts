/**
 * Server-extension declarations for `@mj-biz-apps/voting-server`, read by MJ's bootstrap from the package's
 * `MJ_SERVER_EXTENSIONS` export (the standard declaration for a pre-auth server extension). The package entry point must re-export this and import `./ballot-edge-extension.js` so the @RegisterClass decorator runs.
 */
import type { ServerExtensionConfig } from '@memberjunction/server-extensions-core';

export const MJ_SERVER_EXTENSIONS: ServerExtensionConfig[] = [
    {
        Enabled: true,
        DriverClass: 'VotingBallotEdge',
        RootPath: '/vote',
        // The edge answers its own preflights and grants origins per distribution, so MJ's global CORS skips /vote.
        OwnsCORS: true,
        Settings: {},
    },
];
