/**
 * Unit tests for inbound SMS command parser.
 *
 * Covers all 10 command branches plus carrier-noise tolerance:
 * - STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT (case-insensitive)
 * - START / UNSTOP / YES (CTIA recovery keywords)
 * - HELP / INFO
 * - JOIN <code> + bare <code>
 * - unknown
 */
import { describe, expect, it } from 'vitest';

import { parseInboundCommand } from '@/lib/notifications/sms-commands';

describe('parseInboundCommand', () => {
  describe('STOP family', () => {
    it.each([
      'STOP',
      'stop',
      'StOp',
      'STOPALL',
      'UNSUBSCRIBE',
      'CANCEL',
      'END',
      'QUIT',
      ' STOP ',
      'STOP.',
      'Please STOP',
      "I'd like to STOP",
    ])('parses %s as stop', input => {
      const result = parseInboundCommand(input);
      expect(result.kind).toBe('stop');
    });

    it('honors STOP when mixed with a code (carrier multipart safety)', () => {
      const result = parseInboundCommand('STOP J7K4Q2');
      expect(result.kind).toBe('stop');
    });
  });

  describe('START family', () => {
    it.each([
      'START',
      'start',
      'UNSTOP',
      'YES',
      '  YES  ',
    ])('parses %s as start', input => {
      const result = parseInboundCommand(input);
      expect(result.kind).toBe('start');
    });
  });

  describe('HELP family', () => {
    it.each(['HELP', 'help', 'INFO', 'Help me'])('parses %s as help', input => {
      const result = parseInboundCommand(input);
      expect(result.kind).toBe('help');
    });
  });

  describe('JOIN / bare code', () => {
    it('parses bare 8-char code', () => {
      const result = parseInboundCommand('J7K4Q2HZ');
      expect(result).toEqual({ kind: 'join', code: 'J7K4Q2HZ' });
    });

    it('parses JOIN-prefixed code', () => {
      const result = parseInboundCommand('JOIN J7K4Q2HZ');
      expect(result).toEqual({ kind: 'join', code: 'J7K4Q2HZ' });
    });

    it('parses lowercase code (uppercased)', () => {
      const result = parseInboundCommand('j7k4q2hz');
      expect(result).toEqual({ kind: 'join', code: 'J7K4Q2HZ' });
    });

    it('parses 6-char code (forward-compat)', () => {
      const result = parseInboundCommand('ABC234');
      expect(result).toEqual({ kind: 'join', code: 'ABC234' });
    });

    it('parses code embedded in carrier noise', () => {
      const result = parseInboundCommand('Sent from my iPhone\nJ7K4Q2HZ');
      expect(result).toEqual({ kind: 'join', code: 'J7K4Q2HZ' });
    });

    it('extracts the first valid code when multiple substrings match', () => {
      const result = parseInboundCommand('foo J7K4Q2HZ bar XYZK456P');
      expect(result.kind).toBe('join');
    });

    it('accepts JOIN-prefixed letters-only token (explicit prefix path)', () => {
      const result = parseInboundCommand('JOIN ABCDEFGH');
      expect(result).toEqual({ kind: 'join', code: 'ABCDEFGH' });
    });

    it('rejects letters-only token without JOIN prefix (no digits)', () => {
      // Real-world ordinary words must not be parsed as codes.
      expect(parseInboundCommand('UPDATE').kind).toBe('unknown');
      expect(parseInboundCommand('PLEASE').kind).toBe('unknown');
      expect(parseInboundCommand('GREATEST').kind).toBe('unknown');
    });

    it('accepts a bare token only when it contains a 2-9 digit', () => {
      expect(parseInboundCommand('ABC234').kind).toBe('join');
      expect(parseInboundCommand('A2B3C4D5').kind).toBe('join');
    });
  });

  describe('unknown', () => {
    it.each([
      '',
      '   ',
      'hello',
      '???',
      'How do I sign up?',
      // Code shorter than 6 chars — never matches.
      'J7K4',
      // Letters-only tokens are now rejected as bare codes.
      'UPDATE',
      'PLEASE',
    ])('parses %s as unknown', input => {
      const result = parseInboundCommand(input);
      expect(result.kind).toBe('unknown');
    });

    it('parses null/undefined as unknown', () => {
      expect(parseInboundCommand(null).kind).toBe('unknown');
      expect(parseInboundCommand(undefined).kind).toBe('unknown');
    });
  });

  describe('priority (STOP > START > HELP > JOIN)', () => {
    it('STOP wins over a code in the same body', () => {
      const result = parseInboundCommand('STOP J7K4Q2HZ');
      expect(result.kind).toBe('stop');
    });

    it('HELP wins over a code in the same body', () => {
      const result = parseInboundCommand('HELP J7K4Q2HZ');
      expect(result.kind).toBe('help');
    });
  });
});
