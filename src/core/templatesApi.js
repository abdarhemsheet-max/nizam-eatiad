import { getSupabase } from './supabase.js';

/* =========================================================================
 *  القوالب المشتركة — القراءة.
 *
 *  ملف مستقل عن adminApi.js عمداً: التطبيق العادي يحتاج قراءة القوالب،
 *  ولا يجوز أن يسحب معها كود إدارة المستخدمين والأدوار إلى حزمته.
 *  الكتابة (الرفع والحذف) تبقى في adminApi.js لأنها للمدير وحده.
 * ========================================================================= */

export const SHARED_BUCKET = 'shared-templates';

/** قوالب قسم واحد، الأحدث أولاً. تعود فارغة لغير المسجّلين بفعل RLS. */
export async function listTemplatesForMode(mode) {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from('shared_templates')
    .select('id, name, path, width, height, mode')
    .eq('mode', mode)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((t) => ({
    ...t,
    url: supabase.storage.from(SHARED_BUCKET).getPublicUrl(t.path).data.publicUrl,
  }));
}
