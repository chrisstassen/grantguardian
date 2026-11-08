# Database

The full GrantGuardian database is defined by the files in `supabase/migrations/`,
applied in filename order. Running them on an empty Supabase project rebuilds
everything: tables, security policies, helper functions and storage buckets.

| File | What it creates |
|---|---|
| `..._core_schema.sql` | All 30 tables, keys, indexes, `updated_at` triggers; turns on row-level security |
| `..._functions.sql` | Access helpers used by policies, guard triggers, email sync, RPCs |
| `..._rls_policies.sql` | Who can read and write each table |
| `..._storage.sql` | The six private storage buckets and file-access rules |
| `..._lock_down_anon_and_graphql.sql` | Removes all signed-out table access (except joining the waitlist) and turns off GraphQL |

## Rules for changes

- Every schema change goes in a **new** migration file here
  (`YYYYMMDDHHMMSS_description.sql`). Do not edit tables by hand in the SQL editor.
- Every new table needs `enable row level security` and policies in the same file.
- Signed-out visitors (`anon`) get no access to new tables or functions unless a
  migration grants it explicitly.
- Server routes that use `supabaseAdmin` bypass all policies; they must call
  `requireUser` / `requireSystemAdmin` from `lib/api-auth.ts` first.
- Browser calls to `/api/*` routes use `authFetch` from `lib/auth-fetch.ts`.

## Roles

- **admin**: everything in their organization, manages members and invitations
- **staff**: creates and edits grant data
- **viewer**: read only
- **system admin** (`user_profiles.is_system_admin`): GrantGuardian support staff.
  Can only be granted by accepting a system-admin invitation, or from the SQL editor.

## Making the first system admin

After a fresh rebuild, sign up normally, then run in the SQL editor:

```sql
insert into public.user_profiles (id, email, first_name, last_name, is_system_admin)
select id, email, raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name', true
from auth.users where email = 'you@example.com'
on conflict (id) do update set is_system_admin = true;
```

## Backups

The free Supabase plan has no backups. That is how the original database was
lost in 2026 after the project was paused. Either upgrade to a paid plan
before real customer data goes in, or export regularly.

`docs/archive-sql/` holds the hand-written SQL from before the rebuild,
for reference only. Do not run it.
