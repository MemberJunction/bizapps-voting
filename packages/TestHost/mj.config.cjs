/**
 * mj.config.cjs for the voting-only wire-tier test host.
 *
 * Discovered by cosmiconfig from this package's directory (start-host.mjs sets cwd here), so the voting repo's own
 * codegen mj.config.cjs one level up is never read by the server. Everything secret or machine-specific comes from the
 * environment (the voting repo .env, loaded by start-host.mjs); nothing is printed.
 */
module.exports = {
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
  dbDatabase: process.env.DB_DATABASE,
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  dbTrustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === '1' || process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  coreSchema: process.env.MJ_CORE_SCHEMA || '__mj',

  // Magic-link machinery: the voting edge mints ballot sessions with MagicLinkKeyManager, so the provider must be
  // registered. The RS256 key comes from MJ_MAGIC_LINK_PRIVATE_KEY (base64 PEM) so sessions survive a restart.
  magicLink: {
    enabled: true,
    restrictedRoleName: 'Magic Link Baseline',
    // LOCAL TEST HOST ONLY. VOTING_TEST_HOST_RELAX_MAGIC_LINK=1 lets the headless Explorer tier sign the wire personas
    // (existing users that already hold UI) into Explorer with a magic link: UI becomes grantable and the provisioning
    // guard warns instead of blocking. Unset, this host keeps MJ's secure defaults. Never copy this into a real host.
    grantableRoleNames:
      process.env.VOTING_TEST_HOST_RELAX_MAGIC_LINK === '1'
        ? ['Voting Administrator', 'Election Inspector', 'UI']
        : ['Voting Administrator', 'Election Inspector'],
    ...(process.env.VOTING_TEST_HOST_RELAX_MAGIC_LINK === '1' ? { provisioningGuard: 'warn' } : {}),
    contextUserForProvisioning: 'System',
    defaultExpiresInHours: 72,
    sessionTokenTtlHours: 8,
    audience: 'mj-magic-link',
    // Redeem answers with JSON (no browser redirect) unless a caller asks otherwise.
    explorerUrl: process.env.VOTING_WIRE_EXPLORER_URL || undefined,
  },

  // The shared dev database carries scheduled jobs for other apps whose server packages this host does not load; running
  // them only produces failures (and notification rows). The wire tier drives elections explicitly, so no scheduler.
  scheduledJobs: { enabled: false },

  widget: {
    enabled: true,
    audience: 'mj-magic-link',
  },

  // The /vote edge mints ballot sessions with this role. The wire provisioning script creates it (read on the election
  // definition and roll); the shipped default, 'Magic Link Baseline', grants no voting entity at all. Overlays the extension
  // the voting-server package declares, matched by DriverClass.
  serverExtensions: [
    {
      Enabled: true,
      DriverClass: 'VotingBallotEdge',
      RootPath: '/vote',
      // VOTING_WIRE_RATE_MAX (optional) lifts the edge's per-IP allowance for the volume tier, which signs hundreds of voters in
      // from one address. Unset, the shipped defaults (20 per slug / 90 per IP per minute) apply, as the edge tier tests them.
      Settings: {
        GuestRoleName: 'Voting Wire Guest',
        ...(process.env.VOTING_WIRE_RATE_MAX
          ? { RateLimitMax: parseInt(process.env.VOTING_WIRE_RATE_MAX, 10), RateLimitMaxGlobal: parseInt(process.env.VOTING_WIRE_RATE_MAX, 10) * 4 }
          : {}),
      },
    },
  ],

  // The voting app and bizapps-common Open App server packages. Loaded through the same dynamic-package loader MJAPI uses,
  // so their RESOLVER_PATHS and MJ_SERVER_EXTENSIONS (the /vote edge) are picked up exactly as in production.
  dynamicPackages: {
    server: [
      { PackageName: '@mj-biz-apps/common-server', StartupExport: 'LoadBizAppsCommonServer', AppName: 'mj-bizapps-common', Enabled: true },
      { PackageName: '@mj-biz-apps/voting-server', StartupExport: 'LoadBizAppsVotingServer', AppName: 'mj-bizapps-voting', Enabled: true },
    ],
    client: [],
  },
};
