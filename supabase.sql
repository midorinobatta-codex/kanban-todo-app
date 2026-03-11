create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assignee text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_status_created_at_idx on public.tasks(status, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute procedure public.set_updated_at();

alter table public.tasks enable row level security;

drop policy if exists "Allow read for anon and authenticated" on public.tasks;
create policy "Allow read for anon and authenticated" on public.tasks
for select to anon, authenticated
using (true);

drop policy if exists "Allow insert for anon and authenticated" on public.tasks;
create policy "Allow insert for anon and authenticated" on public.tasks
for insert to anon, authenticated
with check (true);

drop policy if exists "Allow update for anon and authenticated" on public.tasks;
create policy "Allow update for anon and authenticated" on public.tasks
for update to anon, authenticated
using (true)
with check (true);

drop policy if exists "Allow delete for anon and authenticated" on public.tasks;
create policy "Allow delete for anon and authenticated" on public.tasks
for delete to anon, authenticated
using (true);
