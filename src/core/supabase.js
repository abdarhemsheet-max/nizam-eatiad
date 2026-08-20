/* =========================================================================
 *  عميل Supabase — التسجيل/الدخول وحفظ المشاريع السحابية.
 *
 *  ملاحظة أمان: المفتاح هنا هو المفتاح العام (publishable/anon) المخصص
 *  للتطبيقات العميلة بطبيعته، وليس مفتاح الخدمة السري — فقواعد حماية
 *  الصفوف (RLS) في قاعدة البيانات هي التي تمنع أي مستخدم من قراءة أو
 *  تعديل بيانات غيره.
 *
 *  التحميل كسول عمداً: مكتبة supabase-js وحدها ٦١ كيلوبايت مضغوطة، وهي
 *  أكبر من التطبيق كله عند فتح الصفحة. الدخول اختياري، والأغلبية تستعمل
 *  النظام بلا حساب، فلا معنى لتحميلها على الجميع. تُجلَب عند أول حاجة
 *  فعلية: ضغط زر الدخول، أو جلسة محفوظة سابقاً، أو فتح لوحة المدير.
 * ========================================================================= */

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const SUPABASE_READY = Boolean(url && anonKey);

let clientPromise = null;

/** يعيد العميل (منشئاً إياه عند أول استدعاء)، أو null إن لم تُضبط المفاتيح. */
export function getSupabase() {
  if (!SUPABASE_READY) return Promise.resolve(null);
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, anonKey),
  );
  return clientPromise;
}

/**
 * هل توجد جلسة محفوظة من زيارة سابقة؟
 *
 * يُقرأ من localStorage مباشرة بدل تحميل المكتبة للسؤال — وهذا هو بيت
 * القصيد: الزائر الذي لم يسجّل دخوله قط لا ينزّل المكتبة إطلاقاً.
 * المفتاح من صنع supabase-js وصيغته "sb-<ref>-auth-token".
 *
 * أسوأ ما قد يحدث لو تغيّرت الصيغة يوماً: يظهر زر "تسجيل الدخول" للحظة
 * لمن هو داخل أصلاً، ثم تُصحَّح الحالة فور تحميل المكتبة عند أول تفاعل.
 */
export function hasStoredSession() {
  if (!SUPABASE_READY) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
  } catch {
    /* localStorage محجوب (تصفّح خاص مثلاً) — لا جلسة إذن */
  }
  return false;
}
