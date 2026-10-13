/**
 * Tests for ElectionTypeDriverRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal, type ClassResolutionResult } from '@memberjunction/global';
import { type mjBizAppsVotingElectionTypeEntity } from '@mj-biz-apps/voting-entities';
import { ElectionTypeDriverRegistry } from '../drivers/election-type-driver-registry.js';
import { BaseElectionTypeServerDriver } from '../drivers/base-election-type-server-driver.js';

/** A partial election type row, which is all the registry reads. */
function typeRow(fields: Pick<mjBizAppsVotingElectionTypeEntity, 'ID' | 'Code' | 'Name' | 'ServerDriverClass'>): mjBizAppsVotingElectionTypeEntity {
    return fields as mjBizAppsVotingElectionTypeEntity;
}

describe('ElectionTypeDriverRegistry', () => {
    beforeEach(() => {
        // Reset singleton between tests
        const instance = ElectionTypeDriverRegistry.Instance;
        instance.Clear();
    });

    it('returns the base driver when ServerDriverClass is empty', () => {
        const registry = ElectionTypeDriverRegistry.Instance;
        const mockType = typeRow({
            ID: 'test-id',
            Code: 'test-code',
            Name: 'Test Type',
            ServerDriverClass: null,
        });

        const result = registry.GetDriver(mockType);

        expect(result.driver).toBeTruthy();
        expect(result.error).toBeNull();
        expect(result.driver).toBeInstanceOf(BaseElectionTypeServerDriver);
    });

    it('returns the base driver when ServerDriverClass is whitespace', () => {
        const registry = ElectionTypeDriverRegistry.Instance;
        const mockType = typeRow({
            ID: 'test-id',
            Code: 'test-code',
            Name: 'Test Type',
            ServerDriverClass: '   ',
        });

        const result = registry.GetDriver(mockType);

        expect(result.driver).toBeTruthy();
        expect(result.error).toBeNull();
    });

    it('caches resolved drivers', () => {
        const registry = ElectionTypeDriverRegistry.Instance;

        // Mock ClassFactory
        const mockDriver = new BaseElectionTypeServerDriver();
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'TryCreateInstance').mockReturnValue({
            Instance: mockDriver,
            Resolved: true,
        } as ClassResolutionResult<BaseElectionTypeServerDriver>);

        const mockType = typeRow({
            ID: 'test-id',
            Code: 'motion',
            Name: 'Motion',
            ServerDriverClass: 'TestDriver',
        });

        // First call
        const result1 = registry.GetDriver(mockType);
        expect(result1.driver).toBe(mockDriver);

        // Second call should return cached instance (TryCreateInstance not called again)
        const result2 = registry.GetDriver(mockType);
        expect(result2.driver).toBe(mockDriver);
        expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).toHaveBeenCalledTimes(1);

        vi.restoreAllMocks();
    });

    it('returns error when driver class is not registered', () => {
        const registry = ElectionTypeDriverRegistry.Instance;

        vi.spyOn(MJGlobal.Instance.ClassFactory, 'TryCreateInstance').mockReturnValue({
            Instance: null,
            Resolved: false,
        } as ClassResolutionResult<BaseElectionTypeServerDriver>);

        const mockType = typeRow({
            ID: 'test-id',
            Code: 'board-election',
            Name: 'Board Election',
            ServerDriverClass: 'UnregisteredDriver',
        });

        const result = registry.GetDriver(mockType);

        expect(result.driver).toBeNull();
        expect(result.error).toContain('UnregisteredDriver');
        expect(result.error).toContain('not registered');

        vi.restoreAllMocks();
    });

    it('clears the driver cache', () => {
        const registry = ElectionTypeDriverRegistry.Instance;

        const mockDriver = new BaseElectionTypeServerDriver();
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'TryCreateInstance').mockReturnValue({
            Instance: mockDriver,
            Resolved: true,
        } as ClassResolutionResult<BaseElectionTypeServerDriver>);

        const mockType = typeRow({
            ID: 'test-id',
            Code: 'motion',
            Name: 'Motion',
            ServerDriverClass: 'CachedDriver',
        });

        const result1 = registry.GetDriver(mockType);
        expect(result1.driver).toBe(mockDriver);

        registry.Clear();

        // After clear, should resolve again (call TryCreateInstance again)
        const result2 = registry.GetDriver(mockType);
        expect(result2.driver).toBe(mockDriver);
        expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).toHaveBeenCalledTimes(2);

        vi.restoreAllMocks();
    });

    it('returns Singleton instance', () => {
        const instance1 = ElectionTypeDriverRegistry.Instance;
        const instance2 = ElectionTypeDriverRegistry.Instance;

        expect(instance1).toBe(instance2);
    });
});
