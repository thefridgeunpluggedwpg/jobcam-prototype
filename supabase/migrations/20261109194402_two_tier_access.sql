-- JobCam two-tier access (Nov 9, 2026)
-- Admins: individual Supabase Auth email+password accounts listed in public.admins (roles only, no names/emails here).
-- Clients: per-job temporary code -> anonymous Supabase session claims that ONE job, read-only, until expiry/revoke.
-- Enforcement is server-side: Row Level Security on every table + Storage policies on the private bucket.
-- Paste this whole file into Supabase Dashboard -> SQL Editor -> Run. Safe to run once on a NEW project.
-- No paid add-ons are used. No secrets, emails or phone numbers live in this file.

begin;

create extension if not exists pgcrypto with schema extensions;

-- Private schema for helper functions (NOT exposed through the Data API).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role_label text not null check (role_label in ('owner','carpenter','marketing')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.admins is 'The 3 JobCam admins (roles only). Add/remove rows in the SQL editor; set active=false to shut one login off.';

create table public.jobs (
  id                text primary key check (length(id) between 1 and 150),
  name              text not null check (length(name) between 1 and 90),
  category          text not null check (length(category) between 1 and 40),
  area              text not null default '' check (length(area) <= 70),
  job_date          date not null,
  note              text not null default '' check (length(note) <= 2000),
  tags              text[] not null default '{}',
  featured_photo_id text,
  completed_on      date,
  created_by        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.photos (
  id             text primary key check (length(id) between 1 and 150),
  job_id         text not null references public.jobs(id) on delete cascade,
  original_path  text not null,
  annotated_path text,
  phase          text not null check (phase in ('Before','During','After')),
  name           text not null default '' check (length(name) <= 300),
  stamp          text not null default '' check (length(stamp) <= 300),
  taken_at       text,
  added_at       timestamptz,
  source         text not null default '' check (length(source) <= 100),
  uploaded_by    text not null default '' check (length(uploaded_by) <= 50),
  gps            jsonb,
  tags           text[] not null default '{}',
  caption        text not null default '' check (length(caption) <= 500),
  annotations    jsonb not null default '[]',
  annotated_at   timestamptz,
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now()
);
create index photos_job_id_idx on public.photos (job_id);

-- Daily logs / field notes. Admin-only (may hold internal issues); clients see the job's design note instead.
create table public.notes (
  id          text primary key check (length(id) between 1 and 150),
  job_id      text not null references public.jobs(id) on delete cascade,
  log_date    date not null,
  author      text not null default '' check (length(author) <= 50),
  work        text not null default '' check (length(work) <= 2000),
  issues      text not null default '' check (length(issues) <= 1000),
  next_steps  text not null default '' check (length(next_steps) <= 1000),
  weather     text not null default '' check (length(weather) <= 200),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create index notes_job_id_idx on public.notes (job_id);

-- One row per client code. Only the SHA-256 hash of the code is stored.
create table public.client_access (
  id           uuid primary key default gen_random_uuid(),
  job_id       text not null references public.jobs(id) on delete cascade,
  code_hash    text not null unique,
  code_hint    text not null,              -- last 4 characters, so admins can tell codes apart
  valid_days   integer not null default 90 check (valid_days between 1 and 730),
  expires_at   timestamptz not null,
  revoked      boolean not null default false,
  revoked_at   timestamptz,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index client_access_job_id_idx on public.client_access (job_id);

-- Which (anonymous) client session has redeemed which code. Written only by claim_client_code().
create table public.client_sessions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  access_id  uuid not null references public.client_access(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (user_id, access_id)
);
create index client_sessions_access_id_idx on public.client_sessions (access_id);

------------------------------------------------------------------------------
-- Helper functions (private schema, security definer, fixed search_path)
------------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (select 1 from public.admins a where a.user_id = auth.uid() and a.active);
$$;

create or replace function private.client_can_read_job(p_job_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1
    from public.client_sessions s
    join public.client_access c on c.id = s.access_id
    where s.user_id = auth.uid()
      and c.job_id = p_job_id
      and not c.revoked
      and c.expires_at > now()
  );
$$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

-- When a job is marked finished, its live codes run for valid_days after the finish date.
create or replace function private.extend_codes_on_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.completed_on is not null and new.completed_on is distinct from old.completed_on then
    update public.client_access c
       set expires_at = greatest(c.created_at, new.completed_on::timestamptz) + make_interval(days => c.valid_days)
     where c.job_id = new.id and not c.revoked;
  end if;
  return new;
end; $$;

revoke all on function private.is_admin(), private.client_can_read_job(text),
  private.touch_updated_at(), private.extend_codes_on_completion() from public;
grant execute on function private.is_admin(), private.client_can_read_job(text) to authenticated;

create trigger jobs_touch    before update on public.jobs    for each row execute function private.touch_updated_at();
create trigger photos_touch  before update on public.photos  for each row execute function private.touch_updated_at();
create trigger notes_touch   before update on public.notes   for each row execute function private.touch_updated_at();
create trigger jobs_completion after update of completed_on on public.jobs for each row execute function private.extend_codes_on_completion();

------------------------------------------------------------------------------
-- RPCs called by the app (public, security definer, explicit checks)
------------------------------------------------------------------------------
-- Admin: make a new client code for one job. Returns the plain code ONCE; only its hash is stored.
create or replace function public.create_client_access(p_job_id text, p_valid_days integer default 90)
returns table (access_id uuid, code text, expires_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- 32 symbols, no 0/O/1/I
  v_bytes bytea;
  v_code text := '';
  v_completed date;
  v_exp timestamptz;
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Only JobCam admins can share jobs' using errcode = '42501';
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 730 then
    raise exception 'Valid days must be between 1 and 730' using errcode = '22023';
  end if;
  select j.completed_on into v_completed from public.jobs j where j.id = p_job_id;
  if not found then
    raise exception 'Job is not uploaded yet. Sync, then try again.' using errcode = 'P0002';
  end if;
  v_bytes := extensions.gen_random_bytes(12);           -- 12 x 5 bits = 60 bits of randomness
  for i in 0..11 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  v_exp := greatest(now(), coalesce(v_completed::timestamptz, now())) + make_interval(days => p_valid_days);
  insert into public.client_access (job_id, code_hash, code_hint, valid_days, expires_at, created_by)
  values (p_job_id, encode(extensions.digest(v_code, 'sha256'), 'hex'), right(v_code, 4), p_valid_days, v_exp, auth.uid())
  returning id into v_id;
  return query select v_id, v_code, v_exp;
end; $$;

-- Client: redeem a code with the current (anonymous) session. Returns the job id and expiry.
create or replace function public.claim_client_code(p_code text)
returns table (job_id text, expires_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_acc public.client_access%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if length(v_norm) <> 12 then
    raise exception 'That code is not valid or has expired' using errcode = '28000';
  end if;
  select * into v_acc from public.client_access c
   where c.code_hash = encode(extensions.digest(v_norm, 'sha256'), 'hex')
     and not c.revoked and c.expires_at > now();
  if not found then
    raise exception 'That code is not valid or has expired' using errcode = '28000';
  end if;
  insert into public.client_sessions (user_id, access_id) values (auth.uid(), v_acc.id)
  on conflict do nothing;
  update public.client_access set last_used_at = now() where id = v_acc.id;
  return query select v_acc.job_id, v_acc.expires_at;
end; $$;

-- Client: which job(s) this session can still see (used when the app is reopened without the link).
create or replace function public.my_client_access()
returns table (job_id text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.job_id, max(c.expires_at)
  from public.client_sessions s join public.client_access c on c.id = s.access_id
  where s.user_id = auth.uid() and not c.revoked and c.expires_at > now()
  group by c.job_id;
$$;

-- Admin check for the app (true only for active, non-anonymous admins).
create or replace function public.am_i_admin()
returns table (is_admin boolean, role_label text)
language sql stable security definer set search_path = '' as $$
  select private.is_admin(),
         (select a.role_label from public.admins a where a.user_id = auth.uid() and a.active);
$$;

revoke all on function public.create_client_access(text, integer), public.claim_client_code(text),
  public.my_client_access(), public.am_i_admin() from public, anon;
grant execute on function public.create_client_access(text, integer), public.claim_client_code(text),
  public.my_client_access(), public.am_i_admin() to authenticated;

------------------------------------------------------------------------------
-- Grants + Row Level Security
------------------------------------------------------------------------------
revoke all on public.admins, public.jobs, public.photos, public.notes, public.client_access, public.client_sessions from anon, public;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.jobs, public.photos, public.notes to authenticated;
grant select, update, delete on public.client_access to authenticated;
-- client_sessions: no direct API access at all (RPC only).
revoke all on public.client_sessions from authenticated;

alter table public.admins          enable row level security;
alter table public.jobs            enable row level security;
alter table public.photos          enable row level security;
alter table public.notes           enable row level security;
alter table public.client_access   enable row level security;
alter table public.client_sessions enable row level security;

create policy admins_read on public.admins for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy jobs_admin_all on public.jobs for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy jobs_client_read on public.jobs for select to authenticated
  using (private.client_can_read_job(id));

create policy photos_admin_all on public.photos for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy photos_client_read on public.photos for select to authenticated
  using (private.client_can_read_job(job_id));

create policy notes_admin_all on public.notes for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy client_access_admin_read on public.client_access for select to authenticated
  using ((select private.is_admin()));
create policy client_access_admin_update on public.client_access for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy client_access_admin_delete on public.client_access for delete to authenticated
  using ((select private.is_admin()));

------------------------------------------------------------------------------
-- Private Storage bucket for photos: path = <job_id>/<photo_id>/<kind>-<uuid>.jpg
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy jobcam_photos_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and (select private.is_admin()));
create policy jobcam_photos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and (select private.is_admin()));
create policy jobcam_photos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'job-photos' and (select private.is_admin()))
  with check (bucket_id = 'job-photos' and (select private.is_admin()));
create policy jobcam_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and (select private.is_admin()));
create policy jobcam_photos_client_select on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and private.client_can_read_job((storage.foldername(name))[1]));

commit;
