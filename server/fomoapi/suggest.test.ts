import { describe, it, expect } from 'vitest';
import { escapeLike, isValidQuery } from './suggest.js';

describe('escapeLike', () => {
  it('escapes the underscore, which is legal in a handle but a LIKE wildcard', () => {
    // Without this, "zzz_no" would also match "zzzXno".
    expect(escapeLike('zzz_no')).toBe('zzz\\_no');
  });

  it('escapes percent signs', () => {
    expect(escapeLike('50%')).toBe('50\\%');
  });

  it('escapes the escape character first, so it cannot swallow the next one', () => {
    expect(escapeLike('a\\_b')).toBe('a\\\\\\_b');
  });

  it('leaves ordinary handles untouched', () => {
    expect(escapeLike('christianti96')).toBe('christianti96');
    expect(escapeLike('tjr')).toBe('tjr');
    expect(escapeLike('a.b-c')).toBe('a.b-c');
  });
});

describe('isValidQuery', () => {
  it('accepts the characters a FOMO handle can contain', () => {
    expect(isValidQuery('c')).toBe(true);
    expect(isValidQuery('christianti96')).toBe(true);
    expect(isValidQuery('zzz_no_existe')).toBe(true);
    expect(isValidQuery('a.b-c')).toBe(true);
  });

  it('rejects empty, oversized and injection-shaped input', () => {
    expect(isValidQuery('')).toBe(false);
    expect(isValidQuery('a'.repeat(65))).toBe(false);
    expect(isValidQuery("'; drop table fomo_wallet; --")).toBe(false);
    expect(isValidQuery('../../etc/passwd')).toBe(false);
    expect(isValidQuery('has space')).toBe(false);
  });
});
