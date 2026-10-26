-- Expenses entered in another currency (ADR 0011). Run once in the Supabase SQL editor after 005_group_archive.sql. Safe to run again.
--
-- The balance of a group stays in the group's asset (USDC or EURC). An expense typed in pesos, for example, is converted once
-- when it is saved, and what was typed and the rate are kept next to it so the history never changes. The three columns are
-- empty for an expense entered in the group's own currency, so every existing row is unchanged. Expenses stay append-only:
-- this only adds columns.
--
-- Not applied automatically. Until it is run, saving an expense in another currency fails at the database; everything else works.

alter table expenses
  add column if not exists original_amount text check (original_amount ~ '^[0-9]+(\.[0-9]{1,7})?$'),
  add column if not exists original_currency text check (original_currency in ('USD', 'EUR', 'MXN', 'COP', 'BRL', 'GBP')),
  add column if not exists rate text check (rate ~ '^[0-9]+(\.[0-9]{1,7})?$');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_original_all_or_none') then
    alter table expenses add constraint expenses_original_all_or_none
      check ((original_amount is null) = (original_currency is null) and (original_currency is null) = (rate is null));
  end if;
end $$;
