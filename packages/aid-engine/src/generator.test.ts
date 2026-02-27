import { describe, it, expect } from 'vitest';
import { buildTxtRecordVariant, findLongKeyNames, validateTxtRecord } from './generator';
import type { AidGeneratorData } from './generator';

describe('AID Engine Generator', () => {
  const sampleData: AidGeneratorData = {
    domain: 'example.com',
    uri: 'https://api.example.com/agent',
    proto: 'mcp',
    auth: 'pat',
    desc: 'Example Agent',
  };

  describe('buildTxtRecordVariant', () => {
    it('should emit canonical short keys even when legacy full-key mode is requested', () => {
      const record = buildTxtRecordVariant(sampleData, false);
      expect(record).toContain('v=aid1'); // Version always uses alias
      expect(record).toContain('u=https://api.example.com/agent');
      expect(record).toContain('p=mcp');
      expect(record).toContain('a=pat');
      expect(record).toContain('s=Example Agent');
    });

    it('should emit canonical short keys when alias mode is requested', () => {
      const record = buildTxtRecordVariant(sampleData, true);
      expect(record).toContain('v=aid1');
      expect(record).toContain('u=https://api.example.com/agent');
      expect(record).toContain('p=mcp');
      expect(record).toContain('a=pat');
      expect(record).toContain('s=Example Agent');
    });

    it('should handle minimal data (required fields only)', () => {
      const minimalData: AidGeneratorData = {
        domain: 'test.com',
        uri: 'https://test.com/api',
        proto: 'mcp',
      };
      const record = buildTxtRecordVariant(minimalData, false);
      expect(record).toContain('v=aid1'); // Version always uses alias
      expect(record).toContain('u=https://test.com/api');
      expect(record).toContain('p=mcp');
      expect(record).not.toContain('auth=');
      expect(record).not.toContain('desc=');
    });

    it('should handle empty optional fields', () => {
      const dataWithEmptyOptionals: AidGeneratorData = {
        domain: 'test.com',
        uri: 'https://test.com/api',
        proto: 'mcp',
        auth: '',
        desc: '',
      };
      const record = buildTxtRecordVariant(dataWithEmptyOptionals, false);
      expect(record).toContain('v=aid1'); // Version always uses alias
      expect(record).toContain('u=https://test.com/api');
      expect(record).toContain('p=mcp');
      expect(record).not.toContain('auth=');
      expect(record).not.toContain('desc=');
    });
  });

  describe('validateTxtRecord', () => {
    it('should validate correct AID record', () => {
      const validRecord = 'v=aid1;u=https://api.example.com/agent;p=mcp';
      const result = validateTxtRecord(validRecord);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject record without version', () => {
      const invalidRecord = 'u=https://api.example.com/agent;p=mcp';
      const result = validateTxtRecord(invalidRecord);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('v'); // Error uses alias in message
    });

    it('should reject record without uri', () => {
      const invalidRecord = 'v=aid1;p=mcp';
      const result = validateTxtRecord(invalidRecord);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('uri');
    });

    it('should reject record without proto', () => {
      const invalidRecord = 'v=aid1;u=https://api.example.com/agent';
      const result = validateTxtRecord(invalidRecord);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('proto');
    });

    it('should reject record with wrong version', () => {
      const invalidRecord = 'v=aid2;u=https://api.example.com/agent;p=mcp';
      const result = validateTxtRecord(invalidRecord);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('version');
    });

    it('should validate record with aliases', () => {
      const validRecord = 'v=aid1;u=https://api.example.com/agent;p=mcp';
      const result = validateTxtRecord(validRecord);
      expect(result.isValid).toBe(true);
    });

    it('should handle empty input', () => {
      const result = validateTxtRecord('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle malformed records', () => {
      const malformedRecords = [
        'not a record',
        'v=aid1;u;p=mcp', // empty uri
        'v=aid1;u=invalid;p=mcp', // invalid uri
        'v=aid1;u=https://test.com;p=invalid', // invalid proto
      ];

      malformedRecords.forEach((record) => {
        const result = validateTxtRecord(record);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('findLongKeyNames', () => {
    it('finds compatibility-only long keys in a TXT record', () => {
      const longKeys = findLongKeyNames(
        'version=aid1;uri=https://api.example.com/agent;proto=mcp;auth=pat;desc=Example Agent',
      );

      expect(longKeys).toEqual(['version', 'uri', 'proto', 'auth', 'desc']);
    });

    it('ignores canonical short-key records', () => {
      expect(findLongKeyNames('v=aid1;u=https://api.example.com/agent;p=mcp')).toEqual([]);
    });
  });
});
