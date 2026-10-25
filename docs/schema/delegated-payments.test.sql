-- Tests for docs/schema/delegated-payments.sql. Each block raises on failure.
-- Run in a throwaway database that has a stub `auth` schema (see docs/schema/README.md).
\set ON_ERROR_STOP on

create function pg_temp.expect_error(sql text, fragment text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected an error containing "%" but the statement succeeded: %', fragment, sql;
exception when others then
  if sqlerrm like 'expected an error%' then raise; end if;
  if position(fragment in sqlerrm) = 0 then
    raise exception 'wrong error. wanted "%", got "%"', fragment, sqlerrm;
  end if;
end $$;

-- Fixtures: three people and one agent per person pair we need.
insert into people (id, display_name, stellar_address) values
  ('00000000-0000-0000-0000-00000000000a', 'Alice', 'G' || repeat('A', 55)),
  ('00000000-0000-0000-0000-00000000000b', 'Bob',   'G' || repeat('B', 55)),
  ('00000000-0000-0000-0000-00000000000c', 'Carol', 'G' || repeat('C', 55));

insert into agents (id, owner_id, name, runtime, stellar_address, status, linked_at, link_signature, link_challenge)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'alice-agent', 'hermes',
        'G' || repeat('D', 55), 'active', now(), 'sig', 'challenge');

insert into agents (id, owner_id, name, runtime, stellar_address)   -- stays pending_link
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'bob-agent', 'hermes',
        'G' || repeat('E', 55));

-- DP-01: one open intent per debt, even when the payer differs (human vs agent).
insert into settlement_intents (id, group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_address, idempotency_key, expires_at)
values ('10000000-0000-0000-0000-000000000001', '1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
        5, 'USDC', 'testnet', 'human', 'G' || repeat('A', 55), 'key-human-01', now() + interval '10 minutes');

select pg_temp.expect_error($q$
  insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_agent_id, payer_address, idempotency_key, expires_at)
  values ('1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 5, 'USDC', 'testnet', 'agent',
          '00000000-0000-0000-0000-0000000000a1', 'G' || repeat('D', 55), 'key-agent-01', now() + interval '10 minutes')
$q$, 'one_open_intent_per_debt');

-- DP-02: another creditor, or another group, is not blocked.
insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_address, idempotency_key, expires_at)
values ('1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c',
        5, 'USDC', 'testnet', 'human', 'G' || repeat('A', 55), 'key-human-02', now() + interval '10 minutes'),
       ('2', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
        5, 'USDC', 'testnet', 'human', 'G' || repeat('A', 55), 'key-human-03', now() + interval '10 minutes');

-- DP-03: cancelling the first intent frees the debt for the other payer.
update settlement_intents set status = 'cancelled' where id = '10000000-0000-0000-0000-000000000001';
insert into settlement_intents (id, group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_agent_id, payer_address, idempotency_key, expires_at)
values ('10000000-0000-0000-0000-000000000002', '1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
        5, 'USDC', 'testnet', 'agent', '00000000-0000-0000-0000-0000000000a1', 'G' || repeat('D', 55), 'key-agent-02', now() + interval '10 minutes');
do $$ begin
  if (select closed_at from settlement_intents where id = '10000000-0000-0000-0000-000000000001') is null then
    raise exception 'closed_at was not set on cancel';
  end if;
end $$;

-- DP-04: state machine. Illegal jumps and edits of the terms are rejected.
select pg_temp.expect_error($q$ update settlement_intents set status = 'settled' where id = '10000000-0000-0000-0000-000000000002' $q$, 'illegal transition');
select pg_temp.expect_error($q$ update settlement_intents set amount = 1 where id = '10000000-0000-0000-0000-000000000002' $q$, 'immutable');
select pg_temp.expect_error($q$ update settlement_intents set status = 'reserved' where id = '10000000-0000-0000-0000-000000000001' $q$, 'illegal transition');
select pg_temp.expect_error($q$ delete from settlement_intents where id = '10000000-0000-0000-0000-000000000001' $q$, 'append-only');

-- DP-05: a transaction hash can complete at most one intent, and submitted needs a hash.
update settlement_intents set status = 'signed' where id = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect_error($q$ update settlement_intents set status = 'submitted' where id = '10000000-0000-0000-0000-000000000002' $q$, 'hash_when_submitted');
update settlement_intents set status = 'submitted', tx_hash = repeat('a', 64) where id = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect_error($q$
  update settlement_intents set status = 'signed' where id = (select id from settlement_intents where group_id = '2' limit 1);
  update settlement_intents set status = 'submitted', tx_hash = repeat('a', 64) where group_id = '2'
$q$, 'tx_hash');
update settlement_intents set status = 'settled' where id = '10000000-0000-0000-0000-000000000002';

-- DP-06: who may pay. Another person's agent, an inactive agent and a wrong human address are rejected.
select pg_temp.expect_error($q$
  insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_agent_id, payer_address, idempotency_key, expires_at)
  values ('9', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b', 1, 'USDC', 'testnet', 'agent',
          '00000000-0000-0000-0000-0000000000a1', 'G' || repeat('D', 55), 'key-x-01', now() + interval '10 minutes')
$q$, 'only pay the debts of its owner');
select pg_temp.expect_error($q$
  insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_agent_id, payer_address, idempotency_key, expires_at)
  values ('9', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 1, 'USDC', 'testnet', 'agent',
          '00000000-0000-0000-0000-0000000000b1', 'G' || repeat('E', 55), 'key-x-02', now() + interval '10 minutes')
