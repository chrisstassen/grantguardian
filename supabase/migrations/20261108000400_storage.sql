-- =============================================================================
-- GrantGuardian — storage buckets and file access
--
-- All buckets are private. Files are read back by download() or signed URLs.
--
-- Browser-uploaded buckets (need policies):
--   award-letters        path "<organization_id>/<file>" (add grant) or "<grant_id>/<file>" (edit grant)
--   expense-documents    path "<expense_id>_<timestamp>_<file>"
--   support-attachments  path "<ticket_id>/<file>"
-- Server-only buckets (service role, no browser policies on purpose):
--   grant-documents, grant-request-attachments, organization-logos
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('award-letters',             'award-letters',             false, 52428800),
  ('expense-documents',         'expense-documents',         false, 52428800),
  ('support-attachments',       'support-attachments',       false, 52428800),
  ('grant-documents',           'grant-documents',           false, 52428800),
  ('grant-request-attachments', 'grant-request-attachments', false, 52428800),
  ('organization-logos',        'organization-logos',        false, 5242880)
on conflict (id) do nothing;

-- Path checks. They compare text, so a malformed path simply fails the check
-- instead of raising a uuid cast error.
create or replace function public.storage_award_letter_access(p_name text, p_write boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  with folder as (select split_part(p_name, '/', 1) as f)
  select exists (
      select 1 from public.user_organization_memberships m, folder
      where m.user_id = auth.uid() and m.organization_id::text = folder.f
        and (not p_write or m.role in ('admin', 'staff')))
    or exists (
      select 1 from public.grants g
      join public.user_organization_memberships m on m.organization_id = g.organization_id, folder
      where g.id::text = folder.f and m.user_id = auth.uid()
        and (not p_write or m.role in ('admin', 'staff')))
$$;

create or replace function public.storage_expense_document_access(p_name text, p_write boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.expenses e
    join public.grants g on g.id = e.grant_id
    join public.user_organization_memberships m on m.organization_id = g.organization_id
    where e.id::text = split_part(p_name, '_', 1) and m.user_id = auth.uid()
      and (not p_write or m.role in ('admin', 'staff')))
$$;

create or replace function public.storage_support_attachment_access(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.support_tickets t
    where t.id::text = split_part(p_name, '/', 1) and public.can_view_ticket(t.id))
$$;

revoke all on function
  public.storage_award_letter_access(text, boolean),
  public.storage_expense_document_access(text, boolean),
  public.storage_support_attachment_access(text)
from public, anon;
grant execute on function
  public.storage_award_letter_access(text, boolean),
  public.storage_expense_document_access(text, boolean),
  public.storage_support_attachment_access(text)
to authenticated;

-- award-letters
create policy "award letters: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'award-letters' and public.storage_award_letter_access(name, false));
create policy "award letters: staff upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'award-letters' and public.storage_award_letter_access(name, true));
create policy "award letters: staff replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'award-letters' and public.storage_award_letter_access(name, true));
create policy "award letters: staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'award-letters' and public.storage_award_letter_access(name, true));

-- expense-documents
create policy "expense docs: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'expense-documents' and public.storage_expense_document_access(name, false));
create policy "expense docs: staff upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expense-documents' and public.storage_expense_document_access(name, true));
create policy "expense docs: staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'expense-documents' and public.storage_expense_document_access(name, true));

-- support-attachments
create policy "support files: ticket viewers read" on storage.objects
  for select to authenticated
  using (bucket_id = 'support-attachments' and public.storage_support_attachment_access(name));
create policy "support files: ticket viewers upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'support-attachments' and public.storage_support_attachment_access(name));
