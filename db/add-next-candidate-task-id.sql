alter table public.tasks add column if not exists next_candidate_task_id uuid;

alter table public.tasks drop constraint if exists tasks_next_candidate_task_id_fkey;
alter table public.tasks
add constraint tasks_next_candidate_task_id_fkey
foreign key (next_candidate_task_id) references public.tasks(id) on delete set null;

create index if not exists tasks_next_candidate_task_id_idx on public.tasks(next_candidate_task_id);
