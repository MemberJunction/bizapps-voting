/** @type {import('@memberjunction/config').MJConfig} */
//
// mj.config.cjs — MemberJunction configuration for THIS Open App repository.
//
// This file drives `mj codegen` (and, when developing standalone, `mj migrate`).
// Database connection settings come from environment variables / .env — you do
// NOT put credentials here. Most settings have sensible package defaults; this
// file only declares what is specific to this app's directory structure.
//
// TODO(template): everywhere you see "sample" or "@mj-biz-apps", replace with
// your app's schema name and npm scope. The full rename checklist lives in
// docs/template-docs/getting-started.md.
//
module.exports = {
  // ==========================================================================
  // CodeGen output — REQUIRED
  // ==========================================================================

  // The npm package that receives generated entity subclasses. Must match
  // packages/Entities/package.json "name".
  entityPackageName: '@mj-biz-apps/voting-entities',

  // Where each kind of generated artifact is written. These paths match this
  // template's packages/ layout — keep them in sync if you rename packages.
  output: [
    { type: 'SQL', directory: './SQL Scripts/generated', appendOutputCode: true },
    {
      type: 'Angular',
      directory: './packages/Angular/src/lib/generated',
      options: [{ name: 'maxComponentsPerModule', value: 20 }],
    },
    { type: 'GraphQLServer', directory: './packages/Server/src/generated' },
    { type: 'ActionSubclasses', directory: './packages/Actions/src/generated' },
    { type: 'EntitySubclasses', directory: './packages/Entities/src/generated' },
    // Remote Operation typed bases (the API surface), emitted from the `MJ: Remote Operations` rows
    // in metadata/remote-operations/. They go in the browser-safe Entities package so the Angular
    // packages and the server share one contract. Every target also receives MJ's own core
    // operations as unregistered type shells (GenerationType=Manual): harmless, no runtime effect.
    { type: 'RemoteOperations', directory: './packages/Entities/src/generated' },
    { type: 'DBSchemaJSON', directory: './Schema Files' },
  ],

  // Commands CodeGen runs after generating — build the packages it wrote into
  // so the generated TypeScript is compiled and committed alongside its source.
  commands: [
    { workingDirectory: './packages/Entities', command: 'pnpm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Actions', command: 'pnpm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Server', command: 'pnpm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Angular', command: 'pnpm', args: ['run', 'build'], when: 'after' },
  ],

  // ==========================================================================
  // New-entity naming — RECOMMENDED
  // ==========================================================================
  // Prefix generated entity names so they can never collide with MJ core
  // ("MJ: ...") or other apps. Must agree with the EntityNamePrefix your
  // baseline migration writes into __mj.SchemaInfo.
  newEntityDefaults: {
    NameRulesBySchema: [
      { SchemaName: '${mj_core_schema}', EntityNamePrefix: 'MJ: ' },
      // TODO(template): your schema + your prefix:
      { SchemaName: '__mj_BizAppsVoting', EntityNamePrefix: 'MJ_BizApps_Voting: ', EntityNameSuffix: '' },
    ],
  },

  // ==========================================================================
  // Schema scope — REQUIRED
  // ==========================================================================
  // CodeGen for THIS app must only touch THIS app's schema, and `includeSchemas`
  // is what actually enforces that. `excludeSchemas` alone does NOT: it names the
  // schemas to skip, so any schema you did not think to name is in scope. That is
  // not theoretical — when this app is developed inside an MJ checkout that has
  // other apps linked, an exclude-only config happily generates against their
  // schemas too, and the run dies applying permissions for another app's stored
  // procedures (those procs only exist where that app's own CodeGen has run). The
  // error names the other app while the cause is this file.
  //
  // `includeSchemas` is a positive opt-in: a schema is in scope iff it is named
  // here AND absent from excludeSchemas (MJ's CodeGenLib/src/Database/schema-scope.ts
  // resolves the include list INTO excludeSchemas, so one name pins the blast radius
  // to exactly this app). Leave it empty/absent and you get classic exclude-only
  // behaviour — which is why this template ships it filled in.
  //
  // TODO(template): your schema name here (same value as mj-app.json schema.name).
  includeSchemas: ['__mj_BizAppsVoting'],

  // Schema facts CodeGen cannot read off the database: the ballot-box secrecy flags and the
  // Standards Ballot IS-A. A PATH STRING, resolved against CodeGen's CWD (run from the repo root).
  additionalSchemaInfo: './codegen/additional-schema-info.json',

  // Belt and braces: MJ core and the system schemas are never generated from an app
  // repo, regardless of the include list. Add a dependency app's schema here too if
  // you consume one — its entities ship in ITS published packages, so regenerating
  // them locally would produce a duplicate set. See
  // docs/template-docs/codegen-and-metadata-migrations.md.
  excludeSchemas: ['sys', 'staging', 'dbo', '__mj'],

  // ==========================================================================
  // SQL output for migrations — RECOMMENDED
  // ==========================================================================
  // CodeGen writes the SQL it executed into ./migrations/codegen/. After a
  // schema/metadata change you fold that SQL into a proper V*__ migration file
  // and commit it TOGETHER with the regenerated code — that is the convention
  // that keeps clean installs reproducible. See
  // docs/codegen-and-metadata-migrations.md.
  SQLOutput: {
    enabled: true,
    folderPath: './migrations/codegen/',
    appendToFile: false,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: false,
    schemaPlaceholders: [
      // Order matters: more-specific schema names must come first (greedy
      // sequential substitution).
      // TODO(template): your schema name here:
      { schema: '__mj_BizAppsVoting', placeholder: '${flyway:defaultSchema}' },
      { schema: '__mj', placeholder: '${mjSchema}' },
    ],
  },

  // ==========================================================================
  // Everything else is OPTIONAL and defaults sensibly:
  //   - settings / logging / advancedGeneration / forceRegeneration
  //   - dbHost/dbPort/dbDatabase/... come from environment variables
  //   - graphqlPort etc. come from DEFAULT_SERVER_CONFIG
  // See the fully-commented example in the bizapps-common repository, or the
  // @memberjunction/config package, for the complete list.
  // ==========================================================================
};
