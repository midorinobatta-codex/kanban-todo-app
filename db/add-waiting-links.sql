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
alter table public.waiting_links add column if not exists created_at timestamptz not null default now();
alter table public.waiting_links add column if not exists updated_at timestamptz not null default now();

alter table public.waiting_links alter column user_id set not null;
alter table public.waiting_links alter column task_id set not null;
alter table public.waiting_links alter column token set not null;
alter table public.waiting_links alter column task_title set not null;

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
alter table public.waiting_responses add column if not exists created_at timestamptz not null default now();

alter table public.waiting_responses alter column waiting_link_id set not null;
alter table public.waiting_responses alter column task_id set not null;
alter table public.waiting_responses alter column response_status set not null;

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
