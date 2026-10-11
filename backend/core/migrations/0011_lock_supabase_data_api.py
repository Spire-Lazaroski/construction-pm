"""Close the Supabase Data API (PostgREST) path to the app's tables.

Supabase grants its public `anon` and `authenticated` roles full access to tables in
`public`, and exposes them over REST with the (public) anon key. Django connects as
the table owner and never uses that API, so: enable RLS on every table, revoke those
grants, and stop them being granted again for tables created later.

Runs only on Postgres databases that have the Supabase roles; a no-op on SQLite and
on plain local Postgres. Safe to run more than once.
"""
from django.db import migrations

LOCK_SQL = """
do $$
declare r record;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    return;
  end if;

  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;

  revoke all on all tables    in schema public from anon, authenticated;
  revoke all on all sequences in schema public from anon, authenticated;
  revoke all on all functions in schema public from anon, authenticated;

  execute format('alter default privileges for role %I in schema public '
                 'revoke all on tables from anon, authenticated', current_user);
  execute format('alter default privileges for role %I in schema public '
                 'revoke all on sequences from anon, authenticated', current_user);
  execute format('alter default privileges for role %I in schema public '
                 'revoke all on functions from anon, authenticated', current_user);
end $$;
"""


def lock(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(LOCK_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0010_document_private_keys"),
    ]

    # No reverse: re-opening the tables to the public API is never wanted.
    operations = [
        migrations.RunPython(lock, migrations.RunPython.noop),
    ]
