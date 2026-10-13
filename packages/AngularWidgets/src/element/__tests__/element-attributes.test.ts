import { describe, it, expect } from 'vitest';
import { configFromAttributes, inputsFromAttributes, effectOf } from '../element-attributes';

describe('element-attributes', () => {
  describe('configFromAttributes', () => {
    it('should read api-root and build graphqlUrl', () => {
      const read = (name: string) => {
        const attrs: Record<string, string> = { 'api-root': 'https://api.example.com/vote' };
        return attrs[name] || null;
      };

      const config = configFromAttributes(read);

      expect(config.apiRoot).toBe('https://api.example.com/vote');
      expect(config.graphqlUrl).toContain('vote/graphql');
    });

    it('should use defaults when attributes are missing', () => {
      const config = configFromAttributes(() => null);

      expect(config.apiRoot).toBe('/vote');
      expect(config.language).toBeUndefined();
      expect(config.graphqlUrl).toBe('/vote/graphql');
    });

    it('should honour an explicit graphql-url over the api-root default', () => {
      const attrs: Record<string, string> = { 'api-root': 'https://edge.example.com/vote', 'graphql-url': 'https://api.example.com/graphql' };
      const config = configFromAttributes((n) => attrs[n] ?? null);
      expect(config.graphqlUrl).toBe('https://api.example.com/graphql');
    });

    it('should read optional attributes', () => {
      const read = (name: string) => {
        const attrs: Record<string, string> = {
          'host-assertion': 'eyJhbGc...',
          email: 'voter@example.com',
          language: 'es',
        };
        return attrs[name] || null;
      };

      const config = configFromAttributes(read);

      expect(config.hostAssertion).toBe('eyJhbGc...');
      expect(config.email).toBe('voter@example.com');
      expect(config.language).toBe('es');
    });
  });

  describe('inputsFromAttributes', () => {
    it('should extract input attributes', () => {
      const read = (name: string) => {
        const attrs: Record<string, string> = {
          slug: 'election-2024',
          language: 'fr',
        };
        return attrs[name] || null;
      };

      const inputs = inputsFromAttributes(read);

      expect(inputs).toContainEqual(['slug', 'election-2024']);
      expect(inputs).toContainEqual(['language', 'fr']);
    });

    it('should return empty string for missing input attributes', () => {
      const inputs = inputsFromAttributes(() => null);

      const slugInput = inputs.find(([name]) => name === 'slug');
      expect(slugInput).toEqual(['slug', '']);
    });
  });

  describe('effectOf', () => {
    it('should return "input" for slug', () => {
      expect(effectOf('slug')).toBe('input');
    });

    it('should return "rebuild" for api-root', () => {
      expect(effectOf('api-root')).toBe('rebuild');
    });

    it('should return undefined for unknown attributes', () => {
      expect(effectOf('unknown-attr')).toBeUndefined();
    });
  });
});
