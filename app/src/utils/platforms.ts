import { TradeSource } from '../types/tradeTypes';

export type Platform = 'jupiter' | 'pacifica' | 'hyperliquid';
export type Chain = 'solana' | 'evm';

export const ALL_PLATFORMS: Platform[] = ['jupiter', 'pacifica', 'hyperliquid'];

export const PLATFORM_LABEL: Record<Platform, TradeSource> = {
  jupiter: 'Jupiter',
  pacifica: 'Pacifica',
  hyperliquid: 'Hyperliquid',
};

export const PLATFORM_CHAIN: Record<Platform, Chain> = {
  jupiter: 'solana',
  pacifica: 'solana',
  hyperliquid: 'evm',
};

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export const chainOfAddress = (address: string): Chain | null => {
  const a = address.trim();
  if (EVM_ADDRESS_REGEX.test(a)) return 'evm';
  if (SOLANA_ADDRESS_REGEX.test(a)) return 'solana';
  return null;
};

export const isValidWalletAddress = (address: string): boolean => chainOfAddress(address) !== null;

export const isPlatform = (x: string): x is Platform => (ALL_PLATFORMS as string[]).includes(x);

/** Parse the `platforms` URL param, falling back to every platform when empty or invalid. */
export const parsePlatformsParam = (param: string | null): Platform[] => {
  const valid = (param ?? '').split(',').filter(isPlatform);
  return valid.length ? valid : [...ALL_PLATFORMS];
};

/**
 * The platforms to actually query for an address: the selected ones that live on
 * the address's chain. A Solana address can't have Hyperliquid trades and vice
 * versa, so when none of the selection fits the chain, every platform on that
 * chain is used instead of failing.
 */
export const resolvePlatformsForAddress = (selected: Platform[], address: string): Platform[] => {
  const chain = chainOfAddress(address);
  if (!chain) return selected;
  const compatible = selected.filter((p) => PLATFORM_CHAIN[p] === chain);
  return compatible.length ? compatible : ALL_PLATFORMS.filter((p) => PLATFORM_CHAIN[p] === chain);
};

/**
 * A FOMO user has both an EVM and a Solana wallet. Pick the one the selected
 * platforms can query, preferring EVM (FOMO perps settle on Hyperliquid).
 */
export const pickAddressForPlatforms = (
  addresses: { evm: string | null; solana: string | null },
  selected: Platform[]
): string | null => {
  const wants = (chain: Chain) => selected.some((p) => PLATFORM_CHAIN[p] === chain);
  if (wants('evm') && addresses.evm) return addresses.evm;
  if (wants('solana') && addresses.solana) return addresses.solana;
  return addresses.evm ?? addresses.solana;
};
