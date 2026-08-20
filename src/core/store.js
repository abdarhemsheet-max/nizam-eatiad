import { create } from 'zustand';

/* =========================================================================
 *  نظام اعتياد — المخزن المركزي (Zustand)
 *
 *  ملاحظة معمارية مهمة:
 *  كل إحداثيات الحقول (x, y) وحجم الخط (size) تُخزَّن بـ "بكسل الصورة الأصلية"
 *  (natural pixels) وليس بكسل الشاشة. مساحة العمل ترسم الصورة بحجمها الطبيعي
 *  ثم تُكبّر/تُصغّر بصرياً عبر CSS transform: scale(zoom).
 *  النتيجة: التكبير لا يؤثر إطلاقاً على البيانات المخزنة، وتصدير المرحلة الثالثة
 *  (رسم على Canvas) يصبح مطابقة 1:1 بدون أي معادلات تحويل.
 * ========================================================================= */

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3.0;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 250;
export const MIN_IMAGE_SIZE = 15;
export const CROP_MAX_IMAGES = 30;

export const SYSTEM_FONTS = ['Arial', 'Tahoma', 'Times New Roman'];
export const GOOGLE_FONTS = ['Cairo', 'Tajawal', 'Almarai', 'Amiri', 'Changa'];

/** تحميل خط جوجل ديناميكياً عند الحاجة فقط (مرة واحدة لكل خط). */
export function ensureFontLoaded(fontName) {
  if (!fontName || fontName === 'custom') return;
  if (SYSTEM_FONTS.includes(fontName)) return;
  if (!GOOGLE_FONTS.includes(fontName)) return;

  const id = 'font-' + fontName.replace(/\s+/g, '-');
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(
    /\s+/g,
    '+'
  )}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

/** الاسم النهائي للخط (يراعي خيار "خط من جهازك"). */
export function resolveFontName(field) {
  if (field.font === 'custom') return field.customFont.trim() || 'Arial';
  return field.font;
}

/** سلسلة الظل النهائية — "none" إذا كانت كل القيم أصفاراً. */
export function resolveShadow(field) {
  const { shadowX, shadowY, shadowBlur, shadowColor } = field;
  if (!shadowX && !shadowY && !shadowBlur) return 'none';
  return `${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowColor}`;
}

/** النص المعروض في المعاينة: نص يدوي ثابت، أو أطول قيمة في عمود الإكسل. */
export function previewText(field) {
  if (field.type === 'image') return '';
  return field.kind === 'manual' ? field.text || 'نص جديد' : field.sample;
}

/** ستايل طبقة الصورة — يقابل ما يرسمه المحرك على Canvas. */
export function fieldImageStyle(field) {
  const shadow = resolveShadow(field);
  return {
    width: `${field.w}px`,
    height: `${field.h}px`,
    opacity: field.opacity / 100,
    transform: `rotate(${field.rotation}deg)`,
    filter:
      shadow === 'none'
        ? 'none'
        : `drop-shadow(${field.shadowX}px ${field.shadowY}px ${field.shadowBlur}px ${field.shadowColor})`,
  };
}

/** ستايل النص المشترك بين المعاينة والتصدير. */
export function fieldTextStyle(field) {
  return {
    fontFamily: `"${resolveFontName(field)}", sans-serif`,
    fontSize: `${field.size}px`,
    color: field.color,
    fontWeight: field.bold ? 'bold' : 'normal',
    letterSpacing: `${field.letterSpacing}px`,
    opacity: field.opacity / 100,
    transform: `rotate(${field.rotation}deg)`,
    textShadow: resolveShadow(field),
    // محاذاة الأسطر داخل الصندوق — مهمة للنص متعدد الأسطر
    textAlign: field.align,
    // الحد الخارجي: WebKit يرسمه فوق التعبئة، وهو ما يفعله strokeText بعد fillText
    WebkitTextStrokeWidth: field.strokeWidth ? `${field.strokeWidth}px` : '0',
    WebkitTextStrokeColor: field.strokeColor,
  };
}

