import { getSupabase } from './supabase.js';

/* =========================================================================
 *  الموظفون: الدخول بالرمز، وإدارة الحسابات من لوحة المدير.
 *
 *  إنشاء الحسابات وتحويل الرمز إلى جلسة يجريان في دالتي حافة، لأن
 *  كليهما يحتاج مفتاح الخدمة. هذا الملف مجرد واجهة نداء لهما.
 * ========================================================================= */

/** رسالة الخطأ الحقيقية تصل في جسم الاستجابة لا في error.message. */
async function unwrap(error, fallback) {
  try {
    const body = await error?.context?.json();
    if (body?.error) return new Error(body.error);
  } catch {
    /* الاستجابة ليست JSON — نكتفي بالرسالة العامة */
  }
  return new Error(fallback);
}

/* ------------------------------------------------------------- الموظف */

/** يبدّل رمز الثلاث أرقام بجلسة كاملة. */
export async function loginWithCode(code) {
  const supabase = await getSupabase();

  const { data, error } = await supabase.functions.invoke('staff-login', { body: { code } });
  if (error) throw await unwrap(error, 'تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.');
  if (!data?.token_hash) throw new Error('استجابة غير متوقعة من الخادم.');

  // الخادم لا يستطيع تسليمنا جلسة جاهزة، بل رمزاً مُجزّأً لمرة واحدة —
  // والمتصفح هو من يبادله بجلسة، فتُخزَّن وتُجدَّد تلقائياً كأي دخول عادي.
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: 'magiclink',
  });
  if (verifyError) throw new Error('تعذّر إتمام الدخول: ' + verifyError.message);
}

/* -------------------------------------------------------------- المدير */

/** قائمة الموظفين مع رموزهم — السياسات تحصرها بالمدير. */
export async function listStaff() {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('staff_directory')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createStaff(fullName) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('staff-admin', {
    body: { action: 'create', full_name: fullName },
  });
  if (error) throw await unwrap(error, 'تعذّر إنشاء حساب الموظف.');
  return data; // { code, email, user_id }
}

export async function regenerateCode(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke('staff-admin', {
    body: { action: 'regenerate', user_id: userId },
  });
  if (error) throw await unwrap(error, 'تعذّر تجديد الرمز.');
  return data.code;
}
