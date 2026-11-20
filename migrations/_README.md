# migrations/ — Skyway (Flyway-compatible) migrations for this app's schema

Applied in filename order against **your app's schema** at install/upgrade and
during development. Once published, a migration is IMMUTABLE — never edit an
applied file; add a new one (see PUBLISH_NO_BREAK policy in docs/template-docs/publishing.md).

## Naming

    V<YYYYMMDDHHMM>__v<app-version>_<Description>.sql     e.g. V202602120001__v0.1.0_Initial_Schema.sql
    B<YYYYMMDDHHMM>__v<app-version>_<Description>.sql     baseline variant (first schema drop of a new app)
    V<YYYYMMDDHHMM>__v<x.y.x>__Metadata_Sync.sql          the release's metadata seed (one per release, built by the build engineer)

- Timestamps must be strictly increasing (CI enforces this on PRs).
- Use `${flyway:defaultSchema}` for YOUR schema and `${mjSchema}` for MJ core objects, never a literal `__mj`.
- Do NOT add `__mj_CreatedAt`/`__mj_UpdatedAt` columns or FK indexes — CodeGen does.
- A PR that adds a migration MUST carry a changeset with at least a `minor` bump (CI enforces).

This folder starts EMPTY on purpose — the template ships no schema, so your
first migration is genuinely yours. `EXAMPLE__v0.0.0_Skeleton.sql.example` is an
inert skeleton to copy for new work; for a complete worked example (table + view +
SPs + entity/field registration) see any shipped BizApps app's baseline
migration. Schema registration (`__mj.SchemaInfo`) is handled by
`metadata/schema-info/` in this template — don't duplicate it here.
See docs/template-docs/codegen-and-metadata-migrations.md for the full authoring loop.

## Migration format

The copyable skeleton lives in **`EXAMPLE__v0.0.0_Skeleton.sql.example`** in this
folder — it carries the header, the `${flyway:defaultSchema}` usage, and the
authoring reminders. Copy it, rename it to a real `V<timestamp>__…` name, and fill
it in. (It is kept as one file rather than duplicated here so the two can't drift.)
