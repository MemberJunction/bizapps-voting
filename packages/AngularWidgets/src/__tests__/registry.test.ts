import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ElectionTypeUIDriverRegistry, BaseElectionTypeUIDriver, type ElectionUIContext } from '../lib/base-election-type-ui-driver';
import { MJGlobal } from '@memberjunction/global';

// Mock the MJGlobal for testing
const mockGlobal = {
  Instance: {
    ClassFactory: {
      TryCreateInstance: (baseClass: object, className: string) => {
        if (className === 'TestDriver') {
          return {
            Resolved: true,
            Instance: new TestDriver(),
          };
        }
        return {
          Resolved: false,
          Instance: null,
        };
      },
    },
  },
};

class TestDriver extends BaseElectionTypeUIDriver {
  public override GetAdminTabs(ctx: ElectionUIContext, defaults: any) {
    return [
      ...defaults,
      {
        key: 'test-tab',
        label: 'Test Tab',
        sequence: 50,
      },
    ];
  }
}

describe('ElectionTypeUIDriverRegistry', () => {
  let registry: ElectionTypeUIDriverRegistry;

  beforeEach(() => {
    // Clear the singleton cache before each test
    (ElectionTypeUIDriverRegistry as any)._instance = null;
    registry = ElectionTypeUIDriverRegistry.Instance;
  });

  afterEach(() => {
    registry.ClearCache();
  });

  it('should return the default driver for empty or null class name', () => {
    const driver1 = registry.ResolveDriver(null);
    const driver2 = registry.ResolveDriver('');
    const driver3 = registry.ResolveDriver('   ');
    const def = registry.GetDefaultDriver();

    expect(driver1).toBe(def);
    expect(driver2).toBe(def);
    expect(driver3).toBe(def);
  });

  it('should cache the default driver', () => {
    const driver1 = registry.GetDefaultDriver();
    const driver2 = registry.GetDefaultDriver();

    expect(driver1).toBe(driver2);
  });

  it('should return the base driver when class is not registered', () => {
    const driver = registry.ResolveDriver('NonExistentDriver');
    const def = registry.GetDefaultDriver();

    // Should be a base driver (default fallback)
    expect(driver).toBeInstanceOf(BaseElectionTypeUIDriver);
    expect(driver).toBe(def);
  });

  it('should clear the cache on ClearCache()', () => {
    const driver1 = registry.GetDefaultDriver();
    registry.ClearCache();
    const driver2 = registry.GetDefaultDriver();

    // After clear, a new instance should be created
    expect(driver1).not.toBe(driver2);
  });

  it('should be a singleton', () => {
    const registry1 = ElectionTypeUIDriverRegistry.Instance;
    const registry2 = ElectionTypeUIDriverRegistry.Instance;

    expect(registry1).toBe(registry2);
  });
});
