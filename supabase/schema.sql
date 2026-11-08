-- Run this in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once.
--
-- Security model:
--   * Anyone (the phones) can ADD a submission, but cannot read, change or
--     delete any submission.
--   * Only users listed in public.admins (the HOD/HOO, logged in with
--     Supabase Auth) can READ and DELETE submissions.
--   * The database rejects oversized or malformed data.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id            text primary key,
  submitted_by  text not null,
  submitted_at  timestamptz not null default now(),
  tallies       jsonb not null default '[]'::jsonb
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Data validation
-- ---------------------------------------------------------------------------
-- Every tally must be {"name": text up to 40 chars, "count": whole number 0..1,000,000}.
create or replace function public.valid_tallies(t jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(t) = 'array'
     and jsonb_array_length(t) <= 200
     and not exists (
       select 1
       from jsonb_array_elements(t) as e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'name') is distinct from 'string'
          or char_length(e ->> 'name') not between 1 and 40
          or jsonb_typeof(e -> 'count') is distinct from 'number'
          or (case when jsonb_typeof(e -> 'count') = 'number'
                   then (e ->> 'count')::numeric not between 0 and 1000000
                     or (e ->> 'count')::numeric <> trunc((e ->> 'count')::numeric)
                   else true end)
     );
$$;

alter table public.submissions drop constraint if exists submissions_id_check;
alter table public.submissions add constraint submissions_id_check
  check (char_length(id) between 1 and 64);

alter table public.submissions drop constraint if exists submissions_submitted_by_check;
alter table public.submissions add constraint submissions_submitted_by_check
  check (char_length(trim(submitted_by)) between 1 and 40);

alter table public.submissions drop constraint if exists submissions_tallies_check;
alter table public.submissions add constraint submissions_tallies_check
  check (public.valid_tallies(tallies));

-- The server sets the time, so nobody can back-date or future-date a submission.
create or replace function public.set_submitted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.submitted_at := now();
  return new;
end;
$$;

drop trigger if exists submissions_set_submitted_at on public.submissions;
create trigger submissions_set_submitted_at
  before insert on public.submissions
  for each row execute function public.set_submitted_at();

-- ---------------------------------------------------------------------------
-- Admin check
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.submissions enable row level security;
alter table public.admins enable row level security;  -- no policies: hidden from the app

-- Remove the old open policies.
drop policy if exists "anon can read submissions"   on public.submissions;
drop policy if exists "anon can insert submissions" on public.submissions;
drop policy if exists "anon can update submissions" on public.submissions;
drop policy if exists "anon can delete submissions" on public.submissions;

drop policy if exists "anyone can add a submission" on public.submissions;
create policy "anyone can add a submission"
  on public.submissions for insert to anon, authenticated
  with check (true);

drop policy if exists "admins can read submissions" on public.submissions;
create policy "admins can read submissions"
  on public.submissions for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "admins can delete submissions" on public.submissions;
create policy "admins can delete submissions"
  on public.submissions for delete to authenticated
  using ((select public.is_admin()));

-- No UPDATE policy: nobody can edit a submission after it is sent.

-- ---------------------------------------------------------------------------
-- Realtime (live dashboard). Realtime respects the policies above, so only
-- admins receive live updates.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.submissions;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Make the HOD an admin.
-- 1. Authentication -> Users -> Add user -> Create new user
--    (enter the HOD's email + a strong password, tick "Auto Confirm User").
-- 2. Put that email below (keep the quotes), then run this file again.
--    Repeat with another email for each extra admin (e.g. the HOO).
-- ---------------------------------------------------------------------------
insert into public.admins (user_id)
select id from auth.users where email = 'PUT-HOD-EMAIL-HERE'
on conflict do nothing;
