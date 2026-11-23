import { describe, it, expect, beforeEach } from 'vitest';
import { BaseElectionTypeUIDriver, type ElectionUIContext, type ElectionAdminTabDescriptor, type ElectionVocabulary } from '../lib/base-election-type-ui-driver';

describe('BaseElectionTypeUIDriver', () => {
  let driver: BaseElectionTypeUIDriver;

  beforeEach(() => {
    driver = new BaseElectionTypeUIDriver();
  });

  const mockContext: ElectionUIContext = {
    ElectionID: 'election-123',
    ElectionTypeID: 'type-456',
    ElectionTypeCode: 'motion',
    Status: 'Draft',
    SecrecyMode: 'Confidential',
    IsAdministrator: true,
  };

  describe('GetAdminTabs', () => {
    it('should return defaults unchanged by the base driver', () => {
      const defaults: ElectionAdminTabDescriptor[] = [
        { key: 'overview', label: 'Overview', sequence: 10 },
        { key: 'settings', label: 'Settings', sequence: 20 },
      ];

      const result = driver.GetAdminTabs(mockContext, defaults);

      expect(result).toEqual(defaults);
    });
  });

  describe('GetSetupSteps', () => {
    it('should return defaults unchanged by the base driver', () => {
      const defaults = [
        { key: 'step-1', label: 'Name', stepNumber: 1 },
        { key: 'step-2', label: 'Type', stepNumber: 2 },
      ];

      const result = driver.GetSetupSteps(mockContext, defaults);

      expect(result).toEqual(defaults);
    });
  });

  describe('GetDetailsForm', () => {
    it('should return null if default is null', () => {
      const result = driver.GetDetailsForm(mockContext, null);

      expect(result).toBeNull();
    });

    it('should return default form descriptor', () => {
      const defaultForm = {
        entityName: 'MJ_BizApps_Voting: Standard Ballot Elections',
        hiddenFieldNames: ['InternalField'],
      };

      const result = driver.GetDetailsForm(mockContext, defaultForm);

      expect(result).toEqual(defaultForm);
    });
  });

  describe('GetResultsViews', () => {
    it('should return defaults unchanged by the base driver', () => {
      const defaults = [
        { key: 'summary', label: 'Summary', sequence: 10 },
        { key: 'details', label: 'Detailed Results', sequence: 20 },
      ];

      const result = driver.GetResultsViews(mockContext, defaults);

      expect(result).toEqual(defaults);
    });
  });

  describe('GetVocabulary', () => {
    it('should return defaults unchanged by the base driver', () => {
      const defaults: ElectionVocabulary = {
        Election: 'Motion',
        Contest: 'Question',
        Option: 'Choice',
        Voter: 'Member',
      };

      const result = driver.GetVocabulary(mockContext, defaults);

      expect(result).toEqual(defaults);
    });

    it('should merge vocabulary with defaults', () => {
      const defaults: ElectionVocabulary = {
        Election: 'Election',
        Contest: 'Contest',
      };

      const result = driver.GetVocabulary(mockContext, defaults);

      expect(result.Election).toBe('Election');
      expect(result.Contest).toBe('Contest');
    });
  });

  describe('driver context support', () => {
    it('should handle context with null ElectionID (new election)', () => {
      const newElectionContext: ElectionUIContext = {
        ...mockContext,
        ElectionID: null,
      };

      const tabs = driver.GetAdminTabs(newElectionContext, []);

      expect(tabs).toEqual([]);
    });

    it('should handle context with different election types', () => {
      const boardElectionContext: ElectionUIContext = {
        ...mockContext,
        ElectionTypeCode: 'board-election',
      };

      const tabs = driver.GetAdminTabs(boardElectionContext, [
        { key: 'overview', label: 'Overview', sequence: 10 },
      ]);

      expect(tabs[0].key).toBe('overview');
    });

    it('should handle different election statuses', () => {
      const openElectionContext: ElectionUIContext = {
        ...mockContext,
        Status: 'Open',
      };

      const tabs = driver.GetAdminTabs(openElectionContext, [
        { key: 'overview', label: 'Overview', sequence: 10 },
      ]);

      expect(tabs[0].label).toBe('Overview');
    });
  });

  describe('vocabulary customization', () => {
    it('should allow custom vocabulary labels', () => {
      const customVocab: ElectionVocabulary = {
        Election: 'Standards Ballot',
        Contest: 'Standard',
        Option: 'Position',
        Voter: 'Ballot Holder',
        Vote: 'Position Vote',
      };

      expect(customVocab.Election).toBe('Standards Ballot');
      expect(customVocab.Contest).toBe('Standard');
    });

    it('should allow additional custom vocabulary keys', () => {
      const customVocab: ElectionVocabulary = {
        ...{
          Election: 'Referendum',
          Contest: 'Question',
          Option: 'Choice',
        },
        AdditionalKey: 'Custom Value',
      };

      expect(customVocab.AdditionalKey).toBe('Custom Value');
    });
  });
});
