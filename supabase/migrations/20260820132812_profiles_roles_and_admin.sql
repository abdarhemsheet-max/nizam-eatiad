-- =========================================================================
--  الأدوار ولوحة المدير.
--
--  لوحة المدير تعمل في المتصفح، ولا شيء يمنع أي زائر من فتح رابطها. لذلك
--  لا يُعتمد على إخفاء الواجهة إطلاقاً: كل قاعدة هنا مفروضة في قاعدة
--  البيانات، فمن ليس مديراً يفتح اللوحة فيراها فارغة، ومحاولته الكتابة
--  تُرفَض من الخادم لا من الواجهة.
-- =========================================================================

-- ================================================================ الملفات
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  full_name    text,
  role         text not null default 'user'   check (role   in ('user', 'admin')),
  status       text not null default 'active' check (status in ('active', 'suspended')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists profiles_role_idx on public.profiles (role);

-- كل حساب جديد يحصل على ملف تلقائياً. لو تُرك هذا للواجهة لظهر أي مستخدم
-- أنشأ حسابه ثم أغلق المتصفح قبل اكتمال الطلب كحساب بلا ملف — فلا يراه
-- المدير ولا تسري عليه قواعد الحالة.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- الحسابات التي أُنشئت قبل هذه الهجرة
insert into public.profiles (id, email, created_at)
select u.id, u.email, u.created_at from auth.users u
on conflict (id) do nothing;

-- ======================================================== دوال الصلاحية
-- security definer ضروري هنا: السياسات على profiles تحتاج قراءة profiles،
-- وبدون تجاوز RLS داخل الدالة تدخل السياسة في استدعاء ذاتي لا نهائي.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'active'
  );
$$;

create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_active() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;

-- حارس التصعيد: بدونه يستطيع أي مستخدم أن يرقّي نفسه إلى مدير بطلب
-- تعديل واحد على صفّه، لأن سياسة "عدّل ملفك" تسمح له بالكتابة فيه.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_admin() then
    raise exception 'تغيير الدور أو الحالة مقصور على المدير.';
  end if;

  -- إزالة آخر مدير تترك النظام بلا أحد يملك الدخول للوحة، ولا سبيل
  -- لاستعادته إلا من محرر SQL في لوحة سوبابيز.
  if old.role = 'admin' and new.role is distinct from 'admin'
     and (select count(*) from public.profiles where role = 'admin' and status = 'active') <= 1 then
    raise exception 'لا يمكن إزالة آخر مدير في النظام.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ------------------------------------------------------------ RLS الملفات
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- ================================================== أحداث الاستخدام
-- صفّ واحد لكل عملية تصدير مكتملة. نسجّل العدد لا الأسماء ولا المحتوى:
-- الإحصاءات لا تحتاج بيانات المستخدمين، والنظام يَعِد بأن الملفات لا تغادر
-- الجهاز.
create table if not exists public.usage_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('certificates', 'crops', 'posts')),
  count      integer not null default 1 check (count > 0),
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_time_idx on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_time_idx      on public.usage_events (created_at desc);

alter table public.usage_events enable row level security;

drop policy if exists "usage_insert_own" on public.usage_events;
create policy "usage_insert_own" on public.usage_events
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_active());

drop policy if exists "usage_select_own_or_admin" on public.usage_events;
create policy "usage_select_own_or_admin" on public.usage_events
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ================================================== القوالب المشتركة
create table if not exists public.shared_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  path       text not null,
  width      integer,
  height     integer,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.shared_templates enable row level security;

drop policy if exists "shared_templates_read_all" on public.shared_templates;
create policy "shared_templates_read_all" on public.shared_templates
  for select to authenticated
  using (public.is_active());

drop policy if exists "shared_templates_write_admin" on public.shared_templates;
create policy "shared_templates_write_admin" on public.shared_templates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shared-templates', 'shared-templates', true, 20971520,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shared_templates_storage_read" on storage.objects;
create policy "shared_templates_storage_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'shared-templates');

drop policy if exists "shared_templates_storage_write" on storage.objects;
create policy "shared_templates_storage_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'shared-templates' and public.is_admin())
  with check (bucket_id = 'shared-templates' and public.is_admin());

-- ============================================ تحديث صلاحيات المشاريع
-- المدير يقرأ كل المشاريع (لا يعدّلها)، والموقوف لا يكتب شيئاً.
drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_select_own_or_admin" on public.projects;
create policy "projects_select_own_or_admin" on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_active());

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_active())
  with check (user_id = (select auth.uid()));

-- ================================================== قراءات اللوحة
-- security_invoker: العرض لا يتجاوز RLS، بل يطبّق صلاحيات من يستعلم —
-- فالمدير يرى الجميع والمستخدم العادي يرى صفّه وحده، بتعريف واحد.
create or replace view public.admin_user_stats
with (security_invoker = on) as
select
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.status,
  p.created_at,
  p.last_seen_at,
  (select count(*) from public.projects pr where pr.user_id = p.id)                     as projects_count,
  coalesce((select sum(e.count) from public.usage_events e where e.user_id = p.id), 0)  as generated_count,
  (select max(e.created_at) from public.usage_events e where e.user_id = p.id)          as last_activity
from public.profiles p;

grant select on public.admin_user_stats to authenticated;

-- النشاط اليومي للرسم البياني. PostgREST لا يُجمِّع (GROUP BY) من الواجهة،
-- فالتجميع يتم هنا. الدالة تعمل بصلاحيات المستدعي، فتحكمها سياسات
-- usage_events نفسها.
create or replace function public.usage_by_day(days integer default 30)
returns table (day date, total bigint)
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', e.created_at)::date as day, sum(e.count)::bigint as total
  from public.usage_events e
  where e.created_at >= now() - make_interval(days => greatest(days, 1))
  group by 1
  order by 1;
$$;

grant execute on function public.usage_by_day(integer) to authenticated;

-- آخر ظهور: تُستدعى عند فتح التطبيق، وتكتب في صفّ صاحبها وحده.
create or replace function public.touch_last_seen()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now() where id = (select auth.uid());
$$;

revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;
