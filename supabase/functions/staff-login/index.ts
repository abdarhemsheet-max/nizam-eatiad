import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

/* =========================================================================
 *  دخول الموظف برمز من ثلاثة أرقام.
 *
 *  الرمز وحده لا يصلح ليكون بيانات اعتماد: ١٠٠٠ احتمال تُجرَّب كلها في
 *  دقائق. لذلك كل ما يمكن فعله هنا هو إبطاء المهاجم، وهذا ما تفعله
 *  قواعد المعدّل أدناه — لا تمنعه.
 *
 *  لماذا دالة حافة أصلاً: تحويل رمز إلى جلسة يحتاج مفتاح الخدمة
 *  (auth.admin)، وهو مفتاح يتجاوز كل سياسات RLS. وضعه في المتصفح يعني
 *  تسليم قاعدة البيانات كاملة لأول من يفتح أدوات المطوّر.
 * ========================================================================= */

const MAX_FAILURES = 8; // لكل عنوان IP
const WINDOW_MINUTES = 15;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'الطريقة غير مدعومة.' }, 405, origin);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // أول عنوان في x-forwarded-for هو عنوان العميل؛ الباقي وسطاء.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

  let code = '';
  try {
    const body = await req.json();
    code = String(body?.code ?? '').trim();
  } catch {
    return json({ error: 'طلب غير صالح.' }, 400, origin);
  }

  // رسالة الخطأ واحدة في كل حالات الفشل عمداً: تمييز "رمز غير موجود" عن
  // "حساب موقوف" يخبر المهاجم أي الرموز صحيحة.
  const DENIED = 'الرمز غير صحيح أو الحساب غير مفعّل.';

  if (!/^[0-9]{3}$/.test(code)) return json({ error: DENIED }, 401, origin);

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count: failures } = await admin
    .from('staff_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('ok', false)
    .gte('at', since);

  if ((failures ?? 0) >= MAX_FAILURES) {
    return json(
      { error: `محاولات كثيرة. انتظر ${WINDOW_MINUTES} دقيقة ثم أعد المحاولة.` },
      429,
      origin,
    );
  }

  const fail = async () => {
    await admin.from('staff_login_attempts').insert({ ip, ok: false });
    return json({ error: DENIED }, 401, origin);
  };

  // استعلامان لا واحد بتضمين PostgREST: staff_codes.user_id يشير إلى
  // auth.users لا إلى profiles، فلا علاقة يستنتجها PostgREST بينهما.
  const { data: row } = await admin
    .from('staff_codes')
    .select('user_id')
    .eq('code', code)
    .maybeSingle();

  if (!row?.user_id) return await fail();

  const { data: profile } = await admin
    .from('profiles')
    .select('email, status')
    .eq('id', row.user_id)
    .maybeSingle();

  if (!profile?.email || profile.status !== 'active') return await fail();

  // الرابط السحري يُولَّد ولا يُرسَل بريداً — نأخذ منه الرمز المُجزّأ
  // ونسلّمه للمتصفح ليُبادله بجلسة عبر verifyOtp. هذه هي الطريقة
  // المدعومة لإصدار جلسة من الخادم بلا كلمة مرور.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: profile.email,
  });

  if (linkErr || !link?.properties?.hashed_token) {
    await admin.from('staff_login_attempts').insert({ ip, ok: false });
    return json({ error: 'تعذّر إنشاء الجلسة. حاول مجدداً.' }, 500, origin);
  }

  await admin.from('staff_login_attempts').insert({ ip, ok: true });
  await admin.from('staff_codes').update({ last_used_at: new Date().toISOString() }).eq('code', code);
  // تنظيف عابر للسجل القديم — أرخص من مهمة مجدولة لجدول بهذا الحجم.
  await admin
    .from('staff_login_attempts')
    .delete()
    .lt('at', new Date(Date.now() - 86_400_000).toISOString());

  return json({ token_hash: link.properties.hashed_token }, 200, origin);
});
