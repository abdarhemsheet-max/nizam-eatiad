-- =========================================================================
--  قسم لكل قالب مشترك، وأقسام مسموحة لكل موظف.
--
--  حدّ صريح لما تعنيه "الأقسام المسموحة": هي تحديد لما يراه الموظف في
--  واجهته، لا حاجز أمني. التطبيق كله يعمل في المتصفح، ومن يعدّل الشيفرة
--  في أدوات المطوّر يفتح أي قسم شاء. وهذا مقبول هنا لأن الأقسام لا تفتح
--  بيانات محمية: كلها أدوات تعمل على ملفات المستخدم نفسه على جهازه.
--  ما يحمي البيانات فعلاً — المشاريع والقوالب والإحصاءات — يبقى RLS.
-- =========================================================================

-- ------------------------------------------------- قسم القالب المشترك
-- وضع "المنشورات" (posts) لا قالب له — نصوص فقط — فلا يظهر هنا.
alter table public.shared_templates
  add column if not exists mode text not null default 'manual';

alter table public.shared_templates
  drop constraint if exists shared_templates_mode_check;

alter table public.shared_templates
  add constraint shared_templates_mode_check check (mode in ('auto', 'manual', 'crop'));

create index if not exists shared_templates_mode_idx on public.shared_templates (mode);

-- --------------------------------------------- الأقسام المسموحة للموظف
-- الافتراضي كل الأقسام: الحسابات القائمة قبل هذه الهجرة لا يجوز أن تفقد
-- ما كانت تستعمله فجأة.
alter table public.profiles
  add column if not exists allowed_modes text[] not null
  default array['auto', 'manual', 'crop', 'posts']::text[];

alter table public.profiles
  drop constraint if exists profiles_allowed_modes_check;

alter table public.profiles
  add constraint profiles_allowed_modes_check
  check (allowed_modes <@ array['auto', 'manual', 'crop', 'posts']::text[]);

-- ------------------------------------------------------- حارس الصلاحيات
-- allowed_modes يجب أن يُحرَس كما يُحرَس الدور والحالة: سياسة
-- profiles_update_own_or_admin تسمح للموظف بتعديل صفّه، فبدون هذا يفتح
-- لنفسه كل الأقسام بطلب واحد.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role         is distinct from old.role
   or new.status       is distinct from old.status
   or new.allowed_modes is distinct from old.allowed_modes) then
    -- auth.uid() فارغة = سياق خادم موثوق (مفتاح الخدمة / هجرة / محرر SQL)
    if (select auth.uid()) is not null and not public.is_admin() then
      raise exception 'تغيير الدور أو الحالة أو الأقسام مقصور على المدير.';
    end if;
  end if;

  -- إزالة آخر مدير تترك النظام بلا أحد يملك الدخول للوحة. هذا القيد يبقى
  -- سارياً على الجميع بمن فيهم الخادم — لأنه حماية من الخطأ لا من التسلل.
  if old.role = 'admin' and new.role is distinct from 'admin'
     and (select count(*) from public.profiles where role = 'admin' and status = 'active') <= 1 then
    raise exception 'لا يمكن إزالة آخر مدير في النظام.';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------- تحديث عروض اللوحة
-- إسقاط ثم إنشاء لا "create or replace": الأخيرة لا تسمح بإدراج عمود
-- جديد في وسط قائمة أعمدة العرض، بل تعتبره إعادة تسمية للعمود التالي.
drop view if exists public.staff_directory;
create view public.staff_directory
with (security_invoker = on) as
select
  p.id,
  p.full_name,
  p.email,
  p.role,
  p.status,
  p.allowed_modes,
  p.created_at,
  p.last_seen_at,
  s.code,
  s.last_used_at,
  (select count(*) from public.projects pr where pr.user_id = p.id) as projects_count
from public.profiles p
join public.staff_codes s on s.user_id = p.id;

grant select on public.staff_directory to authenticated;

drop view if exists public.admin_user_stats;
create view public.admin_user_stats
with (security_invoker = on) as
select
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.status,
  p.allowed_modes,
  p.created_at,
  p.last_seen_at,
  (select count(*) from public.projects pr where pr.user_id = p.id)                     as projects_count,
  coalesce((select sum(e.count) from public.usage_events e where e.user_id = p.id), 0)  as generated_count,
  (select max(e.created_at) from public.usage_events e where e.user_id = p.id)          as last_activity
from public.profiles p;

grant select on public.admin_user_stats to authenticated;
