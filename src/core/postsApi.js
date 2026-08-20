import { useStore } from './store.js';

/* =========================================================================
 *  توليد نصوص المنشورات عبر Groq (نموذج لغوي) — طلب مباشر من المتصفح إلى
 *  Groq بلا أي خادم وسيط، فيبقى النظام "بلا Backend" كما هو مصمَّم بالكامل.
 *
 *  أمان المفتاح: مفتاح الـ API لا يظهر في كود المشروع إطلاقاً — يُدخله كل
 *  مستخدم بنفسه في متصفحه، ويُحفَظ فقط في localStorage الخاص بجهازه (انظر
 *  store.js). عند نشر هذا الموقع علناً، كل زائر يحتاج مفتاحه الخاص —
 *  المفتاح لا يُضمَّن في الملفات المرفوعة مطلقاً.
 * ========================================================================= */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const SUGGESTED_MODELS = [
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — الأقوى (افتراضي)' },
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — الأسرع' },
  { value: 'gemma2-9b-it', label: 'Gemma 2 9B' },
];

/** معلومات تاريخ اليوم الحقيقي بالعربية (ميلادي) — النموذج اللغوي لا يعرف التاريخ الحالي من تلقاء نفسه. */
export function getTodayInfo() {
  const now = new Date();
  const fmt = (opts) => new Intl.DateTimeFormat('ar', { calendar: 'gregory', ...opts }).format(now);
  return {
    dayName: fmt({ weekday: 'long' }),
    dateLong: fmt({ day: 'numeric', month: 'long', year: 'numeric' }),
    dateShort: fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }),
  };
}

/** استبدال {{التاريخ}} و {{اليوم}} بقيمهما الحقيقية — يُطبَّق قبل الإرسال وعلى الناتج احتياطاً. */
export function resolveDatePlaceholders(text, today = getTodayInfo()) {
  return text
    .replace(/\{\{\s*التاريخ\s*\}\}/g, today.dateLong)
    .replace(/\{\{\s*اليوم\s*\}\}/g, today.dayName);
}

function buildSystemPrompt(today) {
  return (
    `أنت مساعد كتابة منشورات لوسائل التواصل الاجتماعي باللغة العربية.\n` +
    `اليوم هو ${today.dayName}، الموافق ${today.dateLong} ميلادي — استخدم هذا التاريخ فقط ` +
    `إن احتاج المنشور لذكر التاريخ أو اسم اليوم، ولا تخترع تاريخاً آخر.\n` +
    `اكتب نص المنشور جاهزاً للنشر مباشرة بناءً على توجيهات المستخدم فقط، بلا أي شرح ` +
    `أو مقدمة أو علامات اقتباس تحيط بالنص.`
  );
}

/** توليد نص منشور عبر Groq، مع تحديث حالة المخزن (تحميل/نتيجة/خطأ) مباشرة. */
export async function generatePost() {
  const store = useStore.getState();
  const { postsApiKey, postsModel, postsInstructions } = store;
  const { setPostsGenerating, setPostsGeneratedText, setPostsError } = store;

  if (!postsApiKey.trim()) {
    setPostsError('يرجى إدخال مفتاح Groq API أولاً (إعدادات القسم أعلاه).');
    return;
  }
  if (!postsInstructions.trim()) {
    setPostsError('يرجى كتابة توجيهاتك لنص المنشور أولاً.');
    return;
  }

  setPostsGenerating(true);
  setPostsError(null);

  const today = getTodayInfo();
  const userContent = resolveDatePlaceholders(postsInstructions, today);

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${postsApiKey.trim()}`,
      },
      body: JSON.stringify({
        model: postsModel || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: buildSystemPrompt(today) },
          { role: 'user', content: userContent },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const errJson = await res.json();
        detail = errJson?.error?.message || '';
      } catch {
        /* الاستجابة ليست JSON صالحاً */
      }
      if (res.status === 401) throw new Error('مفتاح API غير صحيح أو منتهي. تحقّق منه في إعدادات القسم.');
      if (res.status === 429) throw new Error('تم تجاوز الحد المسموح من الطلبات. حاول لاحقاً.');
      throw new Error(detail || `فشل الطلب (رمز ${res.status}).`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) throw new Error('لم يُعِد النموذج أي نص. حاول مجدداً بتوجيهات أوضح.');

    setPostsGeneratedText(resolveDatePlaceholders(text, today));
  } catch (err) {
    if (err instanceof TypeError) {
      setPostsError('تعذّر الاتصال بخادم Groq. تحقّق من اتصالك بالإنترنت.');
    } else {
      setPostsError(err.message);
    }
  } finally {
    setPostsGenerating(false);
  }
}
