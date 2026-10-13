/**
 * Finds the origin of the MJ API that serves the public ballot edge (/vote).
 */
import type { IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** The API origin from the GraphQL endpoint the provider talks to, falling back to the page origin. */
export function ResolveApiOrigin(provider: IMetadataProvider): string {
    if (provider instanceof GraphQLDataProvider) {
        try {
            return new URL(provider.ConfigData.URL).origin;
        } catch {
            // fall through to the page origin
        }
    }
    return window.location.origin;
}
