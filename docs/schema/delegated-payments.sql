-- Proposal, NOT applied. Design: docs/DELEGATED-PAYMENTS.md. Decisions: docs/adr/0001 to 0006.
-- Target: Supabase PostgreSQL 15, Stellar Testnet only.
-- No secret keys and no signed payloads are stored here. API credentials are stored as hashes only.
-- The API writes with the service role. The browser never gets the service role key.

create type payer_kind as enum ('human', 'agent');
create type intent_status as enum (
  'reserved', 'signed', 'submitted', 'settled', 'failed', 'expired', 'cancelled', 'needs_review'
);

-- A person is a human member. The Stellar address is the one Freighter controls.
create table people (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid unique references auth.users (id) on delete set null,
  display_name     text not null check (char_length(display_name) between 1 and 80),
  stellar_address  text unique check (stellar_address ~ '^G[A-Z2-7]{55}$'),
  telegram_user_id bigint unique,
  created_at       timestamptz not null default now()
);

-- An agent identity is sponsored by exactly one person (ADR 0001).
create table agents (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references people (id),
  name               text not null check (char_length(name) between 1 and 80),
  runtime            text not null check (runtime in ('hermes', 'openclaw', 'other')),
  stellar_address    text not null unique check (stellar_address ~ '^G[A-Z2-7]{55}$'),
  shared_demo        boolean not null default false,       -- ADR 0002
  status             text not null default 'pending_link'
                       check (status in ('pending_link', 'active', 'paused', 'revoked')),
  link_challenge     text,                                  -- ADR 0005: what the owner signed
  link_signature     text,
  linked_at          timestamptz,
  max_per_tx         numeric(19,7) not null default 25  check (max_per_tx > 0),
  max_per_day        numeric(19,7) not null default 50,
  max_per_month      numeric(19,7) not null default 200,
  approval_threshold numeric(19,7) not null default 5 check (approval_threshold >= 0),
  created_at         timestamptz not null default now(),
  constraint caps_ordered check (max_per_day >= max_per_tx and max_per_month >= max_per_day),
  constraint approval_within_cap check (approval_threshold <= max_per_tx),
  constraint active_requires_link
    check (status <> 'active' or (linked_at is not null and link_signature is not null and link_challenge is not null))
);
-- One live agent per person and runtime: the target model is one agent per person.
create unique index one_live_agent_per_owner_runtime on agents (owner_id, runtime) where status <> 'revoked';

