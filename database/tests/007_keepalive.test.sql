-- Tests for migrations/007_keepalive.sql. Same setup as 002_settlement_intents.test.sql, plus:
--   psql -v ON_ERROR_STOP=1 -f database/migrations/007_keepalive.sql
--   psql -v ON_ERROR_STOP=1 -f database/tests/007_keepalive.test.sql
-- Prints "all keepalive tests passed".
do $$
declare before_beats bigint; after_beats bigint;
begin
  select beats into before_beats from keepalive;
  set local role anon;
  perform keepalive();
  if exists (select 1 from keepalive) then raise exception 'anon can read the table directly'; end if;
  reset role;
  select beats into after_beats from keepalive;
  if after_beats <> before_beats + 1 then raise exception 'keepalive() did not write: % -> %', before_beats, after_beats; end if;
  if (select count(*) from keepalive) <> 1 then raise exception 'keepalive must stay a single row'; end if;
end $$;
select 'all keepalive tests passed';
