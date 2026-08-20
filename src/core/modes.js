/* =========================================================================
 *  تعريف الأقسام في مكان واحد.
 *
 *  كانت هذه القائمة داخل Dashboard.jsx وحدها. الآن تحتاجها لوحة المدير
 *  أيضاً (لاختيار قسم القالب، ولتحديد أقسام كل موظف)، وتكرارها يعني أن
 *  إضافة قسم جديد تتطلب تذكّر ثلاثة ملفات — وأول ما يُنسى هو الثالث.
 * ========================================================================= */

export const MODES = [
  {
    id: 'auto',
    icon: 'settings',
    title: 'أتمتة',
    desc: 'توليد دفعة شهادات كاملة من ملف إكسل دفعة واحدة.',
  },
  {
    id: 'manual',
    icon: 'pen',
    title: 'يدوي',
    desc: 'إضافة نصوص وصور يدوياً على شهادة أو صورة واحدة.',
  },
  {
    id: 'crop',
    icon: 'scissors',
    title: 'قص جماعي',
    desc: 'قص عدة صور بنفس أبعاد قالب واحد وتطبيقه عليها جميعاً.',
  },
  {
    id: 'posts',
    icon: 'sparkles',
    title: 'نصوص',
    desc: 'توليد نصوص منشورات جاهزة عبر الذكاء الاصطناعي.',
  },
];

/** الأقسام التي لها قالب صورة — "نصوص" يولّد كلاماً لا صوراً. */
export const TEMPLATE_MODES = ['auto', 'manual', 'crop'];

export const ALL_MODE_IDS = MODES.map((m) => m.id);

export function modeTitle(id) {
  return MODES.find((m) => m.id === id)?.title ?? id;
}

/**
 * الأقسام التي يراها صاحب هذا الملف.
 *
 * بلا ملف — لم يُجلب بعد، أو فشل جلبه — نُعيد كل الأقسام: شاشة فارغة
 * بسبب خلل في الشبكة تبدو عطلاً في النظام، والتقييد هنا تنظيمي لا أمني.
 *
 * أما القائمة الفارغة فتُحترم كما هي: المدير الذي ينزع كل الأقسام عن
 * موظف يقصد ذلك، ولو أعدنا "الكل" لصار نزعها كلها هو أوسع صلاحية ممكنة.
 */
export function allowedModes(profile) {
  if (!profile) return MODES;
  if (profile.role === 'admin') return MODES; // المدير لا يُحجب عنه شيء
  const allowed = profile.allowed_modes;
  if (!Array.isArray(allowed)) return MODES;
  return MODES.filter((m) => allowed.includes(m.id));
}
