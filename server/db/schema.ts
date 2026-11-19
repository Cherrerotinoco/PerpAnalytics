/**
 * Cache schema, applied on boot (idempotent).
 *
 * Deliberately tiny. The only thing worth persisting is the handle → wallet
 * mapping, because that is the one piece of data that costs money to obtain
 * (2,500 fomoapi credits) and never changes. Trades are not cached at all:
 * Hyperliquid serves them free and unmetered, so caching them would only add
 * staleness.
 *
 * Rows are written solely in response to a browser request for that handle —
 * there is no seeding job and no speculative backfill.
 */

export const SCHEMA_SQL = `
create table if not exists fomo_wallet (
  handle_lower    text primary key,
  handle          text not null,
  user_id         text,
  solana_address  text,
  evm_address     text,
  verified_solana boolean,
  verified_evm    boolean,
  -- A miss is cached too, briefly, so a typo cannot be replayed for credits.
  found           boolean not null default true,
  resolved_at     timestamptz not null default now()
);

-- Spend log. fomoapi does not report what a call cost, so credits are our own
-- figures from the published price list; reconcile against the usage dashboard.
create table if not exists fomoapi_credit_ledger (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  operation   text not null,
  credits     integer not null,
  http_status integer,
  handle      text,
  -- Salted hash of the caller's address, never the address itself: the daily
  -- quota only needs to recognise a repeat caller, not identify anyone.
  client_hash text
);

create index if not exists fomoapi_credit_ledger_ts_idx on fomoapi_credit_ledger (ts desc);
`;

/**
 * Columns added after the first deploy, plus any index that depends on them.
 *
 * Kept separate and run *after* SCHEMA_SQL because `create table if not exists`
 * is a no-op on a table that already exists — missing column and all — so an
 * index over a new column has to wait until the `alter table` has added it.
 * Ordering matters here: tables, then columns, then indexes.
 */
export const MIGRATIONS_SQL = `
alter table fomoapi_credit_ledger add column if not exists client_hash text;

create index if not exists fomoapi_credit_ledger_client_idx
  on fomoapi_credit_ledger (client_hash, ts desc);
`;
