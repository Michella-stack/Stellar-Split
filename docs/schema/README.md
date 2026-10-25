# Schema proposals

These files are proposals for the delegated payment design (`docs/DELEGATED-PAYMENTS.md`). They are not applied to any database and they are not a migration folder: the team has not promoted `database/migrations/`, which `docs/ARCHITECTURE.md` lists as scaffolding. Move the SQL into the chosen migration location when the API work starts.

| File | Purpose |
|---|---|
| `delegated-payments.sql` | People, agent identities, credential hashes and settlement intents, with the double payment guard, the state machine and row level security. |
| `delegated-payments.test.sql` | Tests that raise on failure. |

## Run the tests

They need a PostgreSQL 15 database and a stub of the Supabase pieces the schema uses. Use a throwaway container:

```sh
docker run -d --name schema-test -e POSTGRES_PASSWORD=test postgres:15-alpine
# wait until `docker exec schema-test pg_isready` succeeds, then:
docker exec -i schema-test psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
SQL
docker exec -i schema-test psql -U postgres -v ON_ERROR_STOP=1 < docs/schema/delegated-payments.sql
docker exec -i schema-test psql -U postgres -v ON_ERROR_STOP=1 < docs/schema/delegated-payments.test.sql
docker rm -f schema-test
```

The last command prints `all schema tests passed`. The tests cover the double payment guard, the state machine, who may pay, the caps, expiry and row level security.

## Race check (manual, not part of the committed tests)

The tests above run in one session. The guard has also been checked with real parallel connections: 30 simultaneous `insert` statements for the same debt, each with a different idempotency key, produced exactly 1 success and 29 failures, all with `one_open_intent_per_debt`. To repeat it, start the same container, load the schema and the fixtures from the test file, then run 30 `docker exec ... psql -c "insert into settlement_intents ..."` commands in the background for one `group_id` and count the exit codes.

## Not covered

Supabase specifics such as the real `auth` schema and default privileges, any API behaviour, and the reconciliation job that decides what happens to a `signed` intent that never reaches the chain.
