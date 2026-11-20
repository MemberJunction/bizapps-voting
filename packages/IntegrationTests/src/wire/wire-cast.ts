/**
 * The cast of a wire run: the system identity plus every provisioned persona, each with its own provider, created on demand.
 */
import { MEMBER_KEYS, PERSONA_SPECS, TRUSTEE_KEYS, type PersonaKey, type PersonaRecord } from './persona-model.js';
import { RequirePersona } from './persona-store.js';
import { ResolveWireConfig } from './wire-config.js';
import { WireClient } from './wire-client.js';

export class WireCast {
    private readonly clients = new Map<PersonaKey, WireClient>();

    private constructor(public readonly System: WireClient) {}

    /** Connects the system identity (x-mj-api-key). Personas connect lazily on first use. */
    public static async Create(): Promise<WireCast> {
        const { SystemKey } = ResolveWireConfig();
        return new WireCast(await WireClient.Connect('system', { Kind: 'system', Key: SystemKey }));
    }

    /** The provisioned record (ids, email, key) of a persona. */
    public Record(key: PersonaKey): PersonaRecord {
        return RequirePersona(key);
    }

    /** The persona's client, connected with its user API key. */
    public async As(key: PersonaKey): Promise<WireClient> {
        const existing = this.clients.get(key);
        if (existing) return existing;
        const record = RequirePersona(key);
        const client = await WireClient.Connect(key, { Kind: 'user-key', Key: record.APIKey });
        this.clients.set(key, client);
        return client;
    }

    /** Every persona key that exists, in declaration order. */
    public static get Keys(): PersonaKey[] {
        return PERSONA_SPECS.map((p) => p.Key);
    }

    public static get MemberKeys(): readonly PersonaKey[] {
        return MEMBER_KEYS;
    }

    public static get TrusteeKeys(): readonly PersonaKey[] {
        return TRUSTEE_KEYS;
    }
}
