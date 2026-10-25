-- Tests for migrations/002_settlement_intents.sql. Each block raises on failure; the last line prints
-- "all settlement intent tests passed". Run in a throwaway PostgreSQL 15, never the shared project:
--   create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
--   alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
--   alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
--   psql -v ON_ERROR_STOP=1 -f database/migrations/001_ledger.sql
--   psql -v ON_ERROR_STOP=1 -f database/migrations/002_settlement_intents.sql
--   psql -v ON_ERROR_STOP=1 -f database/tests/002_settlement_intents.test.sql

-- Asserts that a statement is refused with a message matching the pattern.
create function pg_temp.refused(stmt text, pattern text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected refusal (%) but it succeeded: %', pattern, stmt;
exception when others then
  if sqlerrm like 'expected refusal%' then raise; end if;
  if sqlerrm !~* pattern then raise exception 'refused for the wrong reason. Expected %, got: %', pattern, sqlerrm; end if;
end $$;

do $$
declare
  g uuid := gen_random_uuid();
  a uuid := gen_random_uuid();  -- owed
  b uuid := gen_random_uuid();  -- owed
  c uuid := gen_random_uuid();  -- owes
  d uuid := gen_random_uuid();  -- owes
  i1 uuid := gen_random_uuid();
  i2 uuid := gen_random_uuid();
  i3 uuid := gen_random_uuid();
  s1 settlements;
  ins text := 'insert into settlement_intents (id, group_id, "from", "to", amount, memo_hash, reserved_at, expires_at) '
              'values (%L, %L, %L, %L, %L, %L, now(), now() + interval ''10 minutes'')';
begin
  insert into groups (id, name, type, created_by, created_at) values (g, 'Piso', 'flat', 'GAZ2D6UYGDFFORAS3PXOEIZQLVS7ME6VYRANQJNLEELMYIAOUB4PY7NY', now());
  insert into members (id, group_id, kind, display_name, address, created_at) values
    (a, g, 'human', 'A', 'GAZ2D6UYGDFFORAS3PXOEIZQLVS7ME6VYRANQJNLEELMYIAOUB4PY7NY', now()),
    (b, g, 'human', 'B', 'GCCEP6MCOGHOWGFHMHGB3LAJVTB7ZFDPGYBUI6BFCOUH3NPVM7RZNZZX', now()),
    (c, g, 'human', 'C', 'GDNTRR7T5BS22ULN2YHYIRPLYJWZ7EIPWG5BWBWN2TC52UVYGONEXXLC', now()),
    (d, g, 'human', 'D', 'GBFZL2P7L6CIMJBZKA7JKXRBFPQI7H6QXMMHXV5VXH33PBMKYCLZ6B4E', now());

  -- One reserved intent per debtor and per creditor.
  execute format(ins, i1, g, d, a, '10.00', repeat('1', 64));
  perform pg_temp.refused(format(ins, gen_random_uuid(), g, d, b, '10.00', repeat('2', 64)), 'one_open_intent_per_debtor');
  perform pg_temp.refused(format(ins, gen_random_uuid(), g, c, a, '10.00', repeat('3', 64)), 'one_open_intent_per_creditor');
  execute format(ins, i2, g, c, b, '10.00', repeat('4', 64));

  -- Shape of an intent.
  perform pg_temp.refused(format(ins, gen_random_uuid(), g, a, a, '1', repeat('5', 64)), 'parties_differ');
  perform pg_temp.refused(format(ins, gen_random_uuid(), g, a, b, '1.12345678', repeat('6', 64)), 'amount_check');
  perform pg_temp.refused(format(ins, gen_random_uuid(), g, a, b, '1', 'not-a-hash'), 'memo_hash_check');

  -- Frozen terms, no deletes, legal transitions only.
  perform pg_temp.refused(format('update settlement_intents set amount = %L where id = %L', '1.00', i1), 'immutable');
  perform pg_temp.refused(format('delete from settlement_intents where id = %L', i1), 'never deleted');
  perform pg_temp.refused(format('update settlement_intents set status = %L where id = %L', 'failed', i1), 'illegal transition');
  perform pg_temp.refused(format('update settlement_intents set status = %L where id = %L', 'settled', i1), 'hash_when_paid');

  -- record_settlement writes the settlement and closes the intent together.
  s1 := record_settlement(i1, gen_random_uuid(), repeat('a', 64), now());
  if s1.intent_id <> i1 or s1."from" <> d or s1.amount <> '10.00' then raise exception 'settlement row is wrong'; end if;
  if (select status <> 'settled' or tx_hash <> repeat('a', 64) or closed_at is null from settlement_intents where id = i1) then
    raise exception 'intent was not closed as settled';
  end if;
  perform pg_temp.refused(format('select record_settlement(%L, gen_random_uuid(), %L, now())', i1, repeat('b', 64)), 'INTENT_NOT_OPEN');
  perform pg_temp.refused(format('select record_settlement(%L, gen_random_uuid(), %L, now())', i2, repeat('a', 64)), 'settlements_tx_hash_key');
  if (select status from settlement_intents where id = i2) <> 'reserved' then raise exception 'a failed record changed the intent'; end if;

  -- Settling freed the debtor and the creditor.
  execute format(ins, i3, g, d, a, '1.00', repeat('7', 64));

  -- An expired intent can still settle; a cancelled one only goes to review.
  update settlement_intents set status = 'expired' where id = i2;
  perform record_settlement(i2, gen_random_uuid(), repeat('c', 64), now());
  update settlement_intents set status = 'cancelled' where id = i3;
  perform pg_temp.refused(format('select record_settlement(%L, gen_random_uuid(), %L, now())', i3, repeat('d', 64)), 'INTENT_NOT_OPEN');
  update settlement_intents set status = 'needs_review', tx_hash = repeat('d', 64) where id = i3;
  perform pg_temp.refused(format('update settlement_intents set status = %L where id = %L', 'reserved', i3), 'illegal transition');
end $$;

-- The browser roles get nothing.
do $$
begin
  if has_table_privilege('anon', 'settlement_intents', 'select') or has_table_privilege('authenticated', 'settlement_intents', 'insert') then
    raise exception 'browser role can access settlement_intents';
  end if;
  if not (select relrowsecurity from pg_class where relname = 'settlement_intents') then raise exception 'RLS is off'; end if;
  if has_function_privilege('anon', 'record_settlement(uuid, uuid, text, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'record_settlement(uuid, uuid, text, timestamptz)', 'execute') then
    raise exception 'browser role can call record_settlement';
  end if;
  if not has_function_privilege('service_role', 'record_settlement(uuid, uuid, text, timestamptz)', 'execute') then
    raise exception 'the API role cannot call record_settlement';
  end if;
end $$;

select 'all settlement intent tests passed' as result;