-- Hash of the agent's API credential. The credential itself is never stored.
create table agent_credentials (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references agents (id),
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Settlement intents apply to human and agent payments alike (ADR 0003).
create table settlement_intents (
  id              uuid primary key default gen_random_uuid(),
  group_id        text not null,
  debtor_id       uuid not null references people (id),
  creditor_id     uuid not null references people (id),
  amount          numeric(19,7) not null check (amount > 0),
  asset           text not null,                            -- USDC identity, validated by the API
  network         text not null check (network = 'testnet'),
  payer_kind      payer_kind not null,
  payer_agent_id  uuid references agents (id),
  payer_address   text not null check (payer_address ~ '^G[A-Z2-7]{55}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 64),
  status          intent_status not null default 'reserved',
  tx_hash         text unique check (tx_hash ~ '^[0-9a-f]{64}$'),
  reserved_at     timestamptz not null default now(),
  expires_at      timestamptz not null,
  signed_at       timestamptz,
  closed_at       timestamptz,
  note            text,
  constraint parties_differ        check (debtor_id <> creditor_id),
  constraint agent_payer_has_agent check ((payer_kind = 'agent') = (payer_agent_id is not null)),
  constraint expiry_after_reserve  check (expires_at > reserved_at),
  constraint hash_when_submitted   check (status not in ('submitted', 'settled') or tx_hash is not null),
  unique (payer_address, idempotency_key)
);

-- THE double payment guard: at most one open intent per debt, whoever pays.
create unique index one_open_intent_per_debt
  on settlement_intents (group_id, debtor_id, creditor_id)
  where status in ('reserved', 'signed', 'submitted');

-- Checks that cannot be expressed as plain constraints, and the state machine.
create function settlement_intents_guard() returns trigger language plpgsql as $$
declare
  debtor_addr text;
  agent_row   agents%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'settlement intents are append-only';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'reserved' then
      raise exception 'a new intent must start as reserved';
    end if;
    if new.payer_kind = 'human' then
      select stellar_address into debtor_addr from people where id = new.debtor_id;
      if debtor_addr is null or debtor_addr <> new.payer_address then
        raise exception 'a human payer must be the debtor''s registered address';
      end if;
    else
      select * into agent_row from agents where id = new.payer_agent_id;
      if not found or agent_row.owner_id <> new.debtor_id then
        raise exception 'an agent may only pay the debts of its owner';
      end if;
      if agent_row.status <> 'active' then
        raise exception 'the agent is not active';
      end if;
      if agent_row.stellar_address <> new.payer_address then
        raise exception 'payer address does not match the agent';
      end if;
      if new.amount > agent_row.max_per_tx then
        raise exception 'amount exceeds the agent per-transaction cap';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: terms are frozen once reserved.
  if (new.group_id, new.debtor_id, new.creditor_id, new.amount, new.asset, new.network,
      new.payer_kind, new.payer_agent_id, new.payer_address, new.idempotency_key, new.reserved_at)
     is distinct from
     (old.group_id, old.debtor_id, old.creditor_id, old.amount, old.asset, old.network,
      old.payer_kind, old.payer_agent_id, old.payer_address, old.idempotency_key, old.reserved_at) then
    raise exception 'intent terms are immutable';
  end if;
  if old.tx_hash is not null and new.tx_hash is distinct from old.tx_hash then
    raise exception 'tx_hash cannot change once set';
  end if;

  if new.status <> old.status then
    if not (
         (old.status = 'reserved'     and new.status in ('signed', 'cancelled', 'expired', 'failed'))
      or (old.status = 'signed'       and new.status in ('submitted', 'expired', 'failed'))
      or (old.status = 'submitted'    and new.status in ('settled', 'failed', 'needs_review'))
      or (old.status = 'needs_review' and new.status in ('settled', 'failed'))
    ) then
      raise exception 'illegal transition % -> %', old.status, new.status;
    end if;
    if new.status = 'signed' and new.signed_at is null then new.signed_at := now(); end if;
    if new.status in ('settled', 'failed', 'expired', 'cancelled') and new.closed_at is null then
      new.closed_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger settlement_intents_guard
  before insert or update or delete on settlement_intents
  for each row execute function settlement_intents_guard();

-- Only reserved intents expire on their own. A signed intent may already have been paid,
-- so it is closed only after the chain has been checked (reconciliation job, not this function).
create function expire_reserved_intents() returns integer language plpgsql as $$
declare n integer;
begin
  update settlement_intents set status = 'expired' where status = 'reserved' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Row level security: the browser may read its own rows; every write goes through the API (service role).
alter table people             enable row level security;
alter table agents             enable row level security;
alter table agent_credentials  enable row level security;
alter table settlement_intents enable row level security;

revoke all on people, agents, agent_credentials, settlement_intents from anon, authenticated;
grant select on people, agents, settlement_intents to authenticated;
grant update (status) on agents to authenticated;   -- an owner may pause or revoke, nothing else

create policy people_select_self on people for select to authenticated
  using (auth_user_id = auth.uid());

create policy agents_select_owner on agents for select to authenticated
  using (owner_id in (select id from people where auth_user_id = auth.uid()));

create policy agents_pause_or_revoke on agents for update to authenticated
  using (owner_id in (select id from people where auth_user_id = auth.uid()))
  with check (status in ('paused', 'revoked')
              and owner_id in (select id from people where auth_user_id = auth.uid()));

create policy intents_select_parties on settlement_intents for select to authenticated
  using (debtor_id   in (select id from people where auth_user_id = auth.uid())
      or creditor_id in (select id from people where auth_user_id = auth.uid()));
-- agent_credentials has no policy: nobody except the service role can read it.
