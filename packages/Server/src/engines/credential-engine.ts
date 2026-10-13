/**
 * CredentialEngine: issues voter credentials and verifies what a voter presents against a ballot distribution.
 * Methods are ClassFactory plug-ins (BaseVoterCredentialMethod). No secret, PIN or assertion is ever logged.
 */

import { BaseSingleton, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    type mjBizAppsVotingBallotDistributionEntity,
    type mjBizAppsVotingElectionEntity,
    type mjBizAppsVotingEligibleVoterEntity,
    type mjBizAppsVotingVoterCredentialEntity,
    type mjBizAppsVotingVoterCredentialMethodEntity,
    type VotingIssueCredentialsInput,
} from '@mj-biz-apps/voting-entities';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { LoadElectionEntity } from '../eligibility/index.js';
import {
    BaseVoterCredentialMethod,
    type CredentialIssueTarget,
    GenerateControlNumber,
    GeneratePin,
    HashControlNumber,
    HashPin,
    InsertCredential,
    ParseAllowedMethods,
    RevokeLiveCredentials,
    VOTER_CREDENTIALS_ENTITY,
    type VerifiedVoter,
    type VoterCredentialPresentation,
} from '../credentials/index.js';
import { LoadElectionGraph, ElectionAudit, type EngineResult, Fail, Ok, SqlLiteral, type VotingContext, RunViewOf, IsFailure, PassFailure } from '../shared/index.js';

const ELIGIBLE_VOTERS_ENTITY = 'MJ_BizApps_Voting: Eligible Voters';
const DISTRIBUTIONS_ENTITY = 'MJ_BizApps_Voting: Ballot Distributions';
const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';
const SECOND_FACTOR_CODE = 'second-factor';
const ID_CHUNK = 100;

export interface IssueCredentialsValue {
    Issued: number;
    Skipped: number;
    /** Distinct reasons voters were skipped (codes such as NoEmail, NoEmailProvider, SendFailed). */
    Reasons: string[];
}

export interface ControlNumberIssue {
    EligibleVoterID: string;
    /** The plain control number. Shown once; only its SHA-256 is stored. */
    ControlNumber: string;
}

export interface PinIssue {
    EligibleVoterID: string;
    SourceKey: string | null;
    /** The plain PIN. Shown once; only a salted scrypt hash is stored. */
    Pin: string;
}

