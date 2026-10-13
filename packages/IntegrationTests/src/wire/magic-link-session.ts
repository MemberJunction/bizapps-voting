/**
 * An Explorer-style magic-link session for an internal persona, obtained through MJ's real invite flow:
 * system key -> POST /magic-link/create -> POST /magic-link/redeem?format=json -> session JWT.
 *
 * The JWT is exactly what Explorer reads from `#token=<jwt>`, so `ExplorerUrl` can be pasted into a browser. The host must
 * list the role in `magicLink.grantableRoleNames` (the wire host does for 'Voting Administrator' and 'Election Inspector')
 * and the email must be new or already external: MJ refuses to bolt an external role onto an account that holds real roles.
 */
import { CreateMagicLinkInvite, RedeemMagicLink, type MagicLinkSession } from './guest-session.js';
import { ResolveWireConfig } from './wire-config.js';
import type { WireClient } from './wire-client.js';

export interface ExplorerMagicLink extends MagicLinkSession {
    InviteID: string;
    /** `<explorerUrl>/app/<application path>#token=<jwt>` when the host has an explorerUrl; otherwise undefined. */
    ExplorerUrl?: string;
}

export async function CreateExplorerMagicLink(
    system: WireClient,
    options: { Email: string; ApplicationName: string; RoleName: string; ExplorerUrl?: string; FirstName?: string; LastName?: string }
): Promise<ExplorerMagicLink> {
    const apps = await system.RunView<{ ID: string; Path: string | null }>({ EntityName: 'MJ: Applications', ExtraFilter: `Name = '${options.ApplicationName.replace(/'/g, "''")}'`, Fields: ['ID', 'Path'], ResultType: 'simple' });
    const roles = await system.RunView<{ ID: string }>({ EntityName: 'MJ: Roles', ExtraFilter: `Name = '${options.RoleName.replace(/'/g, "''")}'`, Fields: ['ID'], ResultType: 'simple' });
    const app = apps.Success ? apps.Results[0] : undefined;
    const role = roles.Success ? roles.Results[0] : undefined;
    if (!app) throw new Error(`Application "${options.ApplicationName}" not found`);
    if (!role) throw new Error(`Role "${options.RoleName}" not found`);

    const { SystemKey } = ResolveWireConfig();
    const invite = await CreateMagicLinkInvite(SystemKey, { Email: options.Email, ApplicationId: app.ID, RoleId: role.ID, FirstName: options.FirstName, LastName: options.LastName, ExpiresInHours: 1 });
    const session = await RedeemMagicLink(invite.RawToken);
    const base = options.ExplorerUrl?.replace(/\/$/, '');
    return {
        ...session,
        InviteID: invite.InviteID,
        ExplorerUrl: base ? `${base}/app/${encodeURIComponent(app.Path ?? options.ApplicationName.toLowerCase().replace(/\s+/g, '-'))}#token=${session.Token}` : undefined,
    };
}
