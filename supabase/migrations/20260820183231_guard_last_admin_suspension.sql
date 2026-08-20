-- =========================================================================
--  سدّ ثغرة إقفال النظام: إيقاف آخر مدير فعّال.
--
--  الحارس السابق كان يمنع نزع الدور عن آخر مدير، لكنه لم يفحص الحالة —
--  و is_admin() تشترط الاثنين معاً (role = 'admin' و status = 'active').
--  فكان إيقاف حساب آخر مدير يمرّ بلا اعتراض، ويترك النظام بلا أحد يستطيع
--  فتح اللوحة ولا إعادة تفعيل أحد: كل طريق للإصلاح يمرّ بمدير فعّال.
--
--  الخروج من تلك الحالة كان يتطلب محرر SQL في لوحة سوبابيز — وهو ما لا
--  يعرفه بالضرورة من يدير النظام يومياً.
--
--  الآن الشرط واحد: لا يجوز أن ينتقل آخر مدير فعّال إلى حالة يفقد فيها
--  الصلاحية، سواء بنزع الدور أو بالإيقاف.
-- =========================================================================

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_admins integer;
begin
  if (new.role          is distinct from old.role
   or new.status        is distinct from old.status
   or new.allowed_modes is distinct from old.allowed_modes) then
    -- auth.uid() فارغة = سياق خادم موثوق (مفتاح الخدمة / هجرة / محرر SQL)
    if (select auth.uid()) is not null and not public.is_admin() then
      raise exception 'تغيير الدور أو الحالة أو الأقسام مقصور على المدير.';
    end if;
  end if;

  -- "مدير فعّال" = الدور admin والحالة active معاً، وهو تعريف is_admin()
  -- نفسه. أي انتقال يُخرج الصفّ من هذا الوصف يُحسب فقداناً لمدير.
  if old.role = 'admin' and old.status = 'active'
     and (new.role is distinct from 'admin' or new.status is distinct from 'active') then

    select count(*) into active_admins
    from public.profiles
    where role = 'admin' and status = 'active';

    if active_admins <= 1 then
      raise exception 'لا يمكن إيقاف آخر مدير فعّال أو نزع صلاحيته — لن يبقى من يدير النظام.';
    end if;
  end if;

  return new;
end;
$$;
