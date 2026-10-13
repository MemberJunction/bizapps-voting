/**
 * Role checks for the engines. Operations call these in their Authorize step.
 */

import { type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';

export const ADMINISTRATOR_ROLE = 'Voting Administrator';
export const INSPECTOR_ROLE = 'Election Inspector';
/** MJ platform roles that administer everything. */
const PLATFORM_ADMIN_ROLES: ReadonlyArray<string> = ['Developer', 'Integration'];

function hasRole(user: UserInfo, names: ReadonlyArray<string>): boolean {
    const wanted = names.map((n) => n.toLowerCase());
    return (user.UserRoles ?? []).some((r) => wanted.includes((r.Role ?? '').trim().toLowerCase()));
}

function isSystemUser(user: UserInfo): boolean {
    try {
        const system = UserCache.Instance.GetSystemUser();
        return !!system && !!user.ID && UUIDsEqual(system.ID, user.ID);
    } catch {
        return false;
    }
}

export class VotingAuthorization {
    /** A Voting Administrator, an MJ Developer/Integration user, or the system user. */
    public static IsAdministrator(user: UserInfo): boolean {
        return isSystemUser(user) || hasRole(user, [ADMINISTRATOR_ROLE, ...PLATFORM_ADMIN_ROLES]);
    }

    /** An Election Inspector (read-mostly oversight). */
    public static IsInspector(user: UserInfo): boolean {
        return hasRole(user, [INSPECTOR_ROLE]);
    }
}
