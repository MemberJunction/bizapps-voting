# @mj-biz-apps/voting-ng

Admin dashboards for MJ Explorer (L3 — Explorer-specific UI).

## Dashboards

- **Elections Management**: create, edit, open, close, and cancel elections
- **Voter Roll Management**: freeze, amend, and challenge voter rolls
- **Credentials**: issue and revoke voter credentials
- **Turnout**: real-time voting statistics
- **Results**: view and publish results (live or final)
- **Certification**: certify results with multi-certifier workflow
- **Trustee Management**: manage trustee keys and tally ceremonies (Tier B)
- **Audit Log**: view election audit trail

Each dashboard:
- Uses `BaseResourceComponent` for layout and routing
- Integrates with the navigation service for deep links
- Handles MJ entity updates and displays
- Calls engines via Remote Operations

## Key Components

- **`ElectionListComponent`**: list all elections with filters
- **`ElectionDetailComponent`**: full election editor
- **`RollComponent`**: manage voter roll
- **`CredentialsComponent`**: credential distribution
- **`TurnoutComponent`**: voting statistics
- **`ResultsComponent`**: view/publish results
- **`CertificationComponent`**: certification workflow
- **`TrusteeComponent`**: key ceremony management

## Dependencies

- `@angular/*`: core, forms, common, router
- `@memberjunction/ng-*`: UI components, base classes
- `@mj-biz-apps/voting-entities`: entity types, operation types
- `@mj-biz-apps/voting-server`: engines (via Remote Operations, not direct imports)

## Routing

Dashboards register in the Explorer navigation:

```
/explorer/app/voting
  /elections (list)
  /elections/:id (detail)
  /roll/:id
  /credentials/:id
  /turnout/:id
  /results/:id
  /certify/:id
```

Deep links are supported; state is preserved on navigation.

## Development

Dashboards follow MJ Angular conventions:

- L3 (Explorer-only): full Router access, entity updates, navigation service
- No server imports directly (use Remote Operations)
- Responsive layout with sidebar/main area
- Type-safe entity binding via generated classes

Build:

```bash
pnpm run build
```

Test:

```bash
pnpm test
```

## See Also

- [Architecture docs](../../docs/voting/architecture.md) for entity relationships
- [Operations reference](../../docs/voting/operations.md) for Remote Operation signatures
- [MJ UI Layering guide](https://github.com/MemberJunction/MJ/blob/next/guides/UI_LAYERING_GUIDE.md) for L3 patterns
