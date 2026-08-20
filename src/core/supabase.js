import { createClient } from '@supabase/supabase-js';

/* =========================================================================
 *  عميل Supabase — التسجيل/الدخول وحفظ المشاريع السحابية.
 *
 *  ملاحظة أمان: المفتاح هنا هو المفتاح العام (publishable/anon) المخصص
 *  للتطبيقات العميلة بطبيعته، وليس مفتاح الخدمة السري — فقواعد حماية
 *  الصفوف (RLS) في قاعدة البيانات هي التي تمنع أي مستخدم من قراءة أو
 *  تعديل بيانات غيره.
 * ========================================================================= */

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const SUPABASE_READY = Boolean(url && anonKey);

export const supabase = createClient(url, anonKey);
