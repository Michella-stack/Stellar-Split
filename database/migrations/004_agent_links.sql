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


-- The payer is part of the intent terms: redefine the 002 guard so payer_address is immutable too.
create or replace function settlement_intents_guard() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'settlement intents are never deleted';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'reserved' then raise exception 'a new intent must start as reserved'; end if;
    return new;
  end if;
  if (new.group_id, new."from", new."to", new.amount, new.memo_hash, new.reserved_at, new.expires_at, new.payer_address)
     is distinct from
     (old.group_id, old."from", old."to", old.amount, old.memo_hash, old.reserved_at, old.expires_at, old.payer_address) then
    raise exception 'intent terms are immutable';
  end if;
  if old.tx_hash is not null and new.tx_hash is distinct from old.tx_hash then
    raise exception 'tx_hash cannot change once set';
  end if;
  if new.status <> old.status then
    if not (
         (old.status = 'reserved'     and new.status in ('settled', 'cancelled', 'expired', 'needs_review'))
      or (old.status = 'expired'      and new.status in ('settled', 'needs_review'))
      or (old.status = 'cancelled'    and new.status = 'needs_review')
      or (old.status = 'needs_review' and new.status in ('settled', 'failed'))
    ) then
      raise exception 'illegal transition % -> %', old.status, new.status;
    end if;
    if new.status <> 'reserved' and new.closed_at is null then new.closed_at := now(); end if;
  end if;
  return new;
end;
$$;

