/**
 * BaseEligibilitySource: the plug-in point that answers "who may vote in this election, in which class, with what weight".
 * Resolved through ClassFactory by EligibilitySourceType.DriverClass. Drivers hold no state.
 */

import { type VotingContext } from '../shared/index.js';
import { type JsonObject } from './json-settings.js';
import { type RollBuildReport, type RollEntry } from './roll-types.js';

export abstract class BaseEligibilitySource {
    /**
     * Builds the roll as of the record date, and reports the source rows that could not be used.
     * @param settings the source type's default Configuration merged with Election.EligibilitySourceSettings
     * @param recordDate the date the roll is frozen at; sources that can answer "as of" must honor it
     */
    public abstract BuildRollReport(settings: JsonObject, recordDate: Date, ctx: VotingContext): Promise<RollBuildReport>;

    /** The entries only (see {@link BuildRollReport}). */
    public async BuildRoll(settings: JsonObject, recordDate: Date, ctx: VotingContext): Promise<RollEntry[]> {
        return (await this.BuildRollReport(settings, recordDate, ctx)).Entries;
    }
}
