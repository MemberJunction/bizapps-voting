# CodeGen + metadata migrations — the convention that holds everything together

MemberJunction generates a lot of your app: entity classes (+zod schemas),
GraphQL resolvers, Angular forms, and the SQL plumbing (views, stored procs,
FK indexes, timestamp columns). The convention this repo follows — the same
one MJ core and the shipped BizApps use — is:

> **Committed code is the source of truth.** Migrations and the generated code
> they imply are committed TOGETHER, in the same PR. A clean database + your
> migrations + your committed generated code must always agree.

Consumers install your app from what you committed; nothing is generated at
install time. If migrations and generated code drift apart, clean installs
break — so the rules below are non-negotiable.

## After every SCHEMA change

You wrote a new migration (new table/column/constraint in your app schema):

1. Apply it: `pnpm run mj:migrate`
   (from the MJ repo root when linked — see linking-to-mj.md).
2. Run CodeGen: `pnpm run mj:codegen`. It will:
   - add the system columns (`__mj_CreatedAt`/`__mj_UpdatedAt`) + FK indexes
     you deliberately did NOT put in the migration,
   - regenerate entity subclasses / resolvers / forms into `packages/*/src/generated/`,
   - write the SQL it executed to `migrations/codegen/` (gitignored scratch).
3. **Fold the codegen-emitted SQL that belongs to YOU** (DDL against your
   schema, metadata inserts/updates) into your migration or a follow-up `V*`
   file, so a clean install replays it. Do NOT fold the system plumbing —
   `__mj_*` timestamp columns, `IDX_AUTO_MJ_FKEY_*` indexes, and the recurring
   `spUpdateExisting…FromSchema` refresh calls — CodeGen re-applies those
   automatically on every instance (that's exactly why your migrations must
   not contain them).
4. Build (`pnpm run build:packages`), then **commit the
   migration + all regenerated code together** with a changeset (≥ minor).

Only THEN write TypeScript against the new fields — the generated types now
exist, so you get strong typing instead of stringly-typed access.

## After every METADATA change

You edited records under `metadata/` (applications, lookup seeds, actions...):

1. Push it to your dev database: `pnpm exec mj sync push --dir=metadata --format=json`.
   `mj sync push` is a **single-author, dev-time tool**: it reconciles YOUR
   files into YOUR database. It is not how teammates or consumers receive
   metadata — migrations are.
2. **Do not capture a migration.** The build engineer generates one
   `V<timestamp>__v<x.y.x>__Metadata_Sync.sql` per release, from a fresh
   database, carrying every metadata change since the last release.
3. If the metadata implies codegen output (e.g. new entities), run the schema
   loop above too.
4. Commit the metadata JSON (`uuidgen` primaryKey, no `sync` block), with a changeset.

**Cadence**: one metadata seed per release, and `rr: metadata shipped` on the
Version Packages PR checks that no metadata change is missing from it. When it is generated, core
stored-procedure calls use `${mjSchema}` and this app's own calls
`${flyway:defaultSchema}`, never a literal `__mj`. The model and the Open App
steps that differ from core: [Release Metadata Migrations Guide](https://github.com/MemberJunction/MJ/blob/next/guides/RELEASE_METADATA_MIGRATIONS_GUIDE.md).

## Rules that keep you out of trouble

- **Never edit an applied migration** — Skyway tracks checksums; edits cause
  drift errors on every existing install. Add a new migration instead.
- **Never hand-edit `src/generated/`** — codegen overwrites it.
- **Never put system columns / FK indexes in migrations** — codegen owns them.
- **Additive-only within a published major** (see publishing.md).
- CodeGen for this app must be scoped to YOUR schema — `mj.config.cjs` already
  excludes `__mj` and system schemas; keep it that way.
- Use hardcoded UUIDs in migration metadata inserts (`NEWID()` breaks
  reproducibility across installs).


## MJ's own reference

MJ's version of this loop — the source of the convention this page describes — is
[`guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md).
Generating PostgreSQL variants adds
[`guides/POSTGRES_SCHEMA_CASING_GUIDE.md`](https://github.com/MemberJunction/MJ/blob/next/guides/POSTGRES_SCHEMA_CASING_GUIDE.md) and
[`guides/PG_MIGRATION_GLOSSARY.md`](https://github.com/MemberJunction/MJ/blob/next/guides/PG_MIGRATION_GLOSSARY.md).
