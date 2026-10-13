# Authoring metadata

MJ metadata records — applications and nav items, lookup/reference-table
seeds, actions, prompts, queries — are authored as **declarative JSON files**
under `metadata/` and pushed into your dev database with `mj sync`. This doc
is how to format and write them. The lifecycle rule to internalize first:

> `metadata/` is the **dev-time source of truth**. The install engine never
> reads it — consumers receive your metadata through the one
> `V*__Metadata_Sync.sql` migration the build engineer generates from it each
> release (see [codegen-and-metadata-migrations.md](codegen-and-metadata-migrations.md)).

## Directory layout

```
metadata/
├── .mj-sync.json            # ROOT config: push options + directoryOrder
├── schema-info/             # REQUIRED FILL-OUT — registers your schema (see below)
│   ├── .mj-sync.json        #   entity: "MJ: Schema Info"
│   ├── README.md            #   activation instructions
│   └── schema-info.json.template  # copy → .schema-info.json + fill the TODOs
└── <one folder per entity>/
    ├── .mj-sync.json        # which entity this folder maps to + options
    └── .<records>.json      # the records (dot-prefixed JSON array)
```

- **One folder per entity.** Every folder you add must be listed in the root
  `.mj-sync.json` `directoryOrder` (dependencies push in order — parents
  before children).
- **Record files are dot-prefixed** (`.item-types.json`) — the default
  `filePattern` is `**/.*.json`.

## The root `.mj-sync.json`

```json
{
  "version": "0.0.0",
  "push": { "autoCreateMissingRecords": true },
  "directoryOrder": ["schema-info", "item-types"]
}
```

`autoCreateMissingRecords: true` lets a record that carries a `primaryKey`
but doesn't exist in the DB be **created** with that exact ID — that's how
your `schema-info` row appears on first push once you've activated it (next
section).

## Schema registration (`schema-info/`) — ⚠️ REQUIRED, and you must fill it out

`__mj.SchemaInfo` is the record that registers your schema with MJ: it
reserves an entity **ID range** and sets the **`EntityNamePrefix`** that keeps
your entity names (`MJ_BizApps_Voting: Item Types`) from colliding with MJ core or
other apps. Every schema-backed app needs exactly one row.

