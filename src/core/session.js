import { useEffect, useState } from 'react';
import { getSupabase, SUPABASE_READY, hasStoredSession } from './supabase.js';

/* =========================================================================
 *  حالة الجلسة: المستخدم الحالي وملفه (الدور والحالة).
 *
 *  مخزن صغير مستقل عن store.js عمداً — صفحة المدير (admin.html) تحتاج
 *  الجلسة ولا تحتاج شيئاً من مخزن بيئة العمل (الحقول، القوالب، التكبير)،
 *  فوضعها هنا يمنع سحب ذلك كله إلى حزمة اللوحة.
 *
 *  الدخول اختياري: التطبيق يعمل كاملاً بلا حساب — الملفات لا تغادر الجهاز
 *  أصلاً — والحساب يفتح الحفظ السحابي وحده. لذلك لا يوجد هنا أي "حارس"
 *  يمنع الاستعمال، فقط معرفة بمن هو الداخل إن وُجد.
 * ========================================================================= */

let state = { ready: false, user: null, profile: null };
const listeners = new Set();

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

async function fetchProfile(sb, user) {
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  // مُحفِّز قاعدة البيانات ينشئ الملف عند التسجيل، لكن حساباً أُنشئ قبل
  // ذلك المُحفِّز قد لا يملك صفاً. نُعيد null بدل الانهيار.
  if (error) return null;
  return data;
}

let started = false;

/**
 * يبدأ متابعة الجلسة مرة واحدة لكل صفحة.
 *
 * بلا force لا يُحمَّل عميل Supabase إلا إن وُجدت جلسة محفوظة — فزائر
 * لم يسجّل دخوله قط لا ينزّل المكتبة أصلاً. تُمرَّر force عند فتح شاشة
 * الدخول أو لوحة المدير، حيث المكتبة مطلوبة حتماً.
 */
export function startSession({ force = false } = {}) {
  if (started) return;

  if (!SUPABASE_READY || (!force && !hasStoredSession())) {
    emit({ ready: true });
    return;
  }

  started = true;

  getSupabase().then(async (sb) => {
    if (!sb) return emit({ ready: true });

    const { data } = await sb.auth.getSession();
    const user = data.session?.user ?? null;
    emit({ ready: true, user, profile: await fetchProfile(sb, user) });
    // تسجيل آخر ظهور لا يمنع شيئاً لو فشل، فلا ننتظره.
    if (user) sb.rpc('touch_last_seen');

    sb.auth.onAuthStateChange(async (_event, session) => {
      const next = session?.user ?? null;
      emit({ ready: true, user: next, profile: await fetchProfile(sb, next) });
    });
  });
}

export function useSession() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    startSession();
    listeners.add(setSnapshot);
    setSnapshot(state);
    return () => listeners.delete(setSnapshot);
  }, []);
  return snapshot;
}

/** قراءة فورية بلا React — للوحدات غير المكوّنات (تسجيل الاستخدام مثلاً). */
export function getSession() {
  return state;
}

export function isAdmin(profile) {
  return profile?.role === 'admin' && profile?.status === 'active';
}

export async function signOut() {
  const sb = await getSupabase();
  await sb?.auth.signOut();
}