/**
 * قياس إزاحة خط الأساس وارتفاع السطر بالمتصفح نفسه.
 * ننشئ عنصراً بنفس خصائص .preview-text ونضع بداخله علامة صفرية الارتفاع
 * محاذاة على baseline — أعلى العلامة يساوي خط الأساس بالضبط.
 *
 * تعيش هنا لا في exporter.js لأن لوحة الإعدادات تحتاجها (أزرار التوسيط)،
 * فلا يُحمَّل محرك التصدير الثقيل (jspdf/fflate) لمجرد قياس سطر.
 */
export function measureLineMetrics(field) {
  const box = document.createElement('div');
  box.setAttribute('dir', 'rtl');
  box.style.cssText =
    'position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;line-height:normal;';
  box.style.fontFamily = `"${field.family ?? resolveFontName(field)}", sans-serif`;
  box.style.fontSize = `${field.size}px`;
  box.style.fontWeight = field.bold ? 'bold' : 'normal';
  box.style.letterSpacing = `${field.letterSpacing}px`;
  // سطر واحد يكفي: ارتفاع السطر وخط الأساس لا يعتمدان على المحتوى
  box.textContent = (previewText(field) || 'نص').split('\n')[0] || 'نص';

  const marker = document.createElement('span');
  marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
  box.appendChild(marker);

  document.body.appendChild(box);
  const boxRect = box.getBoundingClientRect();
  const metrics = {
    baseline: marker.getBoundingClientRect().top - boxRect.top,
    lineHeight: boxRect.height,
  };
  box.remove();
  return metrics;
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** قراءة/كتابة آمنتان لـ localStorage — يفشل بصمت في المتصفح الخاص (Private Mode). */
function readLocalStorage(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* المتصفح الخاص أو التخزين ممتلئ — التطبيق يواصل العمل بلا حفظ */
  }
}

/** أطول نص في عمود معيّن — يُستخدم كنص معاينة واقعي. */
function longestTextInColumn(rows, colIndex) {
  let longest = '';
  for (const row of rows) {
    const cell = row?.[colIndex];
    if (cell === undefined || cell === null) continue;
    const text = String(cell).trim();
    if (text.length > longest.length) longest = text;
  }
  return longest || 'نص تجريبي';
}

/**
 * حقل واحد على الشهادة. النوعان يتشاركان كل خصائص التنسيق:
 *  - auto:   نصه يأتي من عمود إكسل (colIndex)، و sample للمعاينة فقط.
 *  - manual: نصه ثابت يكتبه المستخدم (text).
 */
const createField = ({
  id,
  kind,
  type = 'text', // text | image
  column,
  colIndex = null,
  sample = '',
  text = '',
  src = null,
  naturalW = 0,
  naturalH = 0,
  w = 0,
  h = 0,
  canvasW,
  canvasH,
  yOffset = 0,
  z = 0,
}) => ({
  id,
  kind,
  type,
  column,
  colIndex,
  sample,
  text,
  // خاص بطبقات الصور
  src,
  naturalW,
  naturalH,
  w,
  h,
  lockAspect: true,
  visible: true,
  z, // ترتيب الطبقة: الأكبر في المقدمة
  // الموضع بإحداثيات الصورة الأصلية.
  // (x) هي نقطة الإرساء وليست دائماً الحافة اليسرى — تعتمد على المحاذاة أدناه.
  x: Math.round(canvasW * 0.5),
  y: Math.round(canvasH * 0.4 + yOffset),
  align: 'center', // center | right | left — تُطابق ctx.textAlign عند التصدير
  // الخط الأساسي
  font: 'Cairo',
  customFont: '',
  size: 36,
  color: '#000000',
  bold: false,
  // إعدادات متقدمة
  letterSpacing: 0,
  opacity: 100,
  rotation: 0,
  // الحد الخارجي (Stroke)
  strokeColor: '#ffffff',
  strokeWidth: 0,
  // الظل
  shadowColor: '#000000',
  shadowBlur: 0,
  shadowX: 0,
  shadowY: 0,
});

/** أعلى ترتيب طبقة + 1 — تُوضع الطبقات الجديدة في المقدمة. */
const nextZ = (fields) =>
  Object.values(fields).reduce((max, f) => Math.max(max, f.z ?? 0), 0) + 1;

