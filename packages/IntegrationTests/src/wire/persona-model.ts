/**
 * The persona model of the wire tier. Pure data and types, no server imports: the provisioning script (server side) and the
 * wire client both read it, so a persona means exactly one thing in both places.
 *
 * Every persona is a real MJ User (natural key: its email) with a user API key, so it authenticates over GraphQL the way a
 * signed-in person would: the server resolves the key to that user, its Roles, and (through the bizapps-common Person whose
 * LinkedUserID points at it) its place on an election roll.
 *
 * "Eligible voter" in the voting model is a row on an election's frozen roll that points at a bizapps-common Person.
 * A member voter is therefore a User + a linked Person; being on a particular roll is decided per election by the roll
 * source (the wire world uses an inline CSV roll keyed by the Person's email).
 */

/** Email domain every wire persona uses (never deliverable: .test is reserved). */
export const WIRE_EMAIL_DOMAIN = 'voting-wire.test';

export type PersonaKey =
    | 'admin'
    | 'inspector'
    | 'member1'
    | 'member2'
    | 'member3'
    | 'member4'
    | 'outsider'
    | 'outsider-known'
    | 'trustee1'
    | 'trustee2'
    | 'trustee3';

export interface PersonaSpec {
    Key: PersonaKey;
    FirstName: string;
    LastName: string;
    /** MJ Roles the user holds. Every persona holds at least one so MJ can load its metadata. */
    RoleNames: string[];
    /** Whether a bizapps-common Person (linked to the user) exists. A Person is what a roll entry points at. */
    HasPerson: boolean;
    /** Why the persona exists, for humans reading provisioning output. */
    Purpose: string;
}

/** Baseline MJ role every signed-in user holds in this database. */
const BASELINE_ROLE = 'UI';

export const PERSONA_SPECS: readonly PersonaSpec[] = [
    { Key: 'admin', FirstName: 'Wire', LastName: 'Admin', RoleNames: [BASELINE_ROLE, 'Voting Administrator'], HasPerson: true, Purpose: 'runs elections; also signs certifications (needs a Person)' },
    { Key: 'inspector', FirstName: 'Wire', LastName: 'Inspector', RoleNames: [BASELINE_ROLE, 'Election Inspector'], HasPerson: true, Purpose: 'read-mostly oversight' },
    { Key: 'member1', FirstName: 'Wire', LastName: 'MemberOne', RoleNames: [BASELINE_ROLE], HasPerson: true, Purpose: 'member voter' },
    { Key: 'member2', FirstName: 'Wire', LastName: 'MemberTwo', RoleNames: [BASELINE_ROLE], HasPerson: true, Purpose: 'member voter' },
    { Key: 'member3', FirstName: 'Wire', LastName: 'MemberThree', RoleNames: [BASELINE_ROLE], HasPerson: true, Purpose: 'member voter' },
    { Key: 'member4', FirstName: 'Wire', LastName: 'MemberFour', RoleNames: [BASELINE_ROLE], HasPerson: true, Purpose: 'member voter' },
    { Key: 'outsider', FirstName: 'Wire', LastName: 'Outsider', RoleNames: [BASELINE_ROLE], HasPerson: false, Purpose: 'signed-in user with no Person at all: never on any roll, no admin role' },
    { Key: 'outsider-known', FirstName: 'Wire', LastName: 'KnownOutsider', RoleNames: [BASELINE_ROLE], HasPerson: true, Purpose: 'has a Person but is deliberately left off every wire roll' },
    { Key: 'trustee1', FirstName: 'Wire', LastName: 'TrusteeOne', RoleNames: [BASELINE_ROLE], HasPerson: true, Purpose: 'key-share holder' },
    { Key: 'trustee2', FirstName: 'Wire', LastName: 'TrusteeTwo', RoleNames: [BASELINE_ROLE], HasPerson: true, Purpose: 'key-share holder' },
    { Key: 'trustee3', FirstName: 'Wire', LastName: 'TrusteeThree', RoleNames: [BASELINE_ROLE], HasPerson: true, Purpose: 'key-share holder' },
] as const;

export const MEMBER_KEYS: readonly PersonaKey[] = ['member1', 'member2', 'member3', 'member4'];
export const TRUSTEE_KEYS: readonly PersonaKey[] = ['trustee1', 'trustee2', 'trustee3'];

/** The natural key of a persona's User (and of its Person). */
export function PersonaEmail(key: PersonaKey): string {
    return `${key}@${WIRE_EMAIL_DOMAIN}`;
}

/** What provisioning records per persona in the gitignored local file. `APIKey` is a secret: never print it. */
export interface PersonaRecord {
    Key: PersonaKey;
    Email: string;
    UserID: string;
    /** Null when the persona has no Person. */
    PersonID: string | null;
    /** A user API key (`mj_sk_...`). Shown once at creation, so it lives only in the local file. */
    APIKey: string;
}

export interface PersonasFile {
    /** MJAPI the keys were provisioned against (informational). */
    Database: string;
    ProvisionedAt: string;
    Personas: PersonaRecord[];
}