$q$, 'not active');
select pg_temp.expect_error($q$
  insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_address, idempotency_key, expires_at)
  values ('9', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 1, 'USDC', 'testnet', 'human',
          'G' || repeat('B', 55), 'key-x-03', now() + interval '10 minutes')
$q$, 'registered address');

-- DP-07: agent per-transaction cap, testnet only, idempotency key unique per payer.
select pg_temp.expect_error($q$
  insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_agent_id, payer_address, idempotency_key, expires_at)
  values ('8', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 26, 'USDC', 'testnet', 'agent',
          '00000000-0000-0000-0000-0000000000a1', 'G' || repeat('D', 55), 'key-x-04', now() + interval '10 minutes')
$q$, 'per-transaction cap');
select pg_temp.expect_error($q$
  insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_address, idempotency_key, expires_at)
  values ('8', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 1, 'USDC', 'mainnet', 'human',
          'G' || repeat('A', 55), 'key-x-05', now() + interval '10 minutes')
$q$, 'network');
select pg_temp.expect_error($q$
  insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_address, idempotency_key, expires_at)
  values ('7', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 1, 'USDC', 'testnet', 'human',
          'G' || repeat('A', 55), 'key-human-02', now() + interval '10 minutes')
$q$, 'idempotency_key');

-- DP-08: only reserved intents expire on their own.
insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_address, idempotency_key, expires_at, reserved_at)
values ('6', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 1, 'USDC', 'testnet', 'human',
        'G' || repeat('A', 55), 'key-exp-01', now() - interval '1 minute', now() - interval '11 minutes'),
       ('5', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 1, 'USDC', 'testnet', 'human',
        'G' || repeat('A', 55), 'key-exp-02', now() - interval '1 minute', now() - interval '11 minutes');
update settlement_intents set status = 'signed' where group_id = '5';
do $$ declare n int; begin
  n := expire_reserved_intents();
  if n <> 1 then raise exception 'expected 1 expired, got %', n; end if;
  if (select status from settlement_intents where group_id = '5') <> 'signed' then raise exception 'a signed intent must not expire by itself'; end if;
end $$;

-- DP-09: needs_review can be resolved, and a settled intent is final.
update settlement_intents set status = 'submitted', tx_hash = repeat('b', 64) where group_id = '5';
update settlement_intents set status = 'needs_review' where group_id = '5';
update settlement_intents set status = 'settled' where group_id = '5';
select pg_temp.expect_error($q$ update settlement_intents set status = 'failed' where group_id = '5' $q$, 'illegal transition');

-- AG-01 to AG-03: agent rules.
select pg_temp.expect_error($q$ update agents set status = 'active' where id = '00000000-0000-0000-0000-0000000000b1' $q$, 'active_requires_link');
select pg_temp.expect_error($q$
  insert into agents (owner_id, name, runtime, stellar_address) values ('00000000-0000-0000-0000-00000000000a', 'second', 'hermes', 'G' || repeat('F', 55))
$q$, 'one_live_agent_per_owner_runtime');
update agents set status = 'revoked' where id = '00000000-0000-0000-0000-0000000000a1';
insert into agents (owner_id, name, runtime, stellar_address) values ('00000000-0000-0000-0000-00000000000a', 'replacement', 'hermes', 'G' || repeat('F', 55));
select pg_temp.expect_error($q$ insert into agents (owner_id, name, runtime, stellar_address, max_per_tx, max_per_day) values ('00000000-0000-0000-0000-00000000000b', 'x', 'openclaw', 'G' || repeat('G', 55), 30, 10) $q$, 'caps_ordered');
select pg_temp.expect_error($q$ insert into agents (owner_id, name, runtime, stellar_address, approval_threshold) values ('00000000-0000-0000-0000-00000000000b', 'x', 'openclaw', 'G' || repeat('G', 55), 26) $q$, 'approval_within_cap');

-- RLS-01 to RLS-03: a signed-in person sees only their own rows and cannot write.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2');
update people set auth_user_id = '00000000-0000-0000-0000-0000000000f1' where id = '00000000-0000-0000-0000-00000000000c';
update people set auth_user_id = '00000000-0000-0000-0000-0000000000f2' where id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
set app.uid = '00000000-0000-0000-0000-0000000000f1';   -- Carol
do $$ begin
  if (select count(*) from people) <> 1 then raise exception 'Carol should see only herself'; end if;
  if (select count(*) from settlement_intents) <> 1 then raise exception 'Carol should see only the intent where she is the creditor'; end if;
  if (select count(*) from agents) <> 0 then raise exception 'Carol owns no agent'; end if;
end $$;
select pg_temp.expect_error($q$ insert into settlement_intents (group_id, debtor_id, creditor_id, amount, asset, network, payer_kind, payer_address, idempotency_key, expires_at) values ('4','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000b',1,'USDC','testnet','human','G'||repeat('C',55),'key-rls-01', now()+interval '1 minute') $q$, 'permission denied');
select pg_temp.expect_error($q$ select * from agent_credentials $q$, 'permission denied');
set app.uid = '00000000-0000-0000-0000-0000000000f2';   -- Alice owns the revoked and the replacement agent
do $$ begin
  if (select count(*) from agents) <> 2 then raise exception 'Alice should see her two agents'; end if;
end $$;
select pg_temp.expect_error($q$ update agents set max_per_tx = 1000 $q$, 'permission denied');
reset role;

select 'all schema tests passed' as result;