export const useStore = create((set, get) => ({
  /* ------------------------------- الحالة ------------------------------- */
  // dashboard = الشاشة الرئيسية (مربعات اختيار بيئة العمل) | workspace = بيئة عمل الوضع المحدد
  view: 'dashboard',
  mode: 'auto', // auto = أتمتة من إكسل | manual = صورة واحدة بنصوص يدوية | crop = قص جماعي
  templateImage: null, // { url, name, width, height } — مشتركة بين وضعي أتمتة/يدوي
  excelData: null, // { name, headers, rows }
  activeFields: {}, // حقول الوضع الحالي فقط: { [fieldId]: field }
  stashedFields: { auto: {}, manual: {} }, // حقول الوضع الآخر محفوظة عند التبديل
  manualSeq: 0, // عدّاد تسمية النصوص اليدوية
  selectedFieldId: null,
  zoom: 1,
  exportOptions: { pdf: true, png: true, zip: true, mergePdf: true, directDisk: false },
  fileNameColumn: null, // رقم العمود المستخدم في تسمية الملفات (null = أول حقل مفعّل)

  /* -------------------- وضع القص الجماعي (مستقل عن الوضعين أعلاه) -------------------- */
  cropTemplate: null, // { url, name, width, height } — إطار PNG يُطبَّق فوق كل صورة
  cropImages: [], // [{ id, file, url, name, width, height }] — حتى CROP_MAX_IMAGES
  cropBlurFaces: false, // كشف وتغبيش الوجوه تلقائياً (TensorFlow.js محلياً — بلا رفع أي صورة)
  cropBlurStyle: 'blur', // blur = ضبابي حقيقي | pixelate = تربيعي/فسيفسائي
  // مناطق التغبيش القابلة للتعديل يدوياً، بإحداثيات قالب القص (بعد القص مباشرة):
  // { [photoId]: [{id, x, y, w, h}] }. أول معاينة لصورة تبذر هذا المفتاح تلقائياً
  // من نتيجة الكشف؛ من تلك اللحظة يصبح المصدر الوحيد للحقيقة — يُستخدم كما هو
  // عند التصدير الفعلي بدل إعادة الكشف، فتُحترَم كل تعديلات المستخدم اليدوية.
  cropManualMasks: {},

  /* ------------------- وضع نصوص المنشورات (Groq API) -------------------
   * مفتاح الـ API لا يُخزَّن في الكود إطلاقاً — يُدخله المستخدم في متصفحه
   * فقط ويُحفَظ محلياً (localStorage) على جهازه، ويُرسَل مباشرة من متصفحه
   * إلى Groq بلا أي خادم وسيط، فيبقى النظام "بلا Backend" كما هو مصمَّم. */
  postsApiKey: readLocalStorage('eatiad_groq_key', ''),
  postsModel: readLocalStorage('eatiad_groq_model', 'llama-3.3-70b-versatile'),
  postsInstructions: readLocalStorage('eatiad_posts_instructions', ''),
  postsGeneratedText: '',
  postsGenerating: false,
  postsError: null,
  // سجل التراجع/الإعادة (لقطات من activeFields)
  history: [],
  future: [],
  suppressHistory: false, // يُفعّل أثناء السحب فتُسجَّل لقطة واحدة لا عشرات
  lastHistoryKey: null,
  lastHistoryAt: 0,
  // حالة محرك التوليد
  exportProgress: {
    running: false,
    phase: 'idle', // idle | rendering | zipping | done | cancelled | error
    done: 0,
    total: 0,
    succeeded: 0,
    currentName: '',
    message: '',
    cancelled: false,
    finished: false,
    concurrency: 0,
    // { rowIndex, name, message } — نحتفظ بـ rowIndex لإتاحة "إعادة توليد الفاشلة فقط"
    errors: [],
    // جاهز للتنزيل: لا يبدأ أي تنزيل تلقائياً — المستخدم يضغط الزر صراحة
    downloadReady: null, // { blob, fileName } أو null إن كُتب مباشرة على القرص
    savedToDisk: false, // true إن استخدمنا File System Access API فالملف على القرص فعلاً
  },

  /* ---------------------------- قالب الشهادة ---------------------------- */
  setTemplateImage: (file) => {
    const previous = get().templateImage;
    const url = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {
      if (previous?.url) URL.revokeObjectURL(previous.url);
      set({
        templateImage: {
          url,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        },
      });
      // إعادة توسيط الحقول الموجودة داخل حدود الصورة الجديدة
      const fields = get().activeFields;
      const fixed = {};
      for (const [id, f] of Object.entries(fields)) {
        fixed[id] = {
          ...f,
          x: clamp(f.x, 0, img.naturalWidth),
          y: clamp(f.y, 0, img.naturalHeight),
        };
      }
      set({ activeFields: fixed });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('تعذّر قراءة الصورة. تأكد من صيغة الملف.');
    };
    img.src = url;
  },

  /* -------------------------- قاعدة بيانات إكسل -------------------------- */
  setExcelData: ({ name, headers, rows }) => {
    // إزالة الحقول المفعّلة التي لم تعد أعمدتها موجودة في الملف الجديد
    const kept = {};
    for (const [id, f] of Object.entries(get().activeFields)) {
      if (f.kind === 'manual') kept[id] = f;
      else if (headers[f.colIndex] === f.column) {
        kept[id] = { ...f, sample: longestTextInColumn(rows, f.colIndex) };
      }
    }
    set({ excelData: { name, headers, rows }, activeFields: kept });
  },

  /* --------------------------- وضع القص الجماعي --------------------------- */
  setCropTemplate: (file) => {
    const previous = get().cropTemplate;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (previous?.url) URL.revokeObjectURL(previous.url);
      // مناطق التغبيش اليدوية مخزَّنة بإحداثيات القالب — قالب جديد يُبطلها.
      set({
        cropTemplate: { url, name: file.name, width: img.naturalWidth, height: img.naturalHeight },
        cropManualMasks: {},
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('تعذّر قراءة القالب. تأكد من صيغة الملف (PNG يُفضَّل لدعم الشفافية).');
    };
    img.src = url;
  },

  /** إضافة صور للقص الجماعي — يُقصّ العدد الزائد عن الحد الأقصى مع تنبيه واحد فقط. */
  addCropImages: (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;

    const { cropImages } = get();
    const room = CROP_MAX_IMAGES - cropImages.length;
    if (room <= 0) {
      alert(`الحد الأقصى ${CROP_MAX_IMAGES} صورة. احذف بعض الصور أولاً لإضافة صور جديدة.`);
      return;
    }
    const accepted = files.slice(0, room);
    if (files.length > accepted.length) {
      alert(`أُضيفت ${accepted.length} صورة فقط — الحد الأقصى ${CROP_MAX_IMAGES} صورة إجمالاً.`);
    }

    const entries = accepted.map((file) => ({
      id: `crop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    set({ cropImages: [...cropImages, ...entries] });
  },

  removeCropImage: (id) => {
    const target = get().cropImages.find((i) => i.id === id);
    if (target) URL.revokeObjectURL(target.url);
    const masks = { ...get().cropManualMasks };
    delete masks[id];
    set({ cropImages: get().cropImages.filter((i) => i.id !== id), cropManualMasks: masks });
  },

  clearCropImages: () => {
    get().cropImages.forEach((i) => URL.revokeObjectURL(i.url));
    set({ cropImages: [], cropManualMasks: {} });
  },

  setCropBlurFaces: (value) => set({ cropBlurFaces: value }),
  setCropBlurStyle: (value) => set({ cropBlurStyle: value }),

  /* -------- مناطق التغبيش اليدوية: تحكّم كامل بحجم/موضع كل دائرة، أو
   * إضافة/حذف مناطق بحرّية — مثل أداة قناع (Mask) بسيطة فوق كل صورة -------- */
  setCropMaskRegions: (photoId, regions) =>
    set({ cropManualMasks: { ...get().cropManualMasks, [photoId]: regions } }),

  addCropMaskRegion: (photoId, template) => {
    const existing = get().cropManualMasks[photoId] ?? [];
    const w = Math.round((template?.width ?? 240) * 0.22);
    const h = w;
    const region = {
      id: `mask_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      x: Math.round((template?.width ?? 240) / 2 - w / 2),
      y: Math.round((template?.height ?? 240) / 2 - h / 2),
      w,
      h,
    };
    set({ cropManualMasks: { ...get().cropManualMasks, [photoId]: [...existing, region] } });
  },

  updateCropMaskRegion: (photoId, regionId, patch) => {
    const existing = get().cropManualMasks[photoId] ?? [];
    set({
      cropManualMasks: {
        ...get().cropManualMasks,
        [photoId]: existing.map((r) => (r.id === regionId ? { ...r, ...patch } : r)),
      },
    });
  },

  removeCropMaskRegion: (photoId, regionId) => {
    const existing = get().cropManualMasks[photoId] ?? [];
    set({
      cropManualMasks: { ...get().cropManualMasks, [photoId]: existing.filter((r) => r.id !== regionId) },
    });
  },

  /** إعادة الضبط لهذه الصورة فقط — يحذف تعديلاتها اليدوية فيُعاد الكشف التلقائي من جديد. */
  resetCropMaskRegions: (photoId) => {
    const next = { ...get().cropManualMasks };
    delete next[photoId];
    set({ cropManualMasks: next });
  },

  /* --------------------------- التراجع/الإعادة --------------------------- */
  /**
   * تسجيل لقطة قبل أي تعديل.
   * coalesceKey يمنع إغراق السجل: تحريك نفس الشريط خلال ثانية = خطوة واحدة.
   */
  pushHistory: (coalesceKey = null) => {
    const s = get();
    if (s.suppressHistory) return;
    const now = Date.now();
    if (coalesceKey && coalesceKey === s.lastHistoryKey && now - s.lastHistoryAt < 900) {
      set({ lastHistoryAt: now });
      return;
    }
    set({
      history: [...s.history.slice(-49), s.activeFields],
      future: [],
      lastHistoryKey: coalesceKey,
      lastHistoryAt: now,
    });
  },

  /** لقطة واحدة في بداية السحب، ثم تعطيل التسجيل حتى نهايته. */
  beginInteraction: () => {
    get().pushHistory();
    set({ suppressHistory: true, lastHistoryKey: null });
  },
  endInteraction: () => set({ suppressHistory: false }),

  undo: () => {
    const { history, future, activeFields } = get();
    if (!history.length) return;
    set({
      activeFields: history[history.length - 1],
      history: history.slice(0, -1),
      future: [activeFields, ...future].slice(0, 50),
      lastHistoryKey: null,
    });
  },
  redo: () => {
    const { history, future, activeFields } = get();
    if (!future.length) return;
    set({
      activeFields: future[0],
      history: [...history, activeFields],
      future: future.slice(1),
      lastHistoryKey: null,
    });
  },

  /* ------------------------------- الوضع ------------------------------- */
  /**
   * التبديل بين الأوضاع الثلاثة. أتمتة/يدوي يتشاركان نظام الحقول (activeFields)
   * ويُحفظ حقل كل منهما عند الخروج؛ القص الجماعي مستقل تماماً (بلا حقول ولا
   * قالب مشترك) فلا يمسّ تبديلُه حالة الوضعين الآخرين إطلاقاً.
   */
  setMode: (next) => {
    const current = get().mode;
    if (next === current) return;
    const isFieldMode = (m) => m === 'auto' || m === 'manual';

    const patch = { mode: next, selectedFieldId: null };
    if (isFieldMode(current)) {
      patch.stashedFields = { ...get().stashedFields, [current]: get().activeFields };
    }
    if (isFieldMode(next)) {
      patch.activeFields = get().stashedFields[next] ?? {};
      // السجل خاص بحقول الوضع الحالي، فلا معنى لبقائه بعد التبديل
      patch.history = [];
      patch.future = [];
      patch.lastHistoryKey = null;
    }
    set(patch);
  },

  /** الدخول من الشاشة الرئيسية (المربعات) إلى بيئة عمل الوضع المحدد. */
  enterMode: (next) => {
    get().setMode(next);
    set({ view: 'workspace' });
  },

  /** العودة إلى الشاشة الرئيسية — لا تمسّ بيانات أي وضع، فقط تُخفي بيئة العمل. */
  goHome: () => set({ view: 'dashboard' }),

  /* ------------------------------ الحقول ------------------------------- */
  toggleField: (colIndex) => {
    const { activeFields, excelData, templateImage } = get();
    const id = `field_col_${colIndex}`;

    if (activeFields[id]) {
      get().removeField(id);
      return;
    }

    const field = createField({
      id,
      kind: 'auto',
      column: excelData?.headers?.[colIndex] ?? `عمود ${colIndex + 1}`,
      colIndex,
      sample: longestTextInColumn(excelData?.rows ?? [], colIndex),
      canvasW: templateImage?.width ?? 700,
      canvasH: templateImage?.height ?? 500,
      z: nextZ(activeFields),
    });

    ensureFontLoaded(field.font);
    get().pushHistory();
    set({ activeFields: { ...activeFields, [id]: field }, selectedFieldId: id });
  },

  /** إضافة نص يدوي جديد (الوضع اليدوي). */
  addManualText: (rawText) => {
    const text = (rawText ?? '').trim();
    if (!text) return;
    const { activeFields, templateImage, manualSeq } = get();
    const seq = manualSeq + 1;
    const id = `manual_${seq}`;

    const field = createField({
      id,
      kind: 'manual',
      column: `نص ${seq}`,
      text,
      canvasW: templateImage?.width ?? 700,
      canvasH: templateImage?.height ?? 500,
      // إزاحة تنازلية حتى لا تتكدّس النصوص الجديدة فوق بعضها
      yOffset: ((seq - 1) % 6) * 70,
      z: nextZ(activeFields),
    });

    ensureFontLoaded(field.font);
    get().pushHistory();
    set({
      activeFields: { ...activeFields, [id]: field },
      selectedFieldId: id,
      manualSeq: seq,
    });
  },

  /** إضافة طبقة صورة فوق الصورة الأساسية (الوضع اليدوي) — شعار، توقيع، ختم... */
  addManualImage: (file) => {
    const { templateImage } = get();
    if (!templateImage) return;
    const url = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {
      const { activeFields, manualSeq, templateImage: t } = get();
      const seq = manualSeq + 1;
      const id = `manual_${seq}`;
      const canvasW = t?.width ?? 700;
      const canvasH = t?.height ?? 500;

      // حجم ابتدائي: يملأ 35% من عرض القالب كحد أقصى، بلا تكبير صور صغيرة
      const maxW = canvasW * 0.35;
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const field = createField({
        id,
        kind: 'manual',
        type: 'image',
        column: `صورة ${seq}`,
        src: url,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        w,
        h,
        canvasW,
        canvasH,
        z: nextZ(activeFields),
      });
      // بالنسبة للصور (x, y) هي الزاوية العلوية اليسرى — نوسّطها ابتدائياً
      field.x = Math.round(canvasW / 2 - w / 2);
      field.y = Math.round(canvasH / 2 - h / 2);

      get().pushHistory();
      set({
        activeFields: { ...activeFields, [id]: field },
        selectedFieldId: id,
        manualSeq: seq,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('تعذّر قراءة الصورة. تأكد من صيغة الملف.');
    };
    img.src = url;
  },

  /** نسخ طبقة يدوية (نص أو صورة) بإزاحة بسيطة، وتوضع في المقدمة. */
  duplicateField: (id) => {
    const { activeFields, manualSeq } = get();
    const source = activeFields[id];
    if (!source || source.kind !== 'manual') return;

    const seq = manualSeq + 1;
    const copyId = `manual_${seq}`;
    const copy = {
      ...source,
      id: copyId,
      column: source.type === 'image' ? `صورة ${seq}` : `نص ${seq}`,
      x: source.x + 20,
      y: source.y + 20,
      z: nextZ(activeFields),
    };

    get().pushHistory();
    set({
      activeFields: { ...activeFields, [copyId]: copy },
      selectedFieldId: copyId,
      manualSeq: seq,
    });
  },

  removeField: (id) => {
    const next = { ...get().activeFields };
    const field = next[id];
    if (!field) return;
    delete next[id];
    // src هو object URL خاص بهذه الطبقة فقط (لا تشاركه طبقات أخرى) — يُحرَّر عند الحذف.
    // لا نحرّره عند التراجع (undo) لأن اللقطة المخزَّنة تشير لنفس الـ URL وقد تُستعاد.
    if (field.type === 'image' && field.src) {
      const stillReferenced = [...get().history, ...get().future].some((snap) => snap[id]);
      if (!stillReferenced) URL.revokeObjectURL(field.src);
    }
    get().pushHistory();
    set({
      activeFields: next,
      selectedFieldId: get().selectedFieldId === id ? null : get().selectedFieldId,
    });
  },

  /** تبديل قفل نسبة الأبعاد لطبقة صورة. */
  toggleAspectLock: (id) => {
    const field = get().activeFields[id];
    if (!field) return;
    set({
      activeFields: { ...get().activeFields, [id]: { ...field, lockAspect: !field.lockAspect } },
    });
  },

  /** تغيير أبعاد طبقة صورة (px بمقياس الصورة الأصلية)، مع مراعاة قفل النسبة. */
  resizeImageField: (id, w, h) => {
    const field = get().activeFields[id];
    if (!field || field.type !== 'image') return;
    let nextW = Math.max(MIN_IMAGE_SIZE, Math.round(w));
    let nextH = Math.max(MIN_IMAGE_SIZE, Math.round(h));
    if (field.lockAspect && field.naturalW && field.naturalH) {
      const ratio = field.naturalW / field.naturalH;
      // العنصر الذي تغيّر أكثر هو المرجع — يمنع "تجاذب" الأبعاد عند القفل
      if (Math.abs(nextW - field.w) >= Math.abs(nextH - field.h)) {
        nextH = Math.round(nextW / ratio);
      } else {
        nextW = Math.round(nextH * ratio);
      }
    }
    get().pushHistory(`imgsize:${id}`);
    set({ activeFields: { ...get().activeFields, [id]: { ...field, w: nextW, h: nextH } } });
  },

  toggleVisibility: (id) => {
    const field = get().activeFields[id];
    if (!field) return;
    get().pushHistory();
    set({
      activeFields: { ...get().activeFields, [id]: { ...field, visible: !field.visible } },
    });
  },

  /**
   * تحريك الطبقة في الترتيب: dir = 1 للأمام، -1 للخلف.
   * نبدّل قيمة z مع الجار المباشر في الترتيب.
   */
  moveLayer: (id, dir) => {
    const { activeFields } = get();
    const field = activeFields[id];
    if (!field) return;

    const sorted = Object.values(activeFields).sort((a, b) => a.z - b.z);
    const index = sorted.findIndex((f) => f.id === id);
    const neighbor = sorted[index + dir];
    if (!neighbor) return;

    get().pushHistory();
    set({
      activeFields: {
        ...activeFields,
        [id]: { ...field, z: neighbor.z },
        [neighbor.id]: { ...neighbor, z: field.z },
      },
    });
  },

  updateField: (id, patch) => {
    const field = get().activeFields[id];
    if (!field) return;
    if (patch.font) ensureFontLoaded(patch.font);
    get().pushHistory(`${id}:${Object.keys(patch).join(',')}`);
    set({ activeFields: { ...get().activeFields, [id]: { ...field, ...patch } } });
  },

  /** تحريك حقل (dx, dy بإحداثيات الصورة الأصلية). */
  moveField: (id, x, y) => {
    const { activeFields, templateImage } = get();
    const field = activeFields[id];
    if (!field) return;
    const maxX = templateImage?.width ?? 700;
    const maxY = templateImage?.height ?? 500;
    get().pushHistory(`move:${id}`);
    set({
      activeFields: {
        ...activeFields,
        [id]: { ...field, x: clamp(Math.round(x), -200, maxX + 200), y: clamp(Math.round(y), -200, maxY + 200) },
      },
    });
  },

  resizeField: (id, size) => {
    const field = get().activeFields[id];
    if (!field) return;
    get().pushHistory(`size:${id}`);
    set({
      activeFields: {
        ...get().activeFields,
        [id]: { ...field, size: Math.round(clamp(size, MIN_FONT_SIZE, MAX_FONT_SIZE)) },
      },
    });
  },

  selectField: (id) => set({ selectedFieldId: id }),

  /* ------------------------------ التكبير ------------------------------ */
  setZoom: (value) => set({ zoom: clamp(value, MIN_ZOOM, MAX_ZOOM) }),
  changeZoom: (delta) => set({ zoom: clamp(get().zoom + delta, MIN_ZOOM, MAX_ZOOM) }),
  resetZoom: () => set({ zoom: 1 }),

  /* ------------------------------ التصدير ------------------------------ */
  toggleExportOption: (key) =>
    set({ exportOptions: { ...get().exportOptions, [key]: !get().exportOptions[key] } }),

  setFileNameColumn: (colIndex) => set({ fileNameColumn: colIndex }),

  /* ------------------------- وضع نصوص المنشورات ------------------------- */
  setPostsApiKey: (key) => {
    writeLocalStorage('eatiad_groq_key', key);
    set({ postsApiKey: key });
  },
  setPostsModel: (model) => {
    writeLocalStorage('eatiad_groq_model', model);
    set({ postsModel: model });
  },
  setPostsInstructions: (text) => {
    writeLocalStorage('eatiad_posts_instructions', text);
    set({ postsInstructions: text });
  },
  setPostsGeneratedText: (text) => set({ postsGeneratedText: text }),
  setPostsGenerating: (v) => set({ postsGenerating: v }),
  setPostsError: (err) => set({ postsError: err }),

  /* --------------------- حالة تقدّم محرك التوليد --------------------- */
  startProgress: (total, concurrency = 1) =>
    set({
      exportProgress: {
        running: true,
        phase: 'rendering',
        done: 0,
        total,
        succeeded: 0,
        currentName: '',
        message: 'جارٍ التحضير...',
        cancelled: false,
        finished: false,
        concurrency,
        errors: [],
        downloadReady: null,
        savedToDisk: false,
      },
    }),
  setProgress: (patch) => set({ exportProgress: { ...get().exportProgress, ...patch } }),
  /** نجاح صف واحد — done/succeeded معاً حتى تبقى النسبة المئوية متسقة مع الفشل أيضاً. */
  markRowDone: (name) => {
    const p = get().exportProgress;
    set({
      exportProgress: { ...p, done: p.done + 1, succeeded: p.succeeded + 1, currentName: name },
    });
  },
  addProgressError: (rowIndex, name, message) => {
    const p = get().exportProgress;
    set({
      exportProgress: {
        ...p,
        done: p.done + 1,
        errors: [...p.errors, { rowIndex, name, message }],
      },
    });
  },
  cancelProgress: () =>
    set({
      exportProgress: { ...get().exportProgress, cancelled: true, message: 'جارٍ الإلغاء...' },
    }),
  closeProgress: () =>
    set({
      exportProgress: { ...get().exportProgress, running: false, finished: false, phase: 'idle' },
    }),

  /**
   * تجهيز حزمة البيانات التي سيستهلكها محرك التصدير (Milestone 3).
   * كل الإحداثيات هنا بمقياس الصورة الأصلية — جاهزة للرسم على Canvas مباشرة.
   */
  buildExportConfig: () => {
    const { mode, templateImage, excelData, activeFields, exportOptions } = get();
    return {
      mode,
      formats: { ...exportOptions },
      template: templateImage
        ? { name: templateImage.name, width: templateImage.width, height: templateImage.height }
        : null,
      rowsCount: mode === 'manual' ? 1 : excelData?.rows.length ?? 0,
      fields: Object.values(activeFields).map((f) => ({
        kind: f.kind,
        type: f.type,
        column: f.column,
        colIndex: f.colIndex,
        text: f.text,
        x: Math.round(f.x),
        y: Math.round(f.y),
        ...(f.type === 'image'
          ? { w: f.w, h: f.h }
          : {
              align: f.align,
              font: resolveFontName(f),
              size: f.size,
              color: f.color,
              bold: f.bold,
              letterSpacing: f.letterSpacing,
            }),
        opacity: f.opacity,
        rotation: f.rotation,
        shadow: resolveShadow(f),
      })),
    };
  },
}));
