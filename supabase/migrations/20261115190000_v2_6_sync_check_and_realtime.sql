-- JobCam v2.6.0 (Nov 15, 2026): storage check/repair + live updates between phones.
-- SAFE TO RUN MORE THAN ONCE. It only adds what is missing; it never deletes jobs, photos or files.
-- Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- The last query prints a checklist: every row should say OK.
-- No secrets, emails or phone numbers live in this file.

begin;

-- 1. Private photo bucket (same settings as the Nov 9 migration).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Storage policies (team members can add, read, replace and delete photos; clients can read their own job only).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='jobcam_photos_admin_select') then
    create policy jobcam_photos_admin_select on storage.objects for select to authenticated
      using (bucket_id = 'job-photos' and (select private.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='jobcam_photos_admin_insert') then
    create policy jobcam_photos_admin_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'job-photos' and (select private.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='jobcam_photos_admin_update') then
    create policy jobcam_photos_admin_update on storage.objects for update to authenticated
      using (bucket_id = 'job-photos' and (select private.is_admin()))
      with check (bucket_id = 'job-photos' and (select private.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='jobcam_photos_admin_delete') then
    create policy jobcam_photos_admin_delete on storage.objects for delete to authenticated
      using (bucket_id = 'job-photos' and (select private.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='jobcam_photos_client_select') then
    create policy jobcam_photos_client_select on storage.objects for select to authenticated
      using (bucket_id = 'job-photos' and private.client_can_read_job((storage.foldername(name))[1]));
  end if;
end $$;

-- 3. Live updates: send job / photo / note changes to every signed-in team phone (Supabase Realtime).
--    Row Level Security still applies, so clients never receive other jobs.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['jobs','photos','notes'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;

-- 4. Checklist (read-only). Every row should say OK.
select 'job-photos bucket exists' as check_item,
       case when exists (select 1 from storage.buckets where id='job-photos') then 'OK' else 'MISSING' end as result
union all
select 'storage policies (5)', case when (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'jobcam_photos_%') >= 5 then 'OK' else 'MISSING' end
union all
select 'active team logins', (select count(*)::text from public.admins where active) || ' active (expect 2-3)'
union all
select 'live updates on jobs/photos/notes', case when (select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('jobs','photos','notes')) = 3 then 'OK' else 'MISSING' end
union all
select 'photo rows in cloud', (select count(*)::text from public.photos)
union all
select 'photo files in cloud', (select count(*)::text from storage.objects where bucket_id='job-photos');
