create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  description text,
  assignee text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  importance text not null default 'medium' check (importance in ('low', 'medium', 'high')),
  urgency text not null default 'medium' check (urgency in ('low', 'medium', 'high')),
  status text not null default 'todo',
  gtd_category text not null default 'next_action',
  project_task_id uuid,
  due_date date,
  waiting_response_date date,
  started_at timestamptz,
  tracked_minutes integer not null default 0,
  manual_adjustment_minutes integer not null default 0,
  session_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.tasks alter column user_id set default auth.uid();
alter table public.tasks add column if not exists gtd_category text not null default 'next_action';
alter table public.tasks add column if not exists importance text not null default 'medium';
alter table public.tasks add column if not exists urgency text not null default 'medium';
alter table public.tasks add column if not exists started_at timestamptz;
alter table public.tasks add column if not exists project_task_id uuid;
alter table public.tasks add column if not exists waiting_response_date date;
alter table public.tasks add column if not exists tracked_minutes integer not null default 0;
alter table public.tasks add column if not exists manual_adjustment_minutes integer not null default 0;
alter table public.tasks add column if not exists session_started_at timestamptz;

update public.tasks set tracked_minutes = 0 where tracked_minutes is null;
update public.tasks set manual_adjustment_minutes = 0 where manual_adjustment_minutes is null;

alter table public.tasks alter column tracked_minutes set default 0;
alter table public.tasks alter column manual_adjustment_minutes set default 0;

alter table public.tasks drop constraint if exists tasks_project_task_id_fkey;
alter table public.tasks
add constraint tasks_project_task_id_fkey
foreign key (project_task_id) references public.tasks(id) on delete set null;

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_status_created_at_idx on public.tasks(status, created_at desc);
create index if not exists tasks_user_gtd_category_idx on public.tasks(user_id, gtd_category);
create index if not exists tasks_user_importance_idx on public.tasks(user_id, importance);
create index if not exists tasks_user_urgency_idx on public.tasks(user_id, urgency);
create index if not exists tasks_project_task_id_idx on public.tasks(project_task_id);
create index if not exists tasks_user_session_started_at_idx on public.tasks(user_id, session_started_at);

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
drop policy if exists "Allow insert for anon and authenticated" on public.tasks;
drop policy if exists "Allow update for anon and authenticated" on public.tasks;
drop policy if exists "Allow delete for anon and authenticated" on public.tasks;
drop policy if exists "Allow read for authenticated owner" on public.tasks;
drop policy if exists "Allow insert for authenticated owner" on public.tasks;
drop policy if exists "Allow update for authenticated owner" on public.tasks;
drop policy if exists "Allow delete for authenticated owner" on public.tasks;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks drop constraint if exists tasks_gtd_category_check;
alter table public.tasks drop constraint if exists tasks_importance_check;
alter table public.tasks drop constraint if exists tasks_urgency_check;
alter table public.tasks drop constraint if exists tasks_tracked_minutes_check;

update public.tasks
set status = 'doing'
where status = 'in_progress';

alter table public.tasks alter column status set default 'todo';

alter table public.tasks
add constraint tasks_status_check
check (status in ('todo', 'doing', 'waiting', 'done'));

update public.tasks
set gtd_category = 'next_action'
where gtd_category is null;

alter table public.tasks alter column gtd_category set default 'next_action';

alter table public.tasks
add constraint tasks_gtd_category_check
check (gtd_category in ('next_action', 'delegated', 'project', 'someday'));

update public.tasks
set importance = 'medium'
where importance is null;

alter table public.tasks alter column importance set default 'medium';

alter table public.tasks
add constraint tasks_importance_check
check (importance in ('low', 'medium', 'high'));

update public.tasks
set urgency = 'medium'
where urgency is null;

alter table public.tasks alter column urgency set default 'medium';

alter table public.tasks
add constraint tasks_urgency_check
check (urgency in ('low', 'medium', 'high'));

alter table public.tasks
add constraint tasks_tracked_minutes_check
check (tracked_minutes >= 0);

create policy "Allow read for authenticated owner" on public.tasks
for select to authenticated
using (auth.uid() = user_id);

create policy "Allow insert for authenticated owner" on public.tasks
for insert to authenticated
with check (auth.uid() = user_id);

create policy "Allow update for authenticated owner" on public.tasks
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Allow delete for authenticated owner" on public.tasks
for delete to authenticated
using (auth.uid() = user_id);

create table if not exists public.task_work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  entry_type text not null default 'timer',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_work_sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.task_work_sessions alter column user_id set default auth.uid();
alter table public.task_work_sessions add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.task_work_sessions add column if not exists entry_type text not null default 'timer';
alter table public.task_work_sessions add column if not exists started_at timestamptz not null default now();
alter table public.task_work_sessions add column if not exists ended_at timestamptz;
alter table public.task_work_sessions add column if not exists duration_minutes integer not null default 0;
alter table public.task_work_sessions add column if not exists note text;

alter table public.task_work_sessions drop constraint if exists task_work_sessions_entry_type_check;
alter table public.task_work_sessions
add constraint task_work_sessions_entry_type_check
check (entry_type in ('timer', 'manual_adjustment'));

create index if not exists task_work_sessions_user_id_idx on public.task_work_sessions(user_id);
create index if not exists task_work_sessions_task_id_idx on public.task_work_sessions(task_id);
create index if not exists task_work_sessions_started_at_idx on public.task_work_sessions(started_at desc);
create index if not exists task_work_sessions_user_started_at_idx on public.task_work_sessions(user_id, started_at desc);

drop trigger if exists set_task_work_sessions_updated_at on public.task_work_sessions;
create trigger set_task_work_sessions_updated_at
before update on public.task_work_sessions
for each row execute procedure public.set_updated_at();

alter table public.task_work_sessions enable row level security;

drop policy if exists "Allow read for authenticated owner" on public.task_work_sessions;
drop policy if exists "Allow insert for authenticated owner" on public.task_work_sessions;
drop policy if exists "Allow update for authenticated owner" on public.task_work_sessions;
drop policy if exists "Allow delete for authenticated owner" on public.task_work_sessions;

create policy "Allow read for authenticated owner" on public.task_work_sessions
for select to authenticated
using (auth.uid() = user_id);

create policy "Allow insert for authenticated owner" on public.task_work_sessions
for insert to authenticated
with check (auth.uid() = user_id);

create policy "Allow update for authenticated owner" on public.task_work_sessions
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Allow delete for authenticated owner" on public.task_work_sessions
for delete to authenticated
using (auth.uid() = user_id);
