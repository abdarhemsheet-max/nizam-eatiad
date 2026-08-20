import { getSupabase } from './supabase.js';

/* =========================================================================
 *  استعلامات لوحة المدير.
 *
 *  لا يوجد في هذا الملف أي تحقّق من الصلاحية، وهذا مقصود: التحقّق في
 *  المتصفح يخدع نفسه فقط — من يفتح أدوات المطوّر يتجاوزه في ثوانٍ. كل
 *  استعلام هنا يعود فارغاً ("[]") لغير المدير، وكل كتابة يرفضها الخادم،
 *  بفعل سياسات RLS ودالة is_admin() في قاعدة البيانات.
 * ========================================================================= */

const SHARED_BUCKET = 'shared-templates';

/* ------------------------------------------------------------ المستخدمون */

/** كل المستخدمين مع عدد مشاريعهم وإجمالي ما ولّدوه وآخر نشاط لهم. */
export async function listUsers() {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('admin_user_stats')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** مشاريع مستخدم بعينه — تُطلَب عند فتح صفّه لا مع القائمة كلها. */
export async function listUserProjects(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, mode, template_name, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setUserRole(userId, role) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(translate(error.message));
}

export async function setUserStatus(userId, status) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('profiles').update({ status }).eq('id', userId);
  if (error) throw new Error(translate(error.message));
}

/** رسائل مُحفِّز قاعدة البيانات تصل كنص خام داخل رسالة الخطأ. */
function translate(message) {
  if (message.includes('آخر مدير')) return 'لا يمكن إزالة آخر مدير في النظام.';
  if (message.includes('مقصور على المدير')) return 'هذا الإجراء مقصور على المدير.';
  return message;
}

/* ------------------------------------------------------------- الإحصاءات */

/** أرقام الصدارة: تُحسب من نفس صفوف المستخدمين فلا تحتاج طلباً إضافياً. */
export function summarize(users) {
  return {
    users: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    suspended: users.filter((u) => u.status === 'suspended').length,
    projects: users.reduce((sum, u) => sum + Number(u.projects_count || 0), 0),
    generated: users.reduce((sum, u) => sum + Number(u.generated_count || 0), 0),
  };
}

/** النشاط اليومي خلال آخر N يوماً، بعد ملء الأيام الخالية بصفر. */
export async function usageByDay(days = 30) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('usage_by_day', { days });
  if (error) throw new Error(error.message);

  const found = new Map((data ?? []).map((r) => [r.day, Number(r.total)]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    series.push({ day: key, total: found.get(key) ?? 0 });
  }
  return series;
}

/* ------------------------------------------------------- القوالب المشتركة */

export async function listSharedTemplates() {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('shared_templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((t) => ({
    ...t,
    url: supabase.storage.from(SHARED_BUCKET).getPublicUrl(t.path).data.publicUrl,
  }));
}

/** أبعاد الصورة تُقرأ في المتصفح قبل الرفع — القالب بلا أبعاد لا ينفع. */
function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذّر قراءة الصورة — تأكّد أنها ملف صورة سليم.'));
    };
    img.src = url;
  });
}

export async function uploadSharedTemplate(file) {
  const supabase = await getSupabase();
  const { width, height } = await readImageSize(file);

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `shared_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(SHARED_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/png', upsert: false });
  if (upErr) throw new Error('فشل رفع الصورة: ' + upErr.message);

  const { error } = await supabase
    .from('shared_templates')
    .insert({ name: file.name, path, width, height });

  // الصف لم يُسجَّل، فالصورة المرفوعة صارت يتيمة في المخزن — نحذفها بدل
  // تركها تستهلك المساحة بلا أي مرجع إليها.
  if (error) {
    await supabase.storage.from(SHARED_BUCKET).remove([path]);
    throw new Error('فشل حفظ القالب: ' + translate(error.message));
  }
}

export async function deleteSharedTemplate(template) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('shared_templates').delete().eq('id', template.id);
  if (error) throw new Error(translate(error.message));
  await supabase.storage.from(SHARED_BUCKET).remove([template.path]);
}
