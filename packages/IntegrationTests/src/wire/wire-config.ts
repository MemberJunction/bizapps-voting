/**
 * Where the wire tier talks to. Reads process.env only (the dispatcher loads the repo .env first); prints nothing.
 *
 *   VOTING_WIRE_URL    GraphQL endpoint (default http://localhost:${VOTING_WIRE_PORT ?? 4104}/)
 *   VOTING_WIRE_PORT   port of the voting test host (default 4104)
 *   MJ_API_KEY         the host's system API key (x-mj-api-key)
 */
export interface WireConfig {
    /** GraphQL endpoint. */
    GraphQLUrl: string;
    /** Server origin, no trailing slash: where `/vote` and `/magic-link` live. */
    BaseUrl: string;
    /** The system API key. */
    SystemKey: string;
}

export function ResolveWireConfig(): WireConfig {
    const port = process.env.VOTING_WIRE_PORT ?? '4104';
    const graphQLUrl = process.env.VOTING_WIRE_URL ?? `http://localhost:${port}/`;
    const systemKey = process.env.MJ_API_KEY;
    if (!systemKey) throw new Error('MJ_API_KEY is not set (it lives in the voting repo .env; the dispatcher loads it).');
    return { GraphQLUrl: graphQLUrl, BaseUrl: new URL(graphQLUrl).origin, SystemKey: systemKey };
}
