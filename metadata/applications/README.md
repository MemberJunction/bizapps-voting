# applications — ⚠️ FILL THIS OUT to appear in MJ Explorer

This folder holds your app's `MJ: Applications` record — the row that gives your
app a tile in Explorer's **app switcher** and defines its **nav items**. Without
it your packages still load, but there is nothing for a user to click.

Like `schema-info/`, it ships as an inert **`.template`** that `mj sync` cannot
see, so no placeholder row ever reaches a database.

## To activate (one-time)

1. Copy `application.json.template` → **`.<your-app>-application.json`** (the
   leading dot is what makes it a record file).
2. Fill every `TODO`:
   - `Name` / `Description` / `Icon` / `Color` — what the switcher shows
     (`Icon` is a Font Awesome class; `Color` a `#RRGGBB` hex)
   - `DefaultSequence` — ordering hint among apps (lower sorts first)
   - `DefaultNavItems[].DriverClass` — **must exactly match** an
     `@RegisterClass(BaseResourceComponent, '<DriverClass>')` component in
     `packages/Angular`. Exactly one entry carries `isDefault: true`.
   - `primaryKey.ID` — generate a UUID (`uuidgen`) and never change it once
     pushed anywhere.
3. Push it to your dev database (`pnpm exec mj sync push --dir=./metadata --format=json`)
   and commit the JSON. Installs replay migrations, never this folder: the build
   engineer ships these records in the release's `V*__…_Metadata_Sync.sql` migration.

## Two things that surprise everyone

- **`DefaultForNewUser: true` is deliberate here.** CodeGen also auto-creates a
  machine-named "bucket" Application per schema (`Name` = your schema name,
  `Description` = "Generated for schema") to hang generated entities' links and
  role grants on. That bucket row gets the column's DB default — `1` — so it is
  visible to every new user. If your real app ships `false`, a new user's
  switcher shows `__mj_BizAppsVoting — Generated for schema` and **hides** your actual
  app. Ship `true` so the product app is the visible one. (Both rows existing is
  normal: every shipped BizApps app with a UI has this shape.)
- **A nav item is not a route.** `ResourceType: "Custom"` + `DriverClass` looks
  the component up through MJ's class factory at click time. A typo in either
  half fails **silently** — the tab renders empty, with no error.

Full chain (component → registration → bundle → nav item → user access):
[`docs/template-docs/explorer-visibility.md`](../../docs/template-docs/explorer-visibility.md).
