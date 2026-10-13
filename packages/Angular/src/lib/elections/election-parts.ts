/**
 * Assembles the admin tabs and setup-wizard steps for an election type.
 *
 * Order of authority (design section 6): the built-in parts are the defaults; the type's own UI driver
 * may replace or add parts; contributions from other apps (registered with RegisterClassEx under
 * BaseElectionAdminTab / BaseElectionSetupStep) may only add.
 */
import type { Type } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import {
    assembleElectionContributions,
    BaseElectionAdminTab,
    BaseElectionSetupStep,
    ElectionTypeUIDriverRegistry,
    type ElectionAdminTabDescriptor,
    type ElectionSetupStepDescriptor,
    type ElectionUIContext,
} from '@mj-biz-apps/voting-ng-widgets';
import { OverviewTabComponent } from './tabs/overview.tab';
import { RollTabComponent } from './tabs/roll.tab';
import { CredentialsTabComponent } from './tabs/credentials.tab';
import { TurnoutTabComponent } from './tabs/turnout.tab';
import { TallyTabComponent } from './tabs/tally.tab';
import { CertificationTabComponent } from './tabs/certification.tab';
import { PaperTabComponent } from './tabs/paper.tab';
import { TrusteesTabComponent } from './tabs/trustees.tab';
import type { HostedContribution } from './contribution-host.component';

/** Keys of the built-in wizard steps, in order. */
export const BUILT_IN_STEP_KEYS = ['type', 'details', 'contests', 'eligibility', 'anchors', 'review'] as const;
export type BuiltInStepKey = (typeof BUILT_IN_STEP_KEYS)[number];

const BUILT_IN_TABS: ElectionAdminTabDescriptor[] = [
    { key: 'overview', label: 'Overview', icon: 'fa-solid fa-circle-info', sequence: 10, electionTypes: ['*'] },
    { key: 'roll', label: 'Roll', icon: 'fa-solid fa-users', sequence: 20, electionTypes: ['*'] },
    { key: 'credentials', label: 'Credentials', icon: 'fa-solid fa-key', sequence: 30, electionTypes: ['*'] },
    { key: 'paper', label: 'Paper ballots', icon: 'fa-solid fa-file-pen', sequence: 35, electionTypes: ['*'] },
    { key: 'turnout', label: 'Turnout', icon: 'fa-solid fa-gauge-high', sequence: 40, electionTypes: ['*'] },
    { key: 'trustees', label: 'Trustees', icon: 'fa-solid fa-user-shield', sequence: 45, electionTypes: ['*'] },
    { key: 'tally', label: 'Close & Tally', icon: 'fa-solid fa-calculator', sequence: 50, electionTypes: ['*'] },
    { key: 'certification', label: 'Certification', icon: 'fa-solid fa-certificate', sequence: 60, electionTypes: ['*'] },
];

const BUILT_IN_TAB_TYPES: Record<string, Type<BaseElectionAdminTab>> = {
    overview: OverviewTabComponent,
    roll: RollTabComponent,
    credentials: CredentialsTabComponent,
    paper: PaperTabComponent,
    turnout: TurnoutTabComponent,
    trustees: TrusteesTabComponent,
    tally: TallyTabComponent,
    certification: CertificationTabComponent,
};

const BUILT_IN_STEPS: ElectionSetupStepDescriptor[] = [
    { key: 'type', label: 'Type', stepNumber: 1, electionTypes: ['*'] },
    { key: 'details', label: 'Details', stepNumber: 2, electionTypes: ['*'] },
    { key: 'contests', label: 'Contests & options', stepNumber: 3, electionTypes: ['*'] },
    { key: 'eligibility', label: 'Eligibility', stepNumber: 4, electionTypes: ['*'] },
    { key: 'anchors', label: 'Linked records', stepNumber: 5, electionTypes: ['*'] },
    { key: 'review', label: 'Review', stepNumber: 99, electionTypes: ['*'] },
];

/** Admin tabs for an election: built-ins, the type's UI driver, then additive contributions. */
export function AssembleAdminTabs(ctx: ElectionUIContext, uiDriverClass: string | null): ElectionAdminTabDescriptor[] {
    const driver = ElectionTypeUIDriverRegistry.Instance.ResolveDriver(uiDriverClass);
    const fromDriver = driver.GetAdminTabs(ctx, BUILT_IN_TABS);
    return assembleElectionContributions<ElectionAdminTabDescriptor>(
        BaseElectionAdminTab,
        ctx.ElectionTypeCode,
        fromDriver,
        (reg, meta) => ({
            key: meta.contributionKey,
            label: meta.label ?? meta.contributionKey,
            icon: meta.icon,
            sequence: meta.sequence ?? 100,
            electionTypes: meta.electionTypes,
            componentClass: reg.Key ?? undefined,
        })
    );
}

/** The wizard's steps for a type: built-ins, the type's UI driver, then additive contributions (ordered by step number). */
export function AssembleSetupSteps(ctx: ElectionUIContext, uiDriverClass: string | null): ElectionSetupStepDescriptor[] {
    const driver = ElectionTypeUIDriverRegistry.Instance.ResolveDriver(uiDriverClass);
    const fromDriver = driver.GetSetupSteps(ctx, BUILT_IN_STEPS);
    const assembled = assembleElectionContributions<ElectionSetupStepDescriptor>(
        BaseElectionSetupStep,
        ctx.ElectionTypeCode,
        fromDriver,
        (reg, meta) => ({
            key: meta.contributionKey,
            label: meta.label ?? meta.contributionKey,
            // Contributed steps slot in before the review step unless they say otherwise.
            stepNumber: meta.sequence ?? 55,
            electionTypes: meta.electionTypes,
            componentClass: reg.Key ?? undefined,
        })
    );
    return [...assembled].sort((a, b) => a.stepNumber - b.stepNumber);
}

/** Resolves the Angular component a tab descriptor names, or null when it is not registered. */
export function ResolveTabComponent(tab: ElectionAdminTabDescriptor): Type<HostedContribution> | null {
    const builtIn = BUILT_IN_TAB_TYPES[tab.key];
    if (builtIn && !tab.componentClass) {
        return builtIn as Type<HostedContribution>;
    }
    return ResolveRegistered(BaseElectionAdminTab, tab.componentClass);
}

/** Resolves the Angular component a contributed setup step names, or null when it is not registered. */
export function ResolveStepComponent(step: ElectionSetupStepDescriptor): Type<HostedContribution> | null {
    return ResolveRegistered(BaseElectionSetupStep, step.componentClass);
}

function ResolveRegistered(baseClass: object, key: string | undefined): Type<HostedContribution> | null {
    if (!key) {
        return null;
    }
    const registered: unknown = MJGlobal.Instance.ClassFactory.GetRegistration(baseClass, key)?.SubClass;
    return typeof registered === 'function' ? (registered as Type<HostedContribution>) : null;
}
