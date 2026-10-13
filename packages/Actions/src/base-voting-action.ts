import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { IMetadataProvider, LogError, Metadata, RemoteOpInvokeOptions, RemoteOpResult } from '@memberjunction/core';

/**
 * Base class for all Voting actions with common helper methods.
 */
export abstract class BaseVotingAction extends BaseAction {
    protected getStringParam(params: RunActionParams, name: string, defaultValue?: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : defaultValue;
    }

    protected getNumericParam(params: RunActionParams, name: string, defaultValue: number = 0): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const parsed = Number(param.Value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    protected getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean = false): boolean {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim().toLowerCase();
        if (value === 'true' || value === '1' || value === 'yes') return true;
        if (value === 'false' || value === '0' || value === 'no') return false;
        return defaultValue;
    }

    protected addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value
        });
    }

    /** The provider the action runs under: the caller's, else the global default. */
    protected resolveProvider(params: RunActionParams): IMetadataProvider {
        return params.Provider ?? Metadata.Provider;
    }

    /** Invocation options for a server-side Remote Operation call, acting as the action's context user. */
    protected buildOperationOptions(params: RunActionParams): RemoteOpInvokeOptions {
        return { provider: this.resolveProvider(params), user: params.ContextUser };
    }

    /** Standard failure result for a missing required parameter. */
    protected missingParameter(name: string): ActionResultSimple {
        return { Success: false, ResultCode: 'MISSING_PARAMETER', Message: `Parameter '${name}' is required` };
    }

    /**
     * Maps a Remote Operation result (transport result + operation output) to an action result.
     * Transport failures (forbidden, unknown operation, execution error) carry their own ResultCode;
     * logical failures reported by the operation output map to OPERATION_FAILED.
     */
    protected mapOperationResult<TOut extends { Success: boolean; Message?: string }>(
        result: RemoteOpResult<TOut>,
        successMessage: string
    ): ActionResultSimple {
        if (!result.Success || !result.Output) {
            return {
                Success: false,
                ResultCode: result.ResultCode ?? 'OPERATION_FAILED',
                Message: result.ErrorMessage ?? 'The operation did not return a result'
            };
        }
        if (!result.Output.Success) {
            return { Success: false, ResultCode: 'OPERATION_FAILED', Message: result.Output.Message ?? 'The operation failed' };
        }
        return { Success: true, ResultCode: 'SUCCESS', Message: result.Output.Message ?? successMessage };
    }

    protected unexpectedError(actionName: string, error: unknown): ActionResultSimple {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`[${actionName}] Error: ${message}`);
        return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: message };
    }
}
