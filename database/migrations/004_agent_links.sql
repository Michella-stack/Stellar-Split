-- Delegated agent payments (ADR 0005). Run once in the Supabase SQL editor after 003_group_asset.sql. Safe to run again.
--
-- agent_links: an owner (human wallet) authorizes an agent address to pay the owner's debts. The link is created by a
-- SEP-53 signature from the owner, and at most one active link (revoked_at is null) exists per agent.
-- settlement_intents.payer_address: the address that must send the payment when it is not the debtor (an agent paying
-- for its owner). Null means the debtor pays, as before.

create table if not exists agent_links (
  id            uuid primary key default gen_random_uuid(),
  owner_address text not null check (owner_address ~ '^G[A-Z2-7]{55}$'),
  agent_address text not null check (agent_address ~ '^G[A-Z2-7]{55}$' and agent_address <> owner_address),
  linked_at     timestamptz not null default now(),
  revoked_at    timestamptz
);

create unique index if not exists agent_links_one_active_per_agent on agent_links (agent_address) where revoked_at is null;
create index if not exists agent_links_owner on agent_links (owner_address);

alter table agent_links enable row level security;
revoke all on agent_links from anon, authenticated;

alter table settlement_intents
  add column if not exists payer_address text check (payer_address ~ '^G[A-Z2-7]{55}$');
