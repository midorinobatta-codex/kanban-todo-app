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
  next_candidate_task_id uuid,
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
alter table public.tasks add column if not exists next_candidate_task_id uuid;
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

alter table public.tasks drop constraint if exists tasks_next_candidate_task_id_fkey;
alter table public.tasks
add constraint tasks_next_candidate_task_id_fkey
foreign key (next_candidate_task_id) references public.tasks(id) on delete set null;

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_status_created_at_idx on public.tasks(status, created_at desc);
create index if not exists tasks_user_gtd_category_idx on public.tasks(user_id, gtd_category);
create index if not exists tasks_user_importance_idx on public.tasks(user_id, importance);
create index if not exists tasks_user_urgency_idx on public.tasks(user_id, urgency);
create index if not exists tasks_project_task_id_idx on public.tasks(project_task_id);
create index if not exists tasks_next_candidate_task_id_idx on public.tasks(next_candidate_task_id);
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

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text,
  recurrence_type text not null default 'weekly',
  default_gtd_category text not null default 'next_action',
  start_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_templates add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.task_templates alter column user_id set default auth.uid();
alter table public.task_templates add column if not exists title text;
alter table public.task_templates add column if not exists description text;
alter table public.task_templates add column if not exists recurrence_type text not null default 'weekly';
alter table public.task_templates add column if not exists default_gtd_category text not null default 'next_action';
alter table public.task_templates add column if not exists start_date date not null default current_date;
alter table public.task_templates add column if not exists is_active boolean not null default true;

update public.task_templates
set start_date = current_date
where start_date is null;

alter table public.task_templates drop constraint if exists task_templates_recurrence_type_check;
alter table public.task_templates
add constraint task_templates_recurrence_type_check
check (recurrence_type in ('daily', 'weekly', 'monthly'));

alter table public.task_templates drop constraint if exists task_templates_default_gtd_category_check;
alter table public.task_templates
add constraint task_templates_default_gtd_category_check
check (default_gtd_category in ('next_action', 'delegated', 'someday'));

create index if not exists task_templates_user_id_idx on public.task_templates(user_id);
create index if not exists task_templates_user_active_idx on public.task_templates(user_id, is_active);

drop trigger if exists set_task_templates_updated_at on public.task_templates;
create trigger set_task_templates_updated_at
before update on public.task_templates
for each row execute procedure public.set_updated_at();

alter table public.task_templates enable row level security;

drop policy if exists "Allow read for authenticated owner" on public.task_templates;
drop policy if exists "Allow insert for authenticated owner" on public.task_templates;
drop policy if exists "Allow update for authenticated owner" on public.task_templates;
drop policy if exists "Allow delete for authenticated owner" on public.task_templates;

create policy "Allow read for authenticated owner" on public.task_templates
for select to authenticated
using (auth.uid() = user_id);

create policy "Allow insert for authenticated owner" on public.task_templates
for insert to authenticated
with check (auth.uid() = user_id);

create policy "Allow update for authenticated owner" on public.task_templates
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Allow delete for authenticated owner" on public.task_templates
for delete to authenticated
using (auth.uid() = user_id);

alter table public.tasks add column if not exists template_id uuid;
alter table public.tasks add column if not exists template_period_key text;

alter table public.tasks drop constraint if exists tasks_template_id_fkey;
alter table public.tasks
add constraint tasks_template_id_fkey
foreign key (template_id) references public.task_templates(id) on delete set null;

create index if not exists tasks_template_id_idx on public.tasks(template_id);
create unique index if not exists tasks_user_template_period_unique_idx
on public.tasks(user_id, template_id, template_period_key)
where template_id is not null and template_period_key is not null;

