-- =========================================================================
--  دخول الموظفين برمز من ثلاثة أرقام.
--
--  تحذير مقصود توثيقه هنا: ثلاثة أرقام = ١٠٠٠ احتمال. من يعرف الرابط
--  يستطيع تجريبها كلها. الاختيار اختيار صاحب النظام، والتخفيف الموجود
--  هو تحديد المحاولات لكل عنوان IP في دالة الحافة staff-login — وهو
--  يبطئ الهجوم ولا يمنعه. لا يُوضع في هذا النظام ما لا يُحتمل تسريبه.
--
--  الرمز مخزَّن كنص صريح لا مجزّأً عمداً: المدير يجب أن يقرأه ليعطيه
--  للموظف. ومع ٣ أرقام لا فرق أمني يُذكر بين التجزئة والنص الصريح —
--  ألف احتمال تُجرَّب على أي تجزئة في أجزاء من الثانية.
-- =========================================================================

create table if not exists public.staff_codes (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  code         text not null unique check (code ~ '^[0-9]{3}$'),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  last_used_at timestamptz
);

alter table public.staff_codes enable row level security;

-- المدير يقرأ الرموز ليسلّمها لأصحابها. لا سياسة كتابة إطلاقاً: الإنشاء
-- والتجديد يمرّان بدالة الحافة وحدها، لأنهما يحتاجان مفتاح الخدمة لإنشاء
-- حساب المصادقة نفسه — ومفتاح الخدمة لا يصل المتصفح أبداً.
drop policy if exists "staff_codes_admin_read" on public.staff_codes;
create policy "staff_codes_admin_read" on public.staff_codes
  for select to authenticated
  using (public.is_admin());

-- صاحب الرمز يرى رمزه هو (ليعرضه في حسابه إن احتاج)
drop policy if exists "staff_codes_own_read" on public.staff_codes;
create policy "staff_codes_own_read" on public.staff_codes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------------ محاولات الدخول
-- سجلّ المحاولات لتحديد المعدّل. لا سياسات RLS إطلاقاً على هذا الجدول:
-- دالة الحافة وحدها تكتب فيه بمفتاح الخدمة الذي يتجاوز RLS، ولا يملك
-- المتصفح — بأي مفتاح — قراءته أو الكتابة فيه.
create table if not exists public.staff_login_attempts (
  id      bigint generated always as identity primary key,
  ip      text not null,
  ok      boolean not null default false,
  at      timestamptz not null default now()
);

create index if not exists staff_login_attempts_ip_time_idx
  on public.staff_login_attempts (ip, at desc);

alter table public.staff_login_attempts enable row level security;

-- ------------------------------------------------------------- التنظيف
-- سجلّ المحاولات ينمو بلا حدّ. الاحتفاظ بيوم واحد يكفي لتحديد المعدّل.
create or replace function public.prune_login_attempts()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.staff_login_attempts where at < now() - interval '1 day';
$$;

revoke all on function public.prune_login_attempts() from public;

-- ------------------------------------------------- عرض الموظفين للمدير
-- يجمع الملف والرمز وإحصاءات الاستخدام في صفّ واحد. security_invoker
-- يعني أن سياسات profiles و staff_codes هي التي تحكم من يرى ماذا.
create or replace view public.staff_directory
with (security_invoker = on) as
select
  p.id,
  p.full_name,
  p.email,
  p.role,
  p.status,
  p.created_at,
  p.last_seen_at,
  s.code,
  s.last_used_at,
  (select count(*) from public.projects pr where pr.user_id = p.id) as projects_count
from public.profiles p
join public.staff_codes s on s.user_id = p.id;

grant select on public.staff_directory to authenticated;
