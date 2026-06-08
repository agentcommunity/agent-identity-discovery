import { describe, it, expect } from 'vitest';
import { parse, AidError, isValidProto, AidRecordValidator } from './parser.js';

describe('AID Parser', () => {
  describe('parse', () => {
    it('should parse a valid AID record', () => {
      const txtRecord = 'v=aid1;uri=https://api.example.com/mcp;proto=mcp;auth=pat;desc=Test Agent';
      const result = parse(txtRecord);

      expect(result).toEqual({
        v: 'aid1',
        uri: 'https://api.example.com/mcp',
        proto: 'mcp',
        auth: 'pat',
        desc: 'Test Agent',
      });
    });

    it('should parse a record with p alias instead of proto', () => {
      const txtRecord = 'v=aid1;uri=https://api.example.com/mcp;p=mcp';
      const result = parse(txtRecord);

      expect(result).toEqual({
        v: 'aid1',
        uri: 'https://api.example.com/mcp',
        proto: 'mcp',
      });
    });

    it('should throw error for missing version', () => {
      const txtRecord = 'uri=https://api.example.com/mcp;proto=mcp';

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow('Missing required field: v');
    });

    it('should throw error for unsupported version', () => {
      const txtRecord = 'v=aid3;uri=https://api.example.com/mcp;proto=mcp';

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow('Unsupported version: aid3');
    });

    it('should throw error for unsupported protocol', () => {
      const txtRecord = 'v=aid1;uri=https://api.example.com/mcp;proto=unknown';

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow('Unsupported protocol: unknown');
    });

    it('should throw error for both proto and p fields', () => {
      const txtRecord = 'v=aid1;uri=https://api.example.com/mcp;proto=mcp;p=mcp';

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow('Cannot specify both "proto" and "p" fields');
    });

    it('should handle case-insensitive keys', () => {
      const txtRecord = 'V=aid1;URI=https://api.example.com/mcp;PROTO=mcp';
      const result = parse(txtRecord);

      expect(result.v).toBe('aid1');
      expect(result.uri).toBe('https://api.example.com/mcp');
      expect(result.proto).toBe('mcp');
    });

    it('should throw error for description longer than 60 UTF-8 bytes', () => {
      const longDesc =
        'This is a very long description that exceeds the 60 UTF-8 byte limit for AID records';
      const txtRecord = `v=aid1;uri=https://api.example.com/mcp;proto=mcp;desc=${longDesc}`;

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow('Description field must be ≤ 60 UTF-8 bytes');
    });

    it('should allow description exactly 60 UTF-8 bytes', () => {
      const exactDesc = 'This description is exactly sixty UTF-8 bytes long, yes!!!!!';
      const txtRecord = `v=aid1;uri=https://api.example.com/mcp;proto=mcp;desc=${exactDesc}`;

      expect(exactDesc).toHaveLength(60);
      expect(new TextEncoder().encode(exactDesc)).toHaveLength(60);

      const result = parse(txtRecord);
      expect(result.desc).toBe(exactDesc);
    });

    it('should validate local protocol with valid URI schemes', () => {
      const validLocalRecords = [
        'v=aid1;uri=docker://my-container:latest;proto=local',
        'v=aid1;uri=npx://my-package@latest;proto=local',
        'v=aid1;uri=pip://my-package==1.0.0;proto=local',
      ];

      for (const record of validLocalRecords) {
        expect(() => parse(record)).not.toThrow();
      }
    });

    it('should throw error for local protocol with invalid URI scheme', () => {
      const invalidLocalRecords = [
        'v=aid1;uri=https://api.example.com/mcp;proto=local',
        'v=aid1;uri=http://localhost:8080;proto=local',
        'v=aid1;uri=file:///path/to/file;proto=local',
        'v=aid1;uri=ssh://user@host;proto=local',
      ];

      for (const record of invalidLocalRecords) {
        expect(() => parse(record)).toThrow(AidError);
        expect(() => parse(record)).toThrow('Invalid URI scheme for local protocol');
      }
    });

    it('should throw error for remote protocol with local URI scheme', () => {
      const txtRecord = 'v=aid1;proto=mcp;uri=docker://fake-container';

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow(
        "Invalid URI scheme for remote protocol 'mcp'. MUST be 'https:'",
      );
    });

    it('should throw an error for key-value pairs with empty values', () => {
      const txtRecord = 'v=aid1;uri=;proto=local';
      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow('Empty key or value in pair: uri=');
    });

    it('should validate auth tokens', () => {
      const validAuthTokens = [
        'none',
        'pat',
        'apikey',
        'basic',
        'oauth2_device',
        'oauth2_code',
        'mtls',
        'custom',
      ];

      for (const auth of validAuthTokens) {
        const txtRecord = `v=aid1;uri=https://api.example.com/mcp;proto=mcp;auth=${auth}`;
        expect(() => parse(txtRecord)).not.toThrow();
      }
    });

    it('should throw error for invalid auth token', () => {
      const txtRecord = 'v=aid1;uri=https://api.example.com/mcp;proto=mcp;auth=invalid';

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow('Invalid auth token: invalid');
    });

    it('should throw error for missing URI', () => {
      const txtRecord = 'v=aid1;proto=mcp';

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow('Missing required field: uri');
    });

    it('should throw error for missing proto field', () => {
      const txtRecord = 'v=aid1;uri=https://api.example.com/mcp';

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow('Missing required field: proto');
    });

    it('should throw error for invalid URI format', () => {
      const txtRecord = 'v=aid1;proto=mcp;uri=http://invalid-uri';

      expect(() => parse(txtRecord)).toThrow(AidError);
      expect(() => parse(txtRecord)).toThrow(
        "Invalid URI scheme for remote protocol 'mcp'. MUST be 'https:'",
      );
    });

    it('should handle UTF-8 characters in description byte counting', () => {
      const unicodeDesc = 'Hello 世界'; // "Hello World" in Chinese - 11 characters but more bytes
      const txtRecord = `v=aid1;uri=https://api.example.com/mcp;proto=mcp;desc=${unicodeDesc}`;

      // Should not throw because it's under 60 bytes
      expect(() => parse(txtRecord)).not.toThrow();

      // But a longer Unicode string should throw
      const longUnicodeDesc = '这是一个非常长的中文描述，它超过了六十个UTF-8字节的限制';
      const longUnicodeRecord = `v=aid1;uri=https://api.example.com/mcp;proto=mcp;desc=${longUnicodeDesc}`;

      expect(() => parse(longUnicodeRecord)).toThrow(AidError);
      expect(() => parse(longUnicodeRecord)).toThrow('Description field must be ≤ 60 UTF-8 bytes');
    });

    it('should parse messy record with whitespace and unknown keys', () => {
      const messy = ' v=aid1 ; uri=https://api.example.com/mcp ; p=mcp ; extra=ignored ';
      const result = parse(messy);
      expect(result).toEqual({ v: 'aid1', uri: 'https://api.example.com/mcp', proto: 'mcp' });
    });

    it('should throw error when duplicate keys are present', () => {
      const dup = 'v=aid1;v=aid1;uri=https://api.example.com/mcp;proto=mcp';
      expect(() => parse(dup)).toThrow(AidError);
      expect(() => parse(dup)).toThrow('Duplicate key: v');
    });
  });

  describe('isValidProto', () => {
    it('should return true for valid protocol tokens', () => {
      expect(isValidProto('mcp')).toBe(true);
      expect(isValidProto('a2a')).toBe(true);
      expect(isValidProto('openapi')).toBe(true);
      expect(isValidProto('local')).toBe(true);
    });

    it('should return false for invalid protocol tokens', () => {
      expect(isValidProto('unknown')).toBe(false);
      expect(isValidProto('')).toBe(false);
      expect(isValidProto('MCP')).toBe(false); // case sensitive
    });
  });

  describe('AidRecordValidator', () => {
    it('should validate a valid record object', () => {
      const record = {
        v: 'aid1',
        uri: 'https://api.example.com/mcp',
        proto: 'mcp',
      };

      const result = AidRecordValidator.validate(record);
      expect(result).toEqual(record);
    });

    it('should parse a TXT record string', () => {
      const txtRecord = 'v=aid1;uri=https://api.example.com/mcp;proto=mcp';
      const result = AidRecordValidator.parse(txtRecord);

      expect(result).toEqual({
        v: 'aid1',
        uri: 'https://api.example.com/mcp',
        proto: 'mcp',
      });
    });
  });
});
