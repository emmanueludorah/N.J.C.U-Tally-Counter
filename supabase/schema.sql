-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists public.submissions (
  id            text primary key,
  submitted_by  text not null,
  submitted_at  timestamptz not null default now(),
  tallies       jsonb not null default '[]'::jsonb
);

-- Row Level Security: the app uses the public "anon" key, so allow it to
-- read, add and delete submissions.
alter table public.submissions enable row level security;

drop policy if exists "anon can read submissions" on public.submissions;
create policy "anon can read submissions"
  on public.submissions for select to anon using (true);

drop policy if exists "anon can insert submissions" on public.submissions;
create policy "anon can insert submissions"
  on public.submissions for insert to anon with check (true);

drop policy if exists "anon can update submissions" on public.submissions;
create policy "anon can update submissions"
  on public.submissions for update to anon using (true) with check (true);

drop policy if exists "anon can delete submissions" on public.submissions;
create policy "anon can delete submissions"
  on public.submissions for delete to anon using (true);

-- Turn on realtime so the HOD dashboard updates live.
do $$
begin
  alter publication supabase_realtime add table public.submissions;
exception when duplicate_object then null;
end $$;
