import { supabase } from './supabase.js';
import { useStore } from './store.js';

/* =========================================================================
 *  المشاريع السحابية (Supabase): حفظ مشروع كامل — القالب (الصورة) والحقول
 *  والنصوص — واسترجاعه في أي وقت. كل مستخدم يرى مشاريعه هو فقط (RLS).
 * ========================================================================= */

const BUCKET = 'templates';

/** تحميل صورة قالب إلى المخزن والعودة بمسارها داخل المجلد، أو null بلا صورة. */
async function uploadTemplateImage(userId, templateImage) {
  if (!templateImage?.url) return { path: null, name: null };

  const ext = (templateImage.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileName = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || 'png'}`;

  const blob = await (await fetch(templateImage.url)).blob();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${userId}/${fileName}`, blob, { contentType: blob.type || 'image/png', upsert: false });
  if (error) throw new Error('فشل رفع صورة القالب: ' + error.message);

  return { path: `${userId}/${fileName}`, name: templateImage.name };
}

/** تحميل صورة قالب من رابط عام (مخزن سوبابيز) وضبط أبعادها الطبيعية. */
function setTemplateFromUrl(url, name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      useStore.setState({ templateImage: { url, name, width: img.naturalWidth, height: img.naturalHeight } });
      resolve();
    };
    img.onerror = () => reject(new Error('تعذّر تحميل صورة القالب المحفوظة.'));
    img.src = url;
  });
}

/** حفظ المشروع الحالي (القالب + حقول الوضعين + وضع العمل). */
export async function saveProject(name) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('يجب تسجيل الدخول أولاً.');

  const s = useStore.getState();
  const { templateImage, activeFields, stashedFields, mode, zoom, excelData } = s;

  const hasWork =
    Boolean(templateImage) ||
    Object.keys(activeFields).length > 0 ||
    Object.keys(stashedFields.auto).length > 0 ||
    Object.keys(stashedFields.manual).length > 0;
  if (!hasWork) throw new Error('لا يوجد عمل لحفظه — أضف قالباً أو حقولاً أولاً.');

  const { path, name: templateName } = await uploadTemplateImage(user.id, templateImage);

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name,
      template_path: path,
      template_name: templateName,
      mode,
      zoom,
      excel_name: excelData?.name ?? null,
      fields: { active: activeFields, stashed: stashedFields },
    })
    .select()
    .single();

  if (error) throw new Error('فشل حفظ المشروع: ' + error.message);
  return data;
}

/** قائمة مشاريع المستخدم (الأحدث أولاً). */
export async function listProjects() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** استرجاع مشروع محفوظ ووضعه كعمل جاهز في بيئة العمل. */
export async function loadProject(id) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error) throw new Error('فشل تحميل المشروع: ' + error.message);

  const fields = data.fields ?? {};
  if (data.template_path) {
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(data.template_path);
    await setTemplateFromUrl(pub.publicUrl, data.template_name || 'قالب محفوظ');
  }

  useStore.setState({
    stashedFields: fields.stashed ?? { auto: {}, manual: {} },
    activeFields: fields.active ?? {},
    mode: data.mode ?? 'auto',
    zoom: data.zoom ?? 1,
    excelData: null,
  });

  return data;
}

/** حذف مشروع محفوظ (مع صورته من المخزن). */
export async function deleteProject(id) {
  const { data: project, error: getErr } = await supabase.from('projects').select('*').eq('id', id).single();
  if (getErr) throw new Error(getErr.message);
  if (project?.template_path) {
    await supabase.storage.from(BUCKET).remove([project.template_path]);
  }
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error('فشل حذف المشروع: ' + error.message);
}
