-- guides table
create table if not exists public.guides (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  title        text not null,
  summary      text not null default '',
  status       text not null default 'published',
  created_at   timestamptz not null default now()
);

alter table public.guides enable row level security;

create policy "workspace members can read guides"
  on public.guides for select
  using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

create policy "workspace members can insert guides"
  on public.guides for insert
  with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- guide_steps table
create table if not exists public.guide_steps (
  id             uuid primary key default gen_random_uuid(),
  guide_id       uuid not null references public.guides(id) on delete cascade,
  step_number    int  not null,
  title          text not null,
  description    text not null,
  screenshot_url text,
  created_at     timestamptz not null default now()
);

alter table public.guide_steps enable row level security;

create policy "workspace members can read guide_steps"
  on public.guide_steps for select
  using (
    guide_id in (
      select g.id from public.guides g
      join public.workspace_members wm on wm.workspace_id = g.workspace_id
      where wm.user_id = auth.uid()
    )
  );

create policy "workspace members can insert guide_steps"
  on public.guide_steps for insert
  with check (
    guide_id in (
      select g.id from public.guides g
      join public.workspace_members wm on wm.workspace_id = g.workspace_id
      where wm.user_id = auth.uid()
    )
  );

-- Storage bucket for screenshots (run once)
-- insert into storage.buckets (id, name, public)
-- values ('screenshots', 'screenshots', true)
-- on conflict do nothing;
