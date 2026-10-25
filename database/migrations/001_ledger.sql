-- Stellar-Split off-chain ledger (Supabase PostgreSQL). Run once in the Supabase SQL editor.
-- The API connects with the service role key. RLS is on with no policies, so the anon key reads nothing.
-- Amounts are decimal strings with up to 7 decimals, checked by the API with BigInt stroops.

create table if not exists users (
  address        text primary key check (address ~ '^G[A-Z2-7]{55}$'),
  display_name   text,
  home_currency  text not null default 'USD' check (home_currency ~ '^[A-Z]{3}$'),
  email          text
);

create table if not exists groups (
  id          uuid primary key,
  name        text not null check (length(name) between 1 and 80),
  type        text not null check (type in ('flat', 'trip', 'other')),
  created_by  text not null,
  created_at  timestamptz not null
);

create table if not exists members (
  id             uuid primary key,
  group_id       uuid not null references groups (id),
  kind           text not null check (kind in ('human', 'agent')),
  display_name   text not null,
  address        text not null check (address ~ '^G[A-Z2-7]{55}$'),
  home_currency  text not null default 'USD',
  created_at     timestamptz not null,
  unique (group_id, address)
);
create index if not exists members_address on members (address);

create table if not exists invites (
  code        text primary key,
  group_id    uuid not null references groups (id),
  address     text,
  created_by  text not null,
  created_at  timestamptz not null
);

-- Append-only: the API never updates or deletes expenses or settlements.
create table if not exists expenses (
  id               uuid primary key,
  group_id         uuid not null references groups (id),
  description      text not null check (length(description) between 1 and 200),
  amount           text not null check (amount ~ '^[0-9]+(\.[0-9]{1,7})?$'),
  paid_by          uuid not null references members (id),
  split            jsonb not null,
  shares           jsonb not null,
  source           text not null check (source in ('manual', 'scan', 'agent')),
  created_by       uuid not null references members (id),
  created_at       timestamptz not null,
  idempotency_key  text,
  unique (group_id, idempotency_key)
);
create index if not exists expenses_group on expenses (group_id, created_at);

create table if not exists settlements (
  id          uuid primary key,
  group_id    uuid not null references groups (id),
  "from"      uuid not null references members (id),
  "to"        uuid not null references members (id),
  amount      text not null check (amount ~ '^[0-9]+(\.[0-9]{1,7})?$'),
  tx_hash     text not null unique check (tx_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null
);
create index if not exists settlements_group on settlements (group_id, created_at);

-- Burned sign-in challenges (single use). Rows past expires_at can be deleted at any time.
create table if not exists used_nonces (
  nonce       text primary key,
  expires_at  timestamptz not null
);

alter table used_nonces enable row level security;
alter table users enable row level security;
alter table groups enable row level security;
alter table members enable row level security;
alter table invites enable row level security;
alter table expenses enable row level security;
alter table settlements enable row level security;

revoke update, delete on expenses, settlements from anon, authenticated;
