/**
 * Helpers for unwrapping Remote Operation results. A Remote Operation reports transport and
 * authorization failures on the envelope (`Success` / `ErrorMessage`) and logical failures on the
 * typed output (`Output.Success` / `Output.Message`); callers want one error string for either.
 */
import type { RemoteOpResult } from '@memberjunction/core';

export interface UnwrappedOperation<T> {
    /** The typed output when the operation (envelope and output) succeeded; otherwise null. */
    Output: T | null;
    /** A user-presentable failure message when the operation failed; otherwise null. */
    Error: string | null;
}

export function UnwrapOperation<T extends { Success: boolean; Message?: string }>(
    result: RemoteOpResult<T>,
    fallbackMessage: string
): UnwrappedOperation<T> {
    if (!result.Success || !result.Output) {
        return { Output: null, Error: result.ErrorMessage ?? fallbackMessage };
    }
    if (!result.Output.Success) {
        return { Output: null, Error: result.Output.Message ?? fallbackMessage };
    }
    return { Output: result.Output, Error: null };
}

/** Roles whose holders administer or inspect elections (the server enforces the real check). */
const PRIVILEGED_ROLES = ['voting administrator', 'election inspector'];

/** True when the role names include a voting administrator or inspector role. */
export function HasVotingPrivilege(roleNames: string[]): boolean {
    return roleNames.some((r) => PRIVILEGED_ROLES.includes(r.trim().toLowerCase()));
}

/** True when the role names include the voting administrator role (the server enforces the real check). */
export function HasVotingAdministratorRole(roleNames: string[]): boolean {
    return roleNames.some((r) => r.trim().toLowerCase() === 'voting administrator');
}
