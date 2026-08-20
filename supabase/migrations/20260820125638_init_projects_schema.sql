-- =========================================================================
--  مخطط "نظام اعتياد": جدول المشاريع السحابية + مخزن صور القوالب.
--
--  كل مستخدم يرى ويعدّل مشاريعه هو فقط — التنفيذ عبر حماية الصفوف (RLS)
--  في قاعدة البيانات، لأن التطبيق يعمل من المتصفح مباشرة بلا خادم وسيط،
--  فلا يمكن الاعتماد على أي تحقّق في كود الواجهة.
-- =========================================================================

-- ---------------------------------------------------------------- الجدول
create table if not exists public.projects (
  id            uuid        primary key default gen_random_uuid(),

  -- auth.uid() كقيمة افتراضية: الواجهة تُدرج الصف بلا user_id (انظر
  -- projectsApi.saveProject)، فتضبطه قاعدة البيانات من جلسة المستخدم نفسها
  -- ولا يستطيع أحد انتحال هوية غيره.
  user_id       uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,

  name          text        not null,

  -- مسار صورة القالب داخل مخزن templates بالصيغة "<user_id>/<filename>"،
  -- وnull حين يُحفَظ المشروع بلا قالب.
  template_path text,
  template_name text,

  mode          text        not null default 'auto',   -- auto | manual | crop | posts
  zoom          double precision not null default 1,
  excel_name    text,

  -- الحقول بوضعيها: { active: {...}, stashed: { auto: {...}, manual: {...} } }
  fields        jsonb       not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- قائمة المشاريع تُرتَّب دائماً بـ updated_at تنازلياً ضمن مشاريع مستخدم واحد.
create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

-- ------------------------------------------------- تحديث updated_at تلقائياً
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------- RLS
alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ================================================== مخزن صور القوالب
-- المخزن عام (public) لأن الواجهة تعرض القالب المحفوظ عبر getPublicUrl
-- داخل عنصر <img>، وهو ما لا يحمل ترويسة تفويض.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'templates',
  'templates',
  true,
  20971520,                                            -- 20 ميغابايت للصورة
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- الكتابة محصورة بمجلد المستخدم نفسه: "<user_id>/..." — الجزء الأول من
-- المسار يجب أن يطابق معرّفه، فلا يكتب أحد في مجلد غيره ولا يحذفه.
drop policy if exists "templates_insert_own_folder" on storage.objects;
create policy "templates_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "templates_update_own_folder" on storage.objects;
create policy "templates_update_own_folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "templates_delete_own_folder" on storage.objects;
create policy "templates_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- القراءة عبر الرابط العام لا تمرّ بـ RLS، لكن هذه السياسة تُبقي واجهات
-- المخزن (list/info) عاملةً لصاحب الملف.
drop policy if exists "templates_select_own_folder" on storage.objects;
create policy "templates_select_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'templates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
