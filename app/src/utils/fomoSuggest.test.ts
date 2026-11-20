import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFomoSuggestions, avatarColor, avatarInitial } from './fomoSuggest';

afterEach(() => vi.unstubAllGlobals());

const mockJson = (body: unknown, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response)
  );

describe('fetchFomoSuggestions', () => {
  it('returns the cached handles the server offers', async () => {
    mockJson({ items: [{ handle: 'christianti96', evm: '0xabc', solana: null }] });
    const items = await fetchFomoSuggestions('chr');
    expect(items).toHaveLength(1);
    expect(items[0].handle).toBe('christianti96');
  });

  it('does not call the server for an empty query', async () => {
    const fn = vi.fn();
    vi.stubGlobal('fetch', fn);
    expect(await fetchFomoSuggestions('   ')).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('strips a leading @ before querying', async () => {
    const fn = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        ({ ok: true, json: async () => ({ items: [] }) }) as Response
    );
    vi.stubGlobal('fetch', fn);
    await fetchFomoSuggestions('@tjr');
    expect(String(fn.mock.calls[0][0])).toContain('q=tjr');
  });

  it('url-encodes the query', async () => {
    const fn = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        ({ ok: true, json: async () => ({ items: [] }) }) as Response
    );
    vi.stubGlobal('fetch', fn);
    await fetchFomoSuggestions('a.b-c');
    expect(String(fn.mock.calls[0][0])).toContain('q=a.b-c');
  });

  it('degrades to no suggestions when the server errors', async () => {
    mockJson({}, false);
    expect(await fetchFomoSuggestions('chr')).toEqual([]);
  });

  it('tolerates a malformed payload', async () => {
    mockJson({ items: 'nope' });
    expect(await fetchFomoSuggestions('chr')).toEqual([]);
  });
});

describe('avatarColor', () => {
  it('is stable for a handle across calls', () => {
    expect(avatarColor('christianti96')).toBe(avatarColor('christianti96'));
  });

  it('ignores case, so @TJR and @tjr look like one person', () => {
    expect(avatarColor('TJR')).toBe(avatarColor('tjr'));
  });

  it('spreads different handles across the palette', () => {
    const colors = ['christianti96', 'rasmr', 'tjr', 'unipcs'].map(avatarColor);
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  it('always returns a colour from the palette', () => {
    expect(avatarColor('')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('avatarInitial', () => {
  it('uses the first letter, uppercased', () => {
    expect(avatarInitial('christianti96')).toBe('C');
    expect(avatarInitial('tjr')).toBe('T');
  });

  it('skips leading punctuation rather than showing it', () => {
    expect(avatarInitial('_foo')).toBe('F');
    expect(avatarInitial('.bar')).toBe('B');
    expect(avatarInitial('-9lives')).toBe('9');
  });

  it('falls back when there is nothing to show', () => {
    expect(avatarInitial('___')).toBe('?');
    expect(avatarInitial('')).toBe('?');
  });
});