**The template ships it deliberately unusable-as-is**: the record is a
`schema-info.json.template` file that `mj sync` cannot see (wrong filename
pattern), containing `TODO` placeholders — so no placeholder data can ever
reach a database. Until you activate it, a push over `metadata/` simply
pushes nothing for this folder, and your schema stays unregistered (codegen
won't apply your prefix). **Activate it before your first real sync:**

1. Copy `schema-info.json.template` → **`.schema-info.json`** (leading dot).
2. Fill every `TODO`:
   | Field | What to put |
   |---|---|
   | `SchemaName` | Exactly your `mj-app.json` `schema.name` |
   | `EntityIDMin` / `EntityIDMax` | An integer range reserved for your app's entities, non-overlapping with other apps (e.g. `10000001`–`10099999`) |
   | `EntityNamePrefix` | Your prefix (e.g. `MJ_BizApps_Voting`) — must agree with `mj.config.cjs` `NameRulesBySchema` |
   | `Description` | One line about the schema |
   | `primaryKey.ID` | A **freshly generated UUID** (`uuidgen`) — keep it stable forever once pushed anywhere |
3. Push (workflow below) — the row is created with your pinned ID.

`metadata/schema-info/README.md` carries the same instructions next to the
file itself.

## A folder's `.mj-sync.json`

```json
{
  "entity": "MJ_BizApps_Voting: Item Types",
  "filePattern": "**/.*.json",
  "pull": {
    "createNewFileIfNotFound": true,
    "newFileName": ".item-types.json",
    "appendRecordsToExistingFile": true,
    "updateExistingRecords": true,
    "ignoreNullFields": true,
    "ignoreVirtualFields": true
  }
}
```

`entity` is the exact MJ entity name (your entities carry your
`EntityNamePrefix`, e.g. `MJ_BizApps_Voting: Item Types`; core entities may need the
`MJ: ` prefix — verify names in the generated `entity_subclasses.ts`).

## Record file format

A JSON array; each element is one record with a `fields` object:

```json
[
  { "fields": { "Name": "Standard", "Description": "Default item type", "DefaultRank": 10 } },
  { "fields": { "Name": "Premium",  "Description": "Premium item type",  "DefaultRank": 20 } }
]
```

- **New records: write ONLY `fields`.** On first push, mj-sync writes back a
  `primaryKey` (the generated ID) and a `sync` block (timestamp + checksum) —
  commit that write-back, and never hand-edit either block.
- Pushes are **upserts** — safe to re-run. But note: `mj sync push` is a
  **full reconcile** — it can DELETE rows that exist in the DB for that entity
  scope but not in your files. It is a single-author, dev-time tool.
- Pinning an ID on purpose (like `schema-info/` does) is how you make a
  record deterministic across databases: supply `primaryKey.ID` yourself with
  a hardcoded UUID and keep it stable forever once pushed anywhere.

## Reference syntax

| Ref | Meaning | Example |
|---|---|---|
| `@file:<path>` | Load the value from a separate file — use for any complex/JSON blob | `"FieldSchema": "@file:schemas/api-key.schema.json"` |
| `@lookup:<Entity>.<Field>=<value>` | Resolve a related record's ID by a field value | `"CategoryID": "@lookup:Action Categories.Name=Utilities"` |
| `@parent:<Field>` | The containing parent record's field (in `relatedEntities` nesting) | `"ApplicationID": "@parent:ID"` |
| `@root:<Field>` | The root record's field in a nested structure | — |
| `@template:<path>` | Shared JSON fragment merged into the record | — |

Keep externalized files in typed subfolders (`schemas/`, `templates/`) next to
the records that reference them — never paste escaped-JSON strings inline.

## Worked example 1 — seeding a lookup table

Your migration created `${flyway:defaultSchema}.ItemType` and codegen
registered `MJ_BizApps_Voting: Item Types`. To seed it: create
`metadata/item-types/` with the folder config + record file shown above, add
`"item-types"` to the root `directoryOrder`, then push (below). Don't seed
lookup tables with hand-written INSERTs as the source of truth — author here,
let the release's metadata seed produce the SQL that ships.

## Worked example 2 — an application with nav items

An `MJ: Applications` record is what gives your app a tile in Explorer's app
switcher and defines its nav items (folder config:
`"entity": "MJ: Applications"` — note the `MJ: ` prefix; core entity names carry
it, and an unprefixed name silently matches nothing). This template ships the
folder pre-wired at `metadata/applications/`, as an inert `.template` to fill in:

```json
[
  {
    "fields": {
      "Name": "MJ_BizApps_Voting",
      "Description": "Sample application installed by this Open App",
      "Icon": "fa-solid fa-cube",
      "Color": "#264FAF",
      "DefaultForNewUser": true,
      "DefaultSequence": 1000,
      "DefaultNavItems": [
        {
          "Label": "Overview",
          "Icon": "fa-solid fa-gauge-high",
          "ResourceType": "Custom",
          "DriverClass": "VotingOverviewResource",
          "isDefault": true
        }
      ]
    },
    "relatedEntities": { "MJ: Application Entities": [] },
    "primaryKey": { "ID": "<a UUID you generate once and never change>" }
  }
]
```

Every `DefaultNavItems` entry with `ResourceType: "Custom"` needs its
`DriverClass` to exactly match an
`@RegisterClass(BaseResourceComponent, '<DriverClass>')` component in your
Angular package — a mismatch renders an empty tab with no error. Exactly one
`isDefault: true` per app.

`DefaultForNewUser: true` is deliberate: CodeGen also creates a machine-named
"bucket" Application per schema which takes the column's DB default of `1`, so an
app shipping `false` loses the switcher to the bucket. The whole
component → registration → bundle → nav item → user-access chain, and what to do
when nothing appears, is in
[explorer-visibility.md](explorer-visibility.md).

## The workflow (edit → push → commit)

```sh
# from the MJ repo root, with this app linked (docs/template-docs/linking-to-mj.md)
pnpm exec mj-sync validate --dir=./metadata     # 1. validate
pnpm exec mj sync push --dir=./metadata --format=json  # 2. push to YOUR dev DB
# 3. commit the metadata JSON (uuidgen primaryKey, no sync block) + a changeset.
#    Do NOT capture a Metadata_Sync.sql: the build engineer generates one per release.
```

Teammates and installs get the release's metadata migration, **not** your
sync — never treat push as a distribution mechanism. The model: [Release Metadata Migrations Guide](https://github.com/MemberJunction/MJ/blob/next/guides/RELEASE_METADATA_MIGRATIONS_GUIDE.md).

## Gotchas

- The `metadata/` root must contain **at least one entity folder** listed in
  `directoryOrder` — `mj sync push` fails with "No entity directories found"
  on an empty tree (this template's `schema-info/` FOLDER is what satisfies
  that — keep it even before you've filled out its record).
- Only dot-prefixed `.json` files matching a folder's `filePattern` are
  records. Don't park drafts or samples inside `metadata/` — anything
  matching the pattern in a registered folder WILL be pushed.
- If a record implies codegen output (new entities/fields), run the codegen
  loop too and commit it all together.


## MJ's own reference

Every field, flag and file-format detail of the sync tool is in
[`packages/MetadataSync/README.md`](https://github.com/MemberJunction/MJ/blob/next/packages/MetadataSync/README.md) — that is the
authority when this page and the tool disagree.
