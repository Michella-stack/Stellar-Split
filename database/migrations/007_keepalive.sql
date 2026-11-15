-- Keep-alive heartbeat. Run once in the Supabase SQL editor after 006_expense_original_currency.sql. Safe to run again.
--
-- The free tier pauses a project that has not seen "sufficient activity" for 7 days, and a read that row-level security
-- leaves empty did not count. The scheduled workflow .github/workflows/supabase-keepalive.yml calls keepalive() every day,
-- which writes one row. The table has no policies, so only this function (security definer) can touch it, and it touches nothing else.
create table if not exists keepalive (
  id boolean primary key default true check (id),
  beats bigint not null default 0,
  last_beat timestamptz not null default now()
);
alter table keepalive enable row level security;
insert into keepalive (id) values (true) on conflict do nothing;

create or replace function keepalive() returns timestamptz
language sql security definer set search_path = public as $$
  update keepalive set beats = beats + 1, last_beat = now() where id returning last_beat;
$$;
revoke all on function keepalive() from public, anon, authenticated;
grant execute on function keepalive() to anon;
