-- Settlement asset per group (#98). Run once in the Supabase SQL editor after 002_settlement_intents.sql.
--
-- A group settles in one asset, USDC or EURC, so balances never mix assets and nothing converts between them.
-- The column is nullable and null means USDC, so every existing group keeps working and the API only writes
-- a value for a EURC group. The API refuses EURC unless EURC_ISSUER is set.
--
-- Not applied automatically. Until it is run, creating a EURC group fails at the database; USDC groups are unaffected.

alter table groups
  add column if not exists asset text check (asset in ('USDC', 'EURC'));
