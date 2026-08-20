import { GOOGLE_FONTS, SYSTEM_FONTS } from './store.js';

/* =========================================================================
 *  جلب ملفات خطوط Google كبايتات خام — لتسجيلها داخل عمّال Web Worker.
 *
 *  الخطوط الجاهزة في النظام (Arial, Tahoma...) وخطوط الجهاز المخصّصة تُحلّ
 *  عبر مطابقة نظام التشغيل نفسها المتاحة داخل الـ Worker بلا أي تحميل — لا
 *  حاجة لجلبها. فقط خطوط Google (@font-face عن بعد) تحتاج بايتات صريحة.
 * ========================================================================= */

const WEIGHTS = [400, 700];

/** استخراج روابط ملفات الخط (woff2) من نص CSS الذي يرجعه Google Fonts. */
function extractFontUrls(cssText) {
  const urls = [];
  const blockRe = /@font-face\s*{([^}]*)}/g;
  let block;
  while ((block = blockRe.exec(cssText))) {
    const body = block[1];
    const weightMatch = /font-weight:\s*(\d+)/.exec(body);
    const urlMatch = /src:\s*url\(([^)]+)\)\s*format\('woff2'\)/.exec(body);
    if (urlMatch) {
      urls.push({
        weight: weightMatch ? Number(weightMatch[1]) : 400,
        url: urlMatch[1].replace(/['"]/g, ''),
      });
    }
  }
  return urls;
}

/** جلب بايتات خط Google واحد بكل أوزانه المستخدمة (400 عادي، 700 عريض). */
async function fetchGoogleFontBytes(family) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}:wght@${WEIGHTS.join(';')}&display=swap`;
  const css = await fetch(cssUrl).then((r) => {
    if (!r.ok) throw new Error(`تعذّر جلب تعريف الخط: ${family}`);
    return r.text();
  });

  const entries = extractFontUrls(css);
  const withBytes = await Promise.all(
    entries.map(async ({ weight, url }) => ({
      family,
      weight,
      bytes: await fetch(url).then((r) => r.arrayBuffer()),
    }))
  );
  return withBytes;
}

/**
 * جلب بايتات كل خطوط Google المستخدمة فعلياً في الحقول النشطة فقط —
 * لا تُحمَّل خطوط غير مستعملة، ولا تُطلَب مرتين لو تكررت بين عدة حقول.
 */
export async function collectUsedGoogleFontBytes(fields) {
  const usedFamilies = new Set(
    fields
      .filter((f) => f.type !== 'image')
      .map((f) => f.family)
      .filter((name) => GOOGLE_FONTS.includes(name) && !SYSTEM_FONTS.includes(name))
  );

  const results = await Promise.all(
    [...usedFamilies].map((family) =>
      fetchGoogleFontBytes(family).catch((err) => {
        console.warn(`تعذّر تحميل خط "${family}" للعمّال — سيُستخدم خط بديل:`, err);
        return [];
      })
    )
  );

  return results.flat();
}
