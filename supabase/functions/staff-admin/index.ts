import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

/* =========================================================================
 *  إدارة حسابات الموظفين — للمدير وحده.
 *
 *  إنشاء حساب مصادقة يحتاج مفتاح الخدمة، فلا سبيل لفعله من المتصفح.
 *  الدالة تتحقق بنفسها من أن المنادي مدير نشط قبل أي شيء: التحقّق في
 *  الواجهة لا قيمة له، فأي أحد يستطيع نداء هذا الرابط مباشرة.
 * ========================================================================= */

/** يولّد رمزاً من ٣ أرقام غير مستعمل. المدى كله ١٠٠٠ رمز فقط. */
async function pickFreeCode(admin: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await admin.from('staff_codes').select('code');
  const taken = new Set((data ?? []).map((r: { code: string }) => r.code));

  const free: string[] = [];
  for (let i = 0; i < 1000; i++) {
    const c = String(i).padStart(3, '0');
    if (!taken.has(c)) free.push(c);
  }
  if (free.length === 0) return null;

  const pick = new Uint32Array(1);
  crypto.getRandomValues(pick);
  return free[pick[0] % free.length];
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'الطريقة غير مدعومة.' }, 405, origin);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  /* -------------------------------------------------- التحقق من المنادي */
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = await admin.auth.getUser(jwt);
  if (!caller?.user) return json({ error: 'غير مصرّح.' }, 401, origin);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, status')
    .eq('id', caller.user.id)
    .maybeSingle();

  if (callerProfile?.role !== 'admin' || callerProfile?.status !== 'active') {
    return json({ error: 'هذا الإجراء مقصور على المدير.' }, 403, origin);
  }

  /* ------------------------------------------------------------ الإجراء */
  let body: { action?: string; full_name?: string; email?: string; user_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'طلب غير صالح.' }, 400, origin);
  }

  if (body.action === 'create') {
    const fullName = (body.full_name ?? '').trim();
    if (!fullName) return json({ error: 'اسم الموظف مطلوب.' }, 400, origin);

    // الموظف لا يحتاج بريداً — لكن Supabase Auth يحتاج معرّفاً فريداً.
    // نطاق .invalid محجوز في RFC 2606 لهذا الغرض بالضبط: لا يمكن أن
    // يوجد فعلاً، فلا خطر إرسال بريد إلى أحد بالخطأ.
    const email = (body.email ?? '').trim() || `staff.${crypto.randomUUID().slice(0, 8)}@staff.invalid`;

    // كلمة مرور عشوائية طويلة لا يعرفها أحد ولا تُستعمل قط — الدخول
    // يتم بالرمز عبر staff-login. وجودها مجرد شرط لإنشاء الحساب.
    const password = crypto.randomUUID() + crypto.randomUUID();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createErr || !created?.user) {
      return json({ error: 'تعذّر إنشاء الحساب: ' + (createErr?.message ?? 'خطأ غير معروف') }, 400, origin);
    }

    const code = await pickFreeCode(admin);
    if (!code) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: 'نفدت الرموز — كل الألف رمز مستعملة.' }, 409, origin);
    }

    const { error: codeErr } = await admin
      .from('staff_codes')
      .insert({ user_id: created.user.id, code, created_by: caller.user.id });

    // الحساب أُنشئ ولا رمز له، فلا سبيل لصاحبه للدخول ولا للمدير لرؤيته
    // في القائمة — حساب شبح. نتراجع عنه بدل تركه.
    if (codeErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: 'تعذّر تعيين الرمز: ' + codeErr.message }, 400, origin);
    }

    // المُحفِّز ينسخ الاسم من user_metadata، لكن ضمانه هنا أوثق.
    await admin.from('profiles').update({ full_name: fullName }).eq('id', created.user.id);

    return json({ code, email, user_id: created.user.id }, 200, origin);
  }

  if (body.action === 'regenerate') {
    if (!body.user_id) return json({ error: 'المستخدم مطلوب.' }, 400, origin);

    const code = await pickFreeCode(admin);
    if (!code) return json({ error: 'نفدت الرموز — كل الألف رمز مستعملة.' }, 409, origin);

    const { error } = await admin
      .from('staff_codes')
      .update({ code, last_used_at: null })
      .eq('user_id', body.user_id);

    if (error) return json({ error: 'تعذّر تجديد الرمز: ' + error.message }, 400, origin);
    return json({ code }, 200, origin);
  }

  return json({ error: 'إجراء غير معروف.' }, 400, origin);
});
