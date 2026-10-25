-- Settlement intents: fixes 1 and 2 of the #51 review. Run once in the Supabase SQL editor after 001_ledger.sql.
--
-- 1. An old payment cannot settle a new debt. A payment counts only if its transaction carries the
--    intent's MEMO_HASH and its time bounds end no later than the intent's expiry, so it was built
--    after the reservation and cannot reach the chain once the intent has expired.
-- 2. Concurrent settlements cannot overpay. At most one reserved intent per debtor and one per
--    creditor in a group, enforced by unique indexes, so the debt the API checks cannot change
--    under it. Per debt (debtor and creditor together) is not enough: paying two creditors, or two
--    debtors paying one creditor, can still overpay against net balances.
-- Design: ADR 0003 in #50, adapted to these member ids.

create table if not exists settlement_intents (
  id           uuid primary key,
  group_id     uuid not null references groups (id),
  "from"       uuid not null references members (id),
  "to"         uuid not null references members (id),
  amount       text not null check (amount ~ '^[0-9]+(\.[0-9]{1,7})?$'),
  memo_hash    text not null unique check (memo_hash ~ '^[0-9a-f]{64}$'),
  status       text not null default 'reserved'
                 check (status in ('reserved', 'settled', 'cancelled', 'expired', 'needs_review', 'failed')),
  tx_hash      text unique check (tx_hash ~ '^[0-9a-f]{64}$'),
  reserved_at  timestamptz not null,
  expires_at   timestamptz not null,
  closed_at    timestamptz,
  constraint parties_differ check ("from" <> "to"),
  constraint expiry_after_reserve check (expires_at > reserved_at),
  constraint hash_when_paid check (status not in ('settled', 'needs_review') or tx_hash is not null)
);

create unique index if not exists one_open_intent_per_debtor on settlement_intents (group_id, "from") where status = 'reserved';
create unique index if not exists one_open_intent_per_creditor on settlement_intents (group_id, "to") where status = 'reserved';

-- Each settlement comes from exactly one intent.
alter table settlements add column if not exists intent_id uuid unique references settlement_intents (id);

-- Terms are frozen, intents are never deleted, and only these transitions exist. An expired intent can
-- still settle: the network accepted its payment before the time bounds ended, so the money has moved.
-- A cancelled intent whose payment still arrives goes to needs_review, so the payment is never lost.
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
  if (new.group_id, new."from", new."to", new.amount, new.memo_hash, new.reserved_at, new.expires_at)
     is distinct from
     (old.group_id, old."from", old."to", old.amount, old.memo_hash, old.reserved_at, old.expires_at) then
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

drop trigger if exists settlement_intents_guard on settlement_intents;
create trigger settlement_intents_guard
  before insert or update or delete on settlement_intents
  for each row execute function settlement_intents_guard();

-- Records the settlement and closes its intent in one transaction.
create or replace function record_settlement(p_intent_id uuid, p_settlement_id uuid, p_tx_hash text, p_created_at timestamptz)
  returns settlements
  language plpgsql
  set search_path = public
as $$
declare
  i settlement_intents;
  s settlements;
begin
  select * into i from settlement_intents where id = p_intent_id for update;
  if not found then raise exception 'INTENT_NOT_FOUND'; end if;
  if i.status not in ('reserved', 'expired') then raise exception 'INTENT_NOT_OPEN'; end if;
  insert into settlements (id, group_id, "from", "to", amount, tx_hash, created_at, intent_id)
    values (p_settlement_id, i.group_id, i."from", i."to", i.amount, p_tx_hash, p_created_at, i.id)
    returning * into s;
  update settlement_intents set status = 'settled', tx_hash = p_tx_hash where id = i.id;
  return s;
end;
$$;

alter table settlement_intents enable row level security;
revoke all on settlement_intents from anon, authenticated;
revoke execute on function record_settlement(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function record_settlement(uuid, uuid, text, timestamptz) to service_role;