export interface VerifyCredentialValue {
    EligibleVoterID: string;
    ElectionID: string;
    MethodID: string;
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

export class CredentialEngine extends BaseSingleton<CredentialEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): CredentialEngine {
        return super.getInstance<CredentialEngine>();
    }

    // ─── Issue ─────────────────────────────────────────────────────────────

    /**
     * Issues a credential of the given method to each targeted voter (default: every Eligible voter), through the method's driver.
     * An emailed-link issue replaces the voter's earlier unused link. Voters who cannot be reached are Skipped with a reason.
     */
    public async IssueCredentials(input: VotingIssueCredentialsInput, ctx: VotingContext): Promise<EngineResult<IssueCredentialsValue>> {
        const loaded = await LoadElectionEntity(input.ElectionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const election = loaded.Value;
        if (!['Ready', 'Open'].includes(election.Status)) return Fail('InvalidStatus', `Credentials are issued once the election is Ready or Open; it is ${election.Status}.`);

        const method = await this.resolveMethod(input.MethodCode, ctx);
        if (IsFailure(method)) return PassFailure(method);
        const driver = this.createDriver(method.Value);
        if (IsFailure(driver)) return PassFailure(driver);
        if (!method.Value.RequiresIssuance) return Fail('MethodDoesNotIssue', `The method "${method.Value.Name}" does not issue credentials.`);

        try {
            const voters = await this.loadTargets(election.ID, input.EligibleVoterIDs, ctx);
            const emails = await this.loadEmails(voters, ctx);
            const distribution = await this.findDistribution(election.ID, method.Value.Code, ctx);
            const baseUrl = input.BaseUrl?.trim() || null;

            let issued = 0;
            let skipped = 0;
            const reasons = new Set<string>();
            for (const voter of voters) {
                const target: CredentialIssueTarget = { Voter: voter, Email: emails.get(voter.PersonID.toLowerCase()) ?? null };
                const result = await driver.Value.Issue(target, { Election: election, Method: method.Value, Distribution: distribution, BaseUrl: baseUrl }, ctx);
                if (result.Status === 'Issued') {
                    issued++;
                } else {
                    skipped++;
                    reasons.add(result.Reason);
                }
            }
            await ElectionAudit.Record(ctx, election.ID, 'CredentialsIssued', { Method: method.Value.Code, Issued: issued, Skipped: skipped });
            return Ok({ Issued: issued, Skipped: skipped, Reasons: Array.from(reasons) });
        } catch (e) {
            return Fail('IssueFailed', e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Generates random control numbers for paper and proxy ballots. Only the SHA-256 of each is stored; the plain numbers are
     * returned once, here. `MethodCode` names the credential method the rows are filed under (default 'emailed-link').
     * Issuing again for a voter revokes that voter's earlier unused credential of the same method.
     */
    public async IssueControlNumbers(
        input: { ElectionID: string; EligibleVoterIDs?: string[]; MethodCode?: string },
        ctx: VotingContext
    ): Promise<EngineResult<{ Numbers: ControlNumberIssue[] }>> {
        const loaded = await LoadElectionEntity(input.ElectionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const method = await this.resolveMethod(input.MethodCode ?? 'emailed-link', ctx);
        if (IsFailure(method)) return PassFailure(method);
        try {
            const voters = await this.loadTargets(loaded.Value.ID, input.EligibleVoterIDs, ctx);
            const numbers: ControlNumberIssue[] = [];
            for (const voter of voters) {
                const controlNumber = GenerateControlNumber();
                await RevokeLiveCredentials(voter.ID, method.Value.ID, ctx);
                await InsertCredential(
                    { EligibleVoterID: voter.ID, VoterCredentialMethodID: method.Value.ID, ControlNumberHash: HashControlNumber(controlNumber), ExpiresAt: loaded.Value.ClosesAt },
                    ctx
                );
                numbers.push({ EligibleVoterID: voter.ID, ControlNumber: controlNumber });
            }
            await ElectionAudit.Record(ctx, loaded.Value.ID, 'ControlNumbersIssued', { Count: numbers.length });
            return Ok({ Numbers: numbers });
        } catch (e) {
            return Fail('IssueFailed', e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Finds the voter a control number belongs to (for staff entering a paper ballot). With `consume`, the credential is also
     * marked redeemed so the number cannot be used twice; a used, revoked or expired number is refused.
     */
    public async VerifyControlNumber(electionID: string, controlNumber: string, ctx: VotingContext, consume = false): Promise<EngineResult<{ EligibleVoterID: string }>> {
        const rv = RunViewOf(ctx);
        const found = await rv.RunView<mjBizAppsVotingVoterCredentialEntity>(
            { EntityName: VOTER_CREDENTIALS_ENTITY, ExtraFilter: `ControlNumberHash = ${SqlLiteral(HashControlNumber(controlNumber))}`, MaxRows: 2, ResultType: 'entity_object' },
            ctx.ContextUser
        );
        if (!found.Success || found.Results.length !== 1) return Fail('InvalidCredential', 'The control number could not be verified.');
        const credential = found.Results[0];
        if (credential.RevokedAt || credential.RedeemedAt || (credential.ExpiresAt && credential.ExpiresAt.getTime() <= Date.now())) {
            return Fail('InvalidCredential', 'The control number could not be verified.');
        }
        const voter = await ctx.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>(ELIGIBLE_VOTERS_ENTITY, ctx.ContextUser);
        if (!(await voter.Load(credential.EligibleVoterID)) || !UUIDsEqual(voter.ElectionID, electionID) || voter.Status !== 'Eligible') {
            return Fail('InvalidCredential', 'The control number could not be verified.');
        }
        if (consume) {
            credential.RedeemedAt = new Date();
            if (!(await credential.Save())) return Fail('CredentialUpdateFailed', 'The control number could not be redeemed.');
        }
        return Ok({ EligibleVoterID: voter.ID });
    }

    /**
     * Generates a PIN for each targeted voter (second factor). The plain PINs are returned once for out-of-band delivery;
     * only a salted scrypt hash is stored. Issuing again replaces the voter's earlier PIN.
     */
    public async IssueSecondFactorPins(
        input: { ElectionID: string; EligibleVoterIDs?: string[]; PinDigits?: number },
        ctx: VotingContext
    ): Promise<EngineResult<{ Pins: PinIssue[] }>> {
        const loaded = await LoadElectionEntity(input.ElectionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const method = await this.resolveMethod(SECOND_FACTOR_CODE, ctx);
        if (IsFailure(method)) return PassFailure(method);
        try {
            const voters = await this.loadTargets(loaded.Value.ID, input.EligibleVoterIDs, ctx);
            const pins: PinIssue[] = [];
            for (const voter of voters) {
                if (!voter.SourceKey) continue; // the PIN is presented together with the roster id; without one it could not be used
                const pin = GeneratePin(input.PinDigits ?? 8);
                await RevokeLiveCredentials(voter.ID, method.Value.ID, ctx);
                await InsertCredential(
                    { EligibleVoterID: voter.ID, VoterCredentialMethodID: method.Value.ID, SecretHash: await HashPin(pin), ExpiresAt: loaded.Value.ClosesAt },
                    ctx
                );
                pins.push({ EligibleVoterID: voter.ID, SourceKey: voter.SourceKey, Pin: pin });
            }
            await ElectionAudit.Record(ctx, loaded.Value.ID, 'SecondFactorPinsIssued', { Count: pins.length });
            return Ok({ Pins: pins });
        } catch (e) {
            return Fail('IssueFailed', e instanceof Error ? e.message : String(e));
        }
    }

    // ─── Verify ────────────────────────────────────────────────────────────

    /**
     * Verifies a presentation for a distribution. Besides the method's own check this enforces that the distribution is Active,
     * the method is allowed on it (the distribution's AllowedCredentialMethods, else the election's AllowedCredentialMethodCodes,
     * else any), and the election is Open.
     *
     * A second factor: when `credential.SecondFactor` is present, or when the allowed list contains 'second-factor' next to
     * other methods, the primary method AND the second factor must both pass and name the same roll entry. A distribution
     * allowing only 'second-factor' uses it alone.
     */
    public async VerifyCredential(
        distribution: mjBizAppsVotingBallotDistributionEntity,
        methodCode: string,
        credential: VoterCredentialPresentation,
        ctx: VotingContext
    ): Promise<EngineResult<VerifyCredentialValue>> {
        if (distribution.Status !== 'Active') return Fail('DistributionInactive', 'This ballot is not currently available.');
        const electionID = distribution.ElectionID;

        const graph = await LoadElectionGraph(electionID, ctx);
        if (IsFailure(graph)) return PassFailure(graph);
        if (graph.Value.Election.Status !== 'Open') return Fail('ElectionNotOpen', 'Voting is not open for this election.');

        const code = methodCode.trim().toLowerCase();
        let allowed = ParseAllowedMethods(distribution.AllowedCredentialMethods);
        if (allowed.length === 0) allowed = (graph.Value.Configuration.AllowedCredentialMethodCodes ?? []).map((c) => c.toLowerCase());
        if (allowed.length > 0 && !allowed.includes(code)) return Fail('MethodNotAllowed', 'This sign-in method is not available for this ballot.');

        const primary = await this.verifyWithMethod(code, credential, distribution, electionID, ctx);
        if (IsFailure(primary)) return PassFailure(primary);

        const secondRequired = code !== SECOND_FACTOR_CODE && (credential.SecondFactor !== undefined || (allowed.includes(SECOND_FACTOR_CODE) && allowed.length > 1));
        if (secondRequired) {
            const second = await this.verifyWithMethod(SECOND_FACTOR_CODE, credential, distribution, electionID, ctx);
            if (IsFailure(second)) return PassFailure(second);
            if (!UUIDsEqual(second.Value.EligibleVoterID, primary.Value.EligibleVoterID)) {
                return Fail('InvalidCredential', 'The credential could not be verified.');
            }
        }
        return Ok({ EligibleVoterID: primary.Value.EligibleVoterID, ElectionID: electionID, MethodID: primary.Value.MethodID });
    }

    private async verifyWithMethod(
        code: string,
        credential: VoterCredentialPresentation,
        distribution: mjBizAppsVotingBallotDistributionEntity,
        electionID: string,
        ctx: VotingContext
    ): Promise<EngineResult<VerifiedVoter & { MethodID: string }>> {
        const method = await this.resolveMethod(code, ctx);
        if (IsFailure(method)) return PassFailure(method);
        const driver = this.createDriver(method.Value);
        if (IsFailure(driver)) return PassFailure(driver);
        const verified = await driver.Value.Verify(credential, distribution, electionID, ctx, method.Value);
        if (IsFailure(verified)) return PassFailure(verified);
        return Ok({ EligibleVoterID: verified.Value.EligibleVoterID, MethodID: method.Value.ID });
    }

    // ─── Revoke ────────────────────────────────────────────────────────────

    /** Revokes one credential so it can no longer be used. Revoking twice is harmless. */
    public async RevokeCredential(credentialID: string, ctx: VotingContext): Promise<EngineResult<{ Revoked: boolean }>> {
        const credential = await ctx.Provider.GetEntityObject<mjBizAppsVotingVoterCredentialEntity>(VOTER_CREDENTIALS_ENTITY, ctx.ContextUser);
        if (!(await credential.Load(credentialID))) return Fail('CredentialNotFound', 'The credential was not found.');
        if (!credential.RevokedAt) {
            credential.RevokedAt = new Date();
            if (!(await credential.Save())) return Fail('RevokeFailed', `Could not revoke the credential: ${credential.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            const voter = await ctx.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>(ELIGIBLE_VOTERS_ENTITY, ctx.ContextUser);
            if (await voter.Load(credential.EligibleVoterID)) {
                await ElectionAudit.Record(ctx, voter.ElectionID, 'CredentialRevoked', { CredentialID: credential.ID });
            }
        }
        return Ok({ Revoked: true });
    }

    // ─── Internals ─────────────────────────────────────────────────────────

    private async resolveMethod(code: string, ctx: VotingContext): Promise<EngineResult<mjBizAppsVotingVoterCredentialMethodEntity>> {
        const engine = VotingEngineBase.Instance;
        await engine.Config(false, ctx.ContextUser, ctx.Provider);
        const method = engine.GetVoterCredentialMethodByCode(code);
        if (!method) return Fail('MethodNotFound', `The credential method "${code}" does not exist.`);
        if (method.Status !== 'Active') return Fail('MethodDisabled', `The credential method "${method.Name}" is disabled.`);
        return Ok(method);
    }

    private createDriver(method: mjBizAppsVotingVoterCredentialMethodEntity): EngineResult<BaseVoterCredentialMethod> {
        const attempt = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseVoterCredentialMethod>(BaseVoterCredentialMethod, method.DriverClass);
        if (!attempt || !attempt.Resolved || !attempt.Instance) {
            return Fail('DriverNotRegistered', `The credential method class "${method.DriverClass}" is not registered on the server.`);
        }
        return Ok(attempt.Instance);
    }

    /** Eligible voters of the election, optionally narrowed to the given IDs (IDs from other elections are ignored). */
    private async loadTargets(electionID: string, voterIDs: string[] | undefined, ctx: VotingContext): Promise<mjBizAppsVotingEligibleVoterEntity[]> {
        const rv = RunViewOf(ctx);
        const groups = voterIDs && voterIDs.length > 0 ? chunk(voterIDs, ID_CHUNK) : [null];
        const voters: mjBizAppsVotingEligibleVoterEntity[] = [];
        for (const group of groups) {
            const idFilter = group ? ` AND ID IN (${group.map(SqlLiteral).join(', ')})` : '';
            const result = await rv.RunView<mjBizAppsVotingEligibleVoterEntity>(
                { EntityName: ELIGIBLE_VOTERS_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND Status = 'Eligible'${idFilter}`, ResultType: 'entity_object' },
                ctx.ContextUser
            );
            if (!result.Success) throw new Error(`Could not read the voter roll: ${result.ErrorMessage}`);
            voters.push(...result.Results);
        }
        return voters;
    }

    private async loadEmails(voters: mjBizAppsVotingEligibleVoterEntity[], ctx: VotingContext): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        const rv = RunViewOf(ctx);
        const personIDs = Array.from(new Set(voters.map((v) => v.PersonID)));
        for (const group of chunk(personIDs, ID_CHUNK)) {
            const result = await rv.RunView<{ ID: string; Email: string | null }>(
                { EntityName: PEOPLE_ENTITY, ExtraFilter: `ID IN (${group.map(SqlLiteral).join(', ')})`, Fields: ['ID', 'Email'], ResultType: 'simple' },
                ctx.ContextUser
            );
            if (!result.Success) throw new Error(`Could not read voter emails: ${result.ErrorMessage}`);
            for (const person of result.Results) {
                if (person.Email?.trim()) map.set(person.ID.toLowerCase(), person.Email.trim());
            }
        }
        return map;
    }

    /** The Active distribution whose slug the link should use: one that allows the method, else any Active one. */
    private async findDistribution(electionID: string, methodCode: string, ctx: VotingContext): Promise<mjBizAppsVotingBallotDistributionEntity | null> {
        const rv = RunViewOf(ctx);
        const result = await rv.RunView<mjBizAppsVotingBallotDistributionEntity>(
            { EntityName: DISTRIBUTIONS_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND Status = 'Active'`, OrderBy: 'Name', ResultType: 'entity_object' },
            ctx.ContextUser
        );
        if (!result.Success || result.Results.length === 0) return null;
        const allowing = result.Results.find((d) => ParseAllowedMethods(d.AllowedCredentialMethods).includes(methodCode.toLowerCase()));
        return allowing ?? result.Results.find((d) => ParseAllowedMethods(d.AllowedCredentialMethods).length === 0) ?? null;
    }
}
