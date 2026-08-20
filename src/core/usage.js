import { getSupabase, SUPABASE_READY } from './supabase.js';
import { getSession } from './session.js';

/* =========================================================================
 *  تسجيل الاستخدام: صفّ واحد بعد كل عملية تصدير مكتملة.
 *
 *  ما يُسجَّل هو العدد والنوع فقط — لا أسماء ولا محتوى ولا اسم ملف. وعد
 *  النظام أن الملفات لا تغادر الجهاز يجب أن يبقى صحيحاً حرفياً، وإحصاءات
 *  المدير لا تحتاج أكثر من العدد.
 *
 *  الفشل هنا صامت عمداً: المستخدم أنهى عمله وحصل على ملفاته، فإظهار خطأ
 *  عن جدول إحصاءات لن يفيده بشيء ولن يستطيع فعل شيء حياله.
 * ========================================================================= */

export async function logUsage(kind, count) {
  if (!SUPABASE_READY) return;
  if (!getSession().user) return; // زائر بلا حساب — لا شيء يُنسب إليه
  if (!Number.isFinite(count) || count <= 0) return;

  try {
    const supabase = await getSupabase();
    await supabase.from('usage_events').insert({ kind, count: Math.round(count) });
  } catch {
    /* لا شيء نفعله — التصدير نجح وهو ما يهم المستخدم */
  }
}
