import { describe, expect, it } from 'vitest';
import {
  chainOfAddress,
  parsePlatformsParam,
  pickAddressForPlatforms,
  resolvePlatformsForAddress,
} from './platforms';

const SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const EVM = '0x' + 'aB'.repeat(20);

describe('chainOfAddress', () => {
  it('detects EVM and Solana addresses', () => {
    expect(chainOfAddress(EVM)).toBe('evm');
    expect(chainOfAddress(` ${SOL} `)).toBe('solana');
    expect(chainOfAddress('0x123')).toBeNull();
    expect(chainOfAddress('')).toBeNull();
  });
});

describe('parsePlatformsParam', () => {
  it('keeps known platforms and falls back to all', () => {
    expect(parsePlatformsParam('hyperliquid,bogus')).toEqual(['hyperliquid']);
    expect(parsePlatformsParam('bogus')).toEqual(['jupiter', 'pacifica', 'hyperliquid']);
    expect(parsePlatformsParam(null)).toEqual(['jupiter', 'pacifica', 'hyperliquid']);
  });
});

describe('resolvePlatformsForAddress', () => {
  it('drops platforms on the wrong chain', () => {
    expect(resolvePlatformsForAddress(['jupiter', 'hyperliquid'], EVM)).toEqual(['hyperliquid']);
    expect(resolvePlatformsForAddress(['jupiter', 'hyperliquid'], SOL)).toEqual(['jupiter']);
  });

  it('falls back to every platform on the chain when the selection has none', () => {
    expect(resolvePlatformsForAddress(['jupiter'], EVM)).toEqual(['hyperliquid']);
    expect(resolvePlatformsForAddress(['hyperliquid'], SOL)).toEqual(['jupiter', 'pacifica']);
  });
});

describe('pickAddressForPlatforms', () => {
  const both = { evm: EVM, solana: SOL };

  it('prefers EVM when Hyperliquid is selected, else Solana', () => {
    expect(pickAddressForPlatforms(both, ['jupiter', 'hyperliquid'])).toBe(EVM);
    expect(pickAddressForPlatforms(both, ['jupiter', 'pacifica'])).toBe(SOL);
  });

  it('falls back to whichever address exists', () => {
    expect(pickAddressForPlatforms({ evm: null, solana: SOL }, ['hyperliquid'])).toBe(SOL);
    expect(pickAddressForPlatforms({ evm: null, solana: null }, ['hyperliquid'])).toBeNull();
  });
});
