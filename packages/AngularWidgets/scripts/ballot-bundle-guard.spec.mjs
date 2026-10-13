import { describe, it, expect } from 'vitest';
import { findServerOnlyInputs, createPackageNameResolver } from './ballot-bundle-guard.mjs';

describe('ballot-bundle-guard', () => {
  describe('findServerOnlyInputs', () => {
    it('should detect @memberjunction/* inputs', () => {
      const mockResolver = (path) => {
        if (path.includes('@memberjunction')) return '@memberjunction/core';
        return '@mj-biz-apps/voting-ng-widgets';
      };

      const inputs = [
        'node_modules/@memberjunction/core/dist/index.js',
        'node_modules/@mj-biz-apps/voting-ng-widgets/dist/index.js',
      ];

      const offenders = findServerOnlyInputs(inputs, mockResolver);

      expect(offenders.size).toBeGreaterThan(0);
      expect([...offenders.keys()][0]).toContain('@memberjunction');
    });

    it('should detect acorn imports', () => {
      const mockResolver = (path) => {
        if (path.includes('acorn')) return 'acorn';
        return '@mj-biz-apps/voting-ng-widgets';
      };

      const inputs = ['node_modules/acorn/dist/index.js'];

      const offenders = findServerOnlyInputs(inputs, mockResolver);

      expect(offenders.size).toBeGreaterThan(0);
    });

    it('should detect voting-entities generated subclasses', () => {
      const mockResolver = (path) => '@mj-biz-apps/voting-entities';

      const inputs = [
        'node_modules/@mj-biz-apps/voting-entities/dist/generated/entity_subclasses.js',
      ];

      const offenders = findServerOnlyInputs(inputs, mockResolver);

      expect(offenders.size).toBeGreaterThan(0);
    });

    it('should allow voting-entities contracts', () => {
      const mockResolver = (path) => '@mj-biz-apps/voting-entities';

      const inputs = [
        'node_modules/@mj-biz-apps/voting-entities/dist/contracts/index.js',
        'node_modules/@mj-biz-apps/voting-entities/dist/contracts/types.js',
      ];

      const offenders = findServerOnlyInputs(inputs, mockResolver);

      // Contracts should NOT be flagged
      expect(offenders.size).toBe(0);
    });

    it('should allow other packages', () => {
      const mockResolver = (path) => {
        if (path.includes('@angular')) return '@angular/core';
        return '@mj-biz-apps/voting-ng-widgets';
      };

      const inputs = [
        'node_modules/@angular/core/dist/index.js',
        'node_modules/@mj-biz-apps/voting-ng-widgets/dist/index.js',
      ];

      const offenders = findServerOnlyInputs(inputs, mockResolver);

      // Should be empty
      expect(offenders.size).toBe(0);
    });
  });

  describe('createPackageNameResolver', () => {
    it('should return a function', () => {
      const resolver = createPackageNameResolver(process.cwd());
      expect(typeof resolver).toBe('function');
    });
  });
});
