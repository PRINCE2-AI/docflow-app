-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- users
-- ─────────────────────────────────────────
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  name        text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view their own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.users for update
  using (auth.uid() = id);

-- ─────────────────────────────────────────
-- workspaces
-- ─────────────────────────────────────────
create table if not exists public.workspaces (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  owner_id   uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

create policy "Workspace members can view workspace"
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = id
        and wm.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- workspace_members
-- ─────────────────────────────────────────
create type if not exists workspace_role as enum ('owner', 'member');

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  role         workspace_role not null default 'member',
  primary key (workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

create policy "Members can view their memberships"
  on public.workspace_members for select
  using (user_id = auth.uid());

-- ─────────────────────────────────────────
-- Function: handle_new_user
-- Fires on every new auth.users row.
-- Creates the public.users profile and a
-- default workspace only on first sign-up.
-- ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  workspace_id uuid;
  display_name text;
begin
  -- Derive a display name from metadata (Google) or email
  display_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  -- Upsert the public user profile
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    display_name,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  -- Create default workspace
  insert into public.workspaces (name, owner_id)
  values (display_name || '''s Workspace', new.id)
  returning id into workspace_id;

  -- Add user as owner member
  insert into public.workspace_members (workspace_id, user_id, role)
  values (workspace_id, new.id, 'owner');

  return new;
end;
$$;

-- Attach trigger to auth.users
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
