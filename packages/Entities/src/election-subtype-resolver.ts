/**
 * ElectionSubtypeResolver
 * Resolves which IsA child entity an Election belongs to, based on its ElectionTypeID.
 * Mirrors the pattern from bizapps-collaboration's SpaceSubtypeResolver.
 * § 6 of the design document.
 */

import { EntitySubtypeResolver, RunView, type BaseEntity } from '@memberjunction/core';
import { BaseSingleton, RegisterClass } from '@memberjunction/global';
import { mjBizAppsVotingElectionEntity } from './generated/entity_subclasses.js';

const ELECTIONS = 'MJ_BizApps_Voting: Elections';
const ELECTION_TYPES = 'MJ_BizApps_Voting: Election Types';

/**
 * Directory of election type → extension entity mappings.
 * Populated by VotingEngineBase and read by the resolver.
 * A singleton, so a package that loads twice still has one directory.
 */
export class ElectionSubtypeDirectory extends BaseSingleton<ElectionSubtypeDirectory> {
    private byTypeId = new Map<string, string | null>();

    protected constructor() {
        super();
    }

    public static get Instance(): ElectionSubtypeDirectory {
        return super.getInstance<ElectionSubtypeDirectory>();
    }

    /**
     * Replace the directory with what the given election types name.
     * A type that names none maps to null.
     */
    public Replace(types: ReadonlyArray<{ ID: string; ElectionExtensionEntity: string | null }>): void {
        this.byTypeId = new Map(types.map((type) => [type.ID.toLowerCase(), type.ElectionExtensionEntity?.trim() || null]));
    }

    /**
     * The subtype the type names; null when it names none; undefined when the type isn't in the directory (not loaded yet).
     */
    public Get(typeId: string | null | undefined): string | null | undefined {
        if (!typeId) return undefined;
        return this.byTypeId.get(typeId.toLowerCase());
    }
}

/**
 * The type of an election record, read from the generated property.
 * Null for a record that is not an election.
 */
function electionTypeIdOf(record: BaseEntity): string | null {
    return record instanceof mjBizAppsVotingElectionEntity ? record.ElectionTypeID : null;
}

/**
 * EntitySubtypeResolver registered on Election.
 * Determines which IsA child entity (if any) an election belongs to.
 */
@RegisterClass(EntitySubtypeResolver, ELECTIONS)
export class ElectionSubtypeResolver extends EntitySubtypeResolver {
    /**
     * The subtype a new election gets: its type's extension entity, if any.
     * May read the type when the directory hasn't been filled.
     */
    public override async Resolve(record: BaseEntity): Promise<string | null> {
        const typeId = electionTypeIdOf(record);
        if (!typeId) return null;

        const known = ElectionSubtypeDirectory.Instance.Get(typeId);
        if (known !== undefined) return known;

        // Directory not yet filled; read from the database
        const result = await new RunView(record.RunViewProviderToUse).RunView<{ ElectionExtensionEntity: string | null }>(
            {
                EntityName: ELECTION_TYPES,
                ExtraFilter: `ID = '${typeId.replace(/[^0-9a-fA-F-]/g, '')}'`,
                Fields: ['ElectionExtensionEntity'],
                ResultType: 'simple',
            },
            record.ContextCurrentUser
        );

        if (!result.Success) throw new Error(`The subtype of the election's type could not be read: ${result.ErrorMessage ?? 'unknown error'}`);
        return result.Results?.[0]?.ElectionExtensionEntity?.trim() || null;
    }

    /**
     * The subtype a loaded election most likely has: its type's extension entity, from memory.
     * No hint (null) while the directory isn't filled.
     * MJ's next asks for this (MJ#4787); a release without it never calls this.
     */
    public ResolveLoadHint(record: BaseEntity): string | null {
        return ElectionSubtypeDirectory.Instance.Get(electionTypeIdOf(record)) ?? null;
    }
}

/**
 * Keeps the class from being tree-shaken away.
 * Called from the server's startup export (LoadBizAppsVotingServer).
 */
export function LoadElectionSubtypeResolver(): void {}
