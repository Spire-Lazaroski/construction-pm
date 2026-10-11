"""Keep the Supabase Data API locked out of the app's tables (SEC-2).

Django talks to Postgres directly as the table owner. Supabase additionally exposes
`public` over REST to its `anon` / `authenticated` roles; those must have no access.
Migration 0011 locked the existing tables; this runs after every `migrate` so tables
added by later migrations get RLS too. Idempotent, and a no-op outside Supabase.
"""
from django.db import connections

LOCK_SQL = """
do $$
declare r record;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    return;
  end if;

  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;

  revoke all on all tables    in schema public from anon, authenticated;
  revoke all on all sequences in schema public from anon, authenticated;
  revoke all on all functions in schema public from anon, authenticated;
end $$;
"""


def lock_public_schema(using="default", **kwargs):
    connection = connections[using]
    if connection.vendor != "postgresql":
        return
    # Plain cursor without params: %I must reach Postgres untouched.
    with connection.cursor() as cursor:
        cursor.execute(LOCK_SQL)
