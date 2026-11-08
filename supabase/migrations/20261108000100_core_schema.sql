-- =============================================================================
-- GrantGuardian — core schema (rebuild, Nov 2026)
--
-- Recreates every table the app uses after the Aug 2026 database loss.
-- Columns are reconstructed from the application code; tables that previously
-- had their own migration files (now in docs/archive-sql) are folded in here
-- with all of their later ALTERs applied.
--
-- Run order: this file, then _functions, _rls, _storage.
-- Security (RLS) is enabled on every table at the end of this file, so no table
-- is ever exposed without policies, even between migrations.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Shared trigger: keep updated_at current on every UPDATE
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Organizations, people, membership
-- -----------------------------------------------------------------------------

create table public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text not null unique
               default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8)),
  plan         text not null default 'starter' check (plan in ('starter', 'pro')),
  logo_path    text,
  logo_name    text,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.user_profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  first_name       text,
  last_name        text,
  email            text,
  is_system_admin  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index user_profiles_email_idx on public.user_profiles (lower(email));

create table public.user_organization_memberships (
  id               uuid primary key default gen_random_uuid(),
  -- references user_profiles so PostgREST can embed user_profiles(...) from memberships
  user_id          uuid not null references public.user_profiles(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role             text not null default 'staff' check (role in ('admin', 'staff', 'viewer')),
  is_primary       boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (user_id, organization_id)
);
create index uom_org_idx on public.user_organization_memberships (organization_id);

create table public.team_invitations (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  invited_email        text not null,
  role                 text not null default 'staff' check (role in ('admin', 'staff', 'viewer')),
  token                text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by_user_id   uuid references auth.users(id) on delete set null,
  status               text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at           timestamptz not null default (now() + interval '7 days'),
  accepted_at          timestamptz,
  accepted_by_user_id  uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index team_invitations_org_idx on public.team_invitations (organization_id);
create index team_invitations_email_idx on public.team_invitations (lower(invited_email));

create table public.system_admin_invitations (
  id                   uuid primary key default gen_random_uuid(),
  invited_email        text not null,
  token                text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  invited_by_user_id   uuid references auth.users(id) on delete set null,
  status               text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at           timestamptz not null default (now() + interval '7 days'),
  accepted_at          timestamptz,
  accepted_by_user_id  uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index system_admin_invitations_email_idx on public.system_admin_invitations (lower(invited_email));

-- -----------------------------------------------------------------------------
-- Grants and everything hanging off a grant
-- -----------------------------------------------------------------------------

create table public.grants (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  grant_name          text not null,
  funding_agency      text,
  program_type        text,
  award_number        text,
  award_amount        numeric,
  total_project_cost  numeric,
  period_start        date,
  period_end          date,
  status              text not null default 'pending',
  percent_complete    integer not null default 0
                      constraint grants_percent_complete_range check (percent_complete between 0 and 100),
  scope_of_work       text,
  award_letter_url    text,   -- path inside the award-letters bucket
  award_letter_name   text,
  created_by_user_id  uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index grants_org_idx on public.grants (organization_id);

create table public.expenses (
  id                  uuid primary key default gen_random_uuid(),
  grant_id            uuid not null references public.grants(id) on delete cascade,
  expense_date        date,
  vendor              text,
  description         text,
  amount              numeric not null default 0,
  category            text,
  invoice_number      text,
  created_by_user_id  uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index expenses_grant_idx on public.expenses (grant_id);

create table public.expense_documents (
  id                   uuid primary key default gen_random_uuid(),
  expense_id           uuid not null references public.expenses(id) on delete cascade,
  file_name            text not null,
  file_path            text not null,   -- path inside the expense-documents bucket
  file_type            text,
  file_size            bigint,
  uploaded_by_user_id  uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index expense_documents_expense_idx on public.expense_documents (expense_id);

create table public.budget_line_items (
  id               uuid primary key default gen_random_uuid(),
  grant_id         uuid not null references public.grants(id) on delete cascade,
  category         text not null,
  description      text,
  budgeted_amount  numeric not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index budget_line_items_grant_idx on public.budget_line_items (grant_id);

create table public.expense_budget_allocations (
  id                   uuid primary key default gen_random_uuid(),
  expense_id           uuid not null references public.expenses(id) on delete cascade,
  budget_line_item_id  uuid not null references public.budget_line_items(id) on delete cascade,
  allocated_amount     numeric not null default 0,
  created_at           timestamptz not null default now()
);
create index eba_expense_idx on public.expense_budget_allocations (expense_id);
create index eba_line_item_idx on public.expense_budget_allocations (budget_line_item_id);

create table public.compliance_requirements (
  id                    uuid primary key default gen_random_uuid(),
  grant_id              uuid not null references public.grants(id) on delete cascade,
  title                 text not null,
  description           text,
  due_date              date,
  priority              text not null default 'medium',
  status                text not null default 'open',
  policy_source         text,
  policy_citation       text,
  policy_url            text,
  completed_at          timestamptz,
  completed_by_user_id  uuid references auth.users(id) on delete set null,
  created_by_user_id    uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index compliance_requirements_grant_idx on public.compliance_requirements (grant_id);

create table public.special_conditions (
  id                uuid primary key default gen_random_uuid(),
  grant_id          uuid not null references public.grants(id) on delete cascade,
  title             text not null,
  description       text,
  risk_level        text not null default 'medium',
  applies_to        text,
  restriction_type  text,
  ai_generated      boolean not null default false,
  created_at        timestamptz not null default now()
);
create index special_conditions_grant_idx on public.special_conditions (grant_id);

create table public.payments_received (
  id                  uuid primary key default gen_random_uuid(),
  grant_id            uuid not null references public.grants(id) on delete cascade,
  received_date       date,
  amount              numeric not null default 0,
  funding_source      text,
  reference_number    text,
  description         text,
  notes               text,
  created_by_user_id  uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index payments_received_grant_idx on public.payments_received (grant_id);

create table public.grant_notes (
  id                  uuid primary key default gen_random_uuid(),
  grant_id            uuid not null references public.grants(id) on delete cascade,
  created_by_user_id  uuid references public.user_profiles(id) on delete set null,
  content             text not null check (char_length(content) > 0),
  is_edited           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index grant_notes_grant_idx on public.grant_notes (grant_id);

create table public.grant_note_replies (
  id                  uuid primary key default gen_random_uuid(),
  note_id             uuid not null references public.grant_notes(id) on delete cascade,
  created_by_user_id  uuid references public.user_profiles(id) on delete set null,
  content             text not null check (char_length(content) > 0),
  is_edited           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index grant_note_replies_note_idx on public.grant_note_replies (note_id);

create table public.note_recipients (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.grant_notes(id) on delete cascade,
  -- constraint name is referenced by the app: user_profiles!note_recipients_user_id_fkey
  user_id     uuid not null constraint note_recipients_user_id_fkey
              references public.user_profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (note_id, user_id)
);

create table public.grant_deliverables (
  id                uuid primary key default gen_random_uuid(),
  grant_id          uuid not null references public.grants(id) on delete cascade,
  title             text not null,
  description       text,
  unit              text,
  target_value      numeric,
  actual_value      numeric not null default 0,
  progress_percent  integer not null default 0
                    constraint deliverables_progress_percent_range check (progress_percent between 0 and 100),
  status            text not null default 'not_started',
  due_date          date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index grant_deliverables_grant_idx on public.grant_deliverables (grant_id);

create table public.grant_funding_sources (
  id           uuid primary key default gen_random_uuid(),
  grant_id     uuid not null references public.grants(id) on delete cascade,
  source_name  text not null,
  source_type  text not null default 'other',
  amount       numeric not null default 0,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index grant_funding_sources_grant_idx on public.grant_funding_sources (grant_id);

create table public.grant_closeout_items (
  id                   uuid primary key default gen_random_uuid(),
  grant_id             uuid not null references public.grants(id) on delete cascade,
  category             text not null default 'General',
  title                text not null,
  description          text,
  status               text not null default 'pending' check (status in ('pending', 'completed', 'not_applicable')),
  due_date             date,
  -- constraint name is referenced by the app: grant_closeout_items_assigned_to_user_id_fkey
  assigned_to_user_id  uuid constraint grant_closeout_items_assigned_to_user_id_fkey
                       references public.user_profiles(id) on delete set null,
  notes                text,
  ai_generated         boolean not null default false,
  order_index          integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index grant_closeout_items_grant_idx on public.grant_closeout_items (grant_id);

create table public.grant_documents (
  id                   uuid primary key default gen_random_uuid(),
  grant_id             uuid not null references public.grants(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  uploaded_by_user_id  uuid references auth.users(id) on delete set null,
  file_name            text not null,
  file_path            text not null,   -- path inside the grant-documents bucket
  file_type            text not null default 'application/octet-stream',
  file_size            bigint not null default 0,
  description          text,
  created_at           timestamptz not null default now()
);
create index grant_documents_grant_idx on public.grant_documents (grant_id);

create table public.reimbursement_requests (
  id                   uuid primary key default gen_random_uuid(),
  grant_id             uuid not null references public.grants(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  request_number       text,
  request_type         text not null default 'reimbursement'
                       constraint rr_request_type_check check (request_type in (
                         'reimbursement', 'request_for_information', 'appeal',
                         'time_extension', 'scope_budget_change', 'closeout')),
  title                text not null,
  description          text,
  status               text not null default 'pending_submission'
                       constraint rr_status_check check (status in (
                         'pending_submission', 'submitted', 'payment_received', 'request_denied')),
  type_data            jsonb,
  submitted_date       date,
  payment_received_id  uuid references public.payments_received(id) on delete set null,
  notes                text,
  created_by_user_id   uuid references public.user_profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index reimbursement_requests_grant_idx on public.reimbursement_requests (grant_id);

create table public.reimbursement_request_expenses (
  id                        uuid primary key default gen_random_uuid(),
  reimbursement_request_id  uuid not null references public.reimbursement_requests(id) on delete cascade,
  expense_id                uuid not null unique references public.expenses(id) on delete cascade,  -- an expense belongs to one request
  created_at                timestamptz not null default now()
);
create index rre_request_idx on public.reimbursement_request_expenses (reimbursement_request_id);

create table public.grant_request_attachments (
  id                   uuid primary key default gen_random_uuid(),
  request_id           uuid not null references public.reimbursement_requests(id) on delete cascade,
  uploaded_by_user_id  uuid references public.user_profiles(id) on delete set null,
  file_name            text not null,
  file_path            text not null,   -- path inside the grant-request-attachments bucket
  file_type            text,
  file_size            bigint,
  created_at           timestamptz not null default now()
);
create index gra_request_idx on public.grant_request_attachments (request_id);

-- -----------------------------------------------------------------------------
-- Help chat and support tickets
-- -----------------------------------------------------------------------------

create table public.help_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  category    text,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index help_conversations_user_idx on public.help_conversations (user_id, status, updated_at desc);

create table public.help_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.help_conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  created_at       timestamptz not null default now()
);
create index help_messages_conversation_idx on public.help_messages (conversation_id, created_at);

create table public.support_tickets (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  user_id               uuid references public.user_profiles(id) on delete set null,
  subject               text not null,
  description           text,
  ticket_type           text not null default 'general_help',
  category              text,
  priority              text not null default 'normal',
  status                text not null default 'open'
                        check (status in ('open', 'submitted_to_grantguardian', 'grantguardian_processing_complete', 'closed')),
  grantguardian_status  text not null default 'submitted',
  conversation_id       uuid references public.help_conversations(id) on delete set null,
  escalated_at          timestamptz,
  escalated_by_user_id  uuid references public.user_profiles(id) on delete set null,
  closed_at             timestamptz,
  closed_by_user_id     uuid references public.user_profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index support_tickets_org_idx on public.support_tickets (organization_id);
create index support_tickets_user_idx on public.support_tickets (user_id);

create table public.support_ticket_attachments (
  id                   uuid primary key default gen_random_uuid(),
  ticket_id            uuid not null references public.support_tickets(id) on delete cascade,
  uploaded_by_user_id  uuid references public.user_profiles(id) on delete set null,
  file_name            text not null,
  file_url             text not null,   -- path inside the support-attachments bucket
  file_type            text,
  file_size            bigint,
  created_at           timestamptz not null default now()
);
create index sta_ticket_idx on public.support_ticket_attachments (ticket_id);

create table public.support_ticket_notes (
  id                  uuid primary key default gen_random_uuid(),
  ticket_id           uuid not null references public.support_tickets(id) on delete cascade,
  created_by_user_id  uuid not null references public.user_profiles(id) on delete cascade,
  content             text not null check (char_length(content) > 0),
  is_private          boolean not null default false,
  mentioned_user_ids  uuid[] not null default '{}',
  edited_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index stn_ticket_idx on public.support_ticket_notes (ticket_id, created_at);

-- -----------------------------------------------------------------------------
-- Notifications and marketing waitlist
-- -----------------------------------------------------------------------------

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null default 'general',
  title       text not null,
  message     text not null default '',
  link        text,
  grant_id    uuid references public.grants(id) on delete cascade,
  note_id     uuid references public.grant_notes(id) on delete cascade,
  ticket_id   uuid references public.support_tickets(id) on delete cascade,
  is_read     boolean not null default false,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

create table public.waitlist_signups (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  last_name   text not null,
  email       text not null,
  org_name    text not null,
  created_at  timestamptz not null default now()
);
create unique index waitlist_signups_email_idx on public.waitlist_signups (lower(email));

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'user_profiles', 'grants', 'expenses', 'budget_line_items',
    'compliance_requirements', 'payments_received', 'grant_notes', 'grant_note_replies',
    'grant_deliverables', 'grant_funding_sources', 'grant_closeout_items',
    'reimbursement_requests', 'help_conversations', 'support_tickets', 'support_ticket_notes'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Turn on row-level security everywhere. With RLS on and no policies yet,
-- tables are closed to the browser until the _rls migration runs.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
