/* =========================================================================
 *  ترويسات CORS.
 *
 *  الموقع يعمل على github.io والدالة على supabase.co، فكل نداء عابر
 *  للأصل. نحصر الأصول المسموحة بقائمة صريحة بدل "*" — الدالة تُصدر جلسات
 *  دخول، ولا نريد أي صفحة على الإنترنت أن تناديها من متصفح زائرنا.
 * ========================================================================= */

const ALLOWED = new Set([
  'https://abdarhemsheet-max.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.has(origin) ? origin : 'https://abdarhemsheet-max.github.io';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}
