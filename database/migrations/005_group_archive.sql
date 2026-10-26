-- Archiving groups. Run once in the Supabase SQL editor after 004_agent_links.sql. Safe to run again.
-- A group with expenses or payments cannot be deleted (they are append-only), so "delete group" sets archived_at instead.
-- The API hides archived groups from everyone; the rows stay as the record of what was paid.
alter table groups add column if not exists archived_at timestamptz;
