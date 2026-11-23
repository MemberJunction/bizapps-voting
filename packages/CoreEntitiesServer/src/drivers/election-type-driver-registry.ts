/**
 * ElectionTypeDriverRegistry
 * Resolves and caches BaseElectionTypeServerDriver instances using BaseSingleton and ClassFactory.
 * Follows the design's extensibility pattern § 6.
 */

import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { type mjBizAppsVotingElectionTypeEntity } from '@mj-biz-apps/voting-entities';
import { BaseElectionTypeServerDriver } from './base-election-type-server-driver.js';

export class ElectionTypeDriverRegistry extends BaseSingleton<ElectionTypeDriverRegistry> {
    private drivers = new Map<string, BaseElectionTypeServerDriver>();
    private defaultDriver = new BaseElectionTypeServerDriver();

    protected constructor() {
        super();
    }

    public static get Instance(): ElectionTypeDriverRegistry {
        return super.getInstance<ElectionTypeDriverRegistry>();
    }

    /**
     * Resolves the server driver for an election type.
     * - If ServerDriverClass is not set, returns the default driver.
     * - If ServerDriverClass is set, resolves via MJGlobal.Instance.ClassFactory.TryCreateInstance.
     * - If the named class is not registered (attempt.Resolved === false), returns a MissingDriverError result.
     */
    public GetDriver(type: mjBizAppsVotingElectionTypeEntity): {
        driver: BaseElectionTypeServerDriver | null;
        error: string | null;
    } {
        const className = type.ServerDriverClass?.trim();
        if (!className) {
            return { driver: this.defaultDriver, error: null };
        }

        const cached = this.drivers.get(className);
        if (cached) {
            return { driver: cached, error: null };
        }

        const attempt = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseElectionTypeServerDriver>(
            BaseElectionTypeServerDriver,
            className
        );
        if (!attempt || !attempt.Resolved || !attempt.Instance) {
            return {
                driver: null,
                error: `Election driver class "${className}" is not registered on the server. Writes to elections of type "${type.Code ?? type.Name ?? type.ID}" are refused.`,
            };
        }

        this.drivers.set(className, attempt.Instance);
        return { driver: attempt.Instance, error: null };
    }

    /** Clears the driver cache (called when an election type row is saved). */
    public Clear(): void {
        this.drivers.clear();
    }
}
