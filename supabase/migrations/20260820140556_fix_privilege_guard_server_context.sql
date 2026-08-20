-- =========================================================================
--  إصلاح حارس الصلاحيات: السماح بسياق الخادم.
--
--  المشكلة: الحارس كان يشترط public.is_admin() لأي تغيير في الدور أو
--  الحالة، وهي تعتمد على auth.uid(). وفي سياق الخادم — مفتاح الخدمة، أو
--  هجرة، أو محرر SQL — تكون auth.uid() فارغة، فيرفض الحارس التغيير.
--
--  النتيجة كانت استحالة تعيين أول مدير في نظام لا مدير فيه بعد: لا
--  المتصفح يستطيع (لا مدير يأذن)، ولا الخادم (الحارس يرفض).
--
--  لماذا السماح آمن: مفتاح الخدمة يتجاوز كل سياسات RLS أصلاً، فمن يملكه
--  يملك قاعدة البيانات كاملة — وحراسته بمُحفِّز تمثيل لا حماية. أما طلبات
--  المتصفح فلا تصل هذا المُحفِّز إطلاقاً بـ auth.uid() فارغة: سياسة
--  profiles_update_own_or_admin تشترط (id = auth.uid() or is_admin())،
--  وكلاهما خطأ حين لا هوية، فلا صفّ يُحدَّث من الأساس.
-- =========================================================================

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status) then
    -- auth.uid() فارغة = سياق خادم موثوق (مفتاح الخدمة / هجرة / محرر SQL)
    if (select auth.uid()) is not null and not public.is_admin() then
      raise exception 'تغيير الدور أو الحالة مقصور على المدير.';
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