create table if not exists public.waiting_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  token text not null unique,
  mode text not null default 'reply' check (mode in ('reply')),
  is_active boolean not null default true,
  expires_at timestamptz,
  requester_name text,
  task_title text not null,
  request_detail text,
  request_due_date date,
  has_unread_response boolean not null default false,
  latest_response_at timestamptz,
  latest_response_summary text,
  latest_response_status text,
  latest_response_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waiting_responses (
  id uuid primary key default gen_random_uuid(),
  waiting_link_id uuid not null references public.waiting_links(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  responder_name text,
  response_status text not null check (response_status in ('not_started', 'in_progress', 'completed', 'on_hold', 'has_question')),
  response_due_date date,
  comment text,
  created_at timestamptz not null default now()
);

alter table public.waiting_links add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.waiting_links alter column user_id set default auth.uid();
alter table public.waiting_links add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.waiting_links add column if not exists token text;
alter table public.waiting_links add column if not exists mode text not null default 'reply';
alter table public.waiting_links add column if not exists is_active boolean not null default true;
alter table public.waiting_links add column if not exists expires_at timestamptz;
alter table public.waiting_links add column if not exists requester_name text;
alter table public.waiting_links add column if not exists task_title text;
alter table public.waiting_links add column if not exists request_detail text;
alter table public.waiting_links add column if not exists request_due_date date;
alter table public.waiting_links add column if not exists has_unread_response boolean not null default false;
alter table public.waiting_links add column if not exists latest_response_at timestamptz;
alter table public.waiting_links add column if not exists latest_response_summary text;
alter table public.waiting_links add column if not exists latest_response_status text;
alter table public.waiting_links add column if not exists latest_response_due_date date;

alter table public.waiting_links drop constraint if exists waiting_links_mode_check;
alter table public.waiting_links
add constraint waiting_links_mode_check
check (mode in ('reply'));

alter table public.waiting_links add constraint waiting_links_token_key unique (token);

create index if not exists waiting_links_user_id_idx on public.waiting_links(user_id);
create index if not exists waiting_links_task_id_idx on public.waiting_links(task_id);
create index if not exists waiting_links_token_idx on public.waiting_links(token);
create index if not exists waiting_links_active_idx on public.waiting_links(is_active, expires_at);

alter table public.waiting_responses add column if not exists waiting_link_id uuid references public.waiting_links(id) on delete cascade;
alter table public.waiting_responses add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.waiting_responses add column if not exists responder_name text;
alter table public.waiting_responses add column if not exists response_status text;
alter table public.waiting_responses add column if not exists response_due_date date;
alter table public.waiting_responses add column if not exists comment text;

alter table public.waiting_responses drop constraint if exists waiting_responses_response_status_check;
alter table public.waiting_responses
add constraint waiting_responses_response_status_check
check (response_status in ('not_started', 'in_progress', 'completed', 'on_hold', 'has_question'));

create index if not exists waiting_responses_waiting_link_idx on public.waiting_responses(waiting_link_id, created_at desc);
create index if not exists waiting_responses_task_id_idx on public.waiting_responses(task_id, created_at desc);

drop trigger if exists set_waiting_links_updated_at on public.waiting_links;
create trigger set_waiting_links_updated_at
before update on public.waiting_links
for each row execute procedure public.set_updated_at();

create or replace function public.submit_waiting_response(
  p_token text,
  p_responder_name text,
  p_response_status text,
  p_response_due_date date,
  p_comment text
)
returns public.waiting_responses
language plpgsql
security definer
set search_path = public
as $$
declare
  target_link public.waiting_links;
  inserted public.waiting_responses;
begin
  select *
    into target_link
  from public.waiting_links
  where token = p_token
    and is_active = true
    and (expires_at is null or expires_at > now())
  limit 1;

  if target_link.id is null then
    raise exception 'waiting link is invalid or expired';
  end if;

  insert into public.waiting_responses(waiting_link_id, task_id, responder_name, response_status, response_due_date, comment)
  values (target_link.id, target_link.task_id, nullif(trim(p_responder_name), ''), p_response_status, p_response_due_date, nullif(trim(p_comment), ''))
  returning * into inserted;

  update public.waiting_links
  set
    has_unread_response = true,
    latest_response_at = inserted.created_at,
    latest_response_status = inserted.response_status,
    latest_response_summary = left(coalesce(inserted.comment, ''), 120),
    latest_response_due_date = inserted.response_due_date
  where id = target_link.id;

  if inserted.response_due_date is not null then
    update public.tasks
    set waiting_response_date = inserted.response_due_date
    where id = target_link.task_id;
  end if;

  return inserted;
end;
$$;

revoke all on function public.submit_waiting_response(text, text, text, date, text) from public;
grant execute on function public.submit_waiting_response(text, text, text, date, text) to anon, authenticated;

create or replace function public.get_waiting_link_public(
  p_token text
)
returns table (
  id uuid,
  token text,
  mode text,
  requester_name text,
  task_title text,
  request_detail text,
  request_due_date date,
  expires_at timestamptz,
  latest_response_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    waiting_links.id,
    waiting_links.token,
    waiting_links.mode,
    waiting_links.requester_name,
    waiting_links.task_title,
    waiting_links.request_detail,
    waiting_links.request_due_date,
    waiting_links.expires_at,
    waiting_links.latest_response_at
  from public.waiting_links
  where waiting_links.token = p_token
    and waiting_links.is_active = true
    and (waiting_links.expires_at is null or waiting_links.expires_at > now())
  limit 1;
$$;

revoke all on function public.get_waiting_link_public(text) from public;
grant execute on function public.get_waiting_link_public(text) to anon, authenticated;

alter table public.waiting_links enable row level security;
alter table public.waiting_responses enable row level security;

drop policy if exists "Allow waiting link read for owner" on public.waiting_links;
drop policy if exists "Allow waiting link insert for owner" on public.waiting_links;
drop policy if exists "Allow waiting link update for owner" on public.waiting_links;
drop policy if exists "Allow waiting link delete for owner" on public.waiting_links;

create policy "Allow waiting link read for owner" on public.waiting_links
for select to authenticated
using (auth.uid() = user_id);

create policy "Allow waiting link insert for owner" on public.waiting_links
for insert to authenticated
with check (auth.uid() = user_id);

create policy "Allow waiting link update for owner" on public.waiting_links
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Allow waiting link delete for owner" on public.waiting_links
for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "Allow waiting response read for owner" on public.waiting_responses;
create policy "Allow waiting response read for owner" on public.waiting_responses
for select to authenticated
using (
  exists (
    select 1
    from public.waiting_links
    where waiting_links.id = waiting_responses.waiting_link_id
      and waiting_links.user_id = auth.uid()
  )
);
