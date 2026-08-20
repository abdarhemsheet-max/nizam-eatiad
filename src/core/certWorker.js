import { drawCertificateOnCanvas, buildMetricsIndex, fillOpaqueBackdrop, PDF_JPEG_QUALITY } from './canvasText.js';

/* =========================================================================
 *  عامل توليد الشهادات — يرسم على OffscreenCanvas بعيداً عن الـ Main Thread
 *  كي تبقى واجهة React قابلة للاستخدام (شريط التقدم، زر الإلغاء) أثناء
 *  توليد مئات الشهادات.
 *
 *  ملاحظة تصميم مهمّة: توليد PDF يبقى على الـ Main Thread (انظر exporter.js).
 *  jsPDF مبنية أساساً لسياق DOM ولم تُصمَّم صراحة للعمل داخل Worker؛ بدل
 *  المخاطرة بذلك، يُنتج هذا العامل صورة JPEG جاهزة (بخلفية بيضاء) والـ Main
 *  Thread يُغلّفها بـ jsPDF فقط — وهي عملية تغليف بايتات خفيفة لا رسم، فلا
 *  تُجمّد الواجهة حتى لو بقيت متزامنة هناك.
 * ========================================================================= */

let templateImg = null;
let layerImages = {};
let fields = [];
let metricsById = {};
let canvas = null;
let ctx = null;

async function registerFonts(fontBytes) {
  if (!('fonts' in self)) return; // خطوط النظام لا تحتاج تسجيلاً؛ لا شيء لفعله هنا
  await Promise.all(
    fontBytes.map(async ({ family, weight, bytes }) => {
      try {
        const face = new FontFace(family, bytes, { weight: String(weight) });
        await face.load();
        self.fonts.add(face);
      } catch (err) {
        console.warn(`[worker] تعذّر تسجيل الخط ${family} (${weight}):`, err);
      }
    })
  );
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('OffscreenCanvas غير مدعوم في هذا المتصفح.');
      }
      await registerFonts(msg.fontBytes);

      // نستقبل Blob خاماً لا ImageBitmap جاهزاً، ونحوّله هنا داخل العامل نفسه.
      // Blob مضمون الاستنساخ عبر postMessage في كل المتصفحات المستهدفة، بخلاف
      // ImageBitmap الذي قد يُعامَل كقابل للنقل فقط (transferable) في بعض
      // المحركات — فتحويله محلياً لكل عامل يتفادى أي التباس حول ذلك.
      templateImg = await createImageBitmap(msg.templateBlob);

      const layerEntries = await Promise.all(
        Object.entries(msg.layerBlobs).map(async ([id, blob]) => [id, await createImageBitmap(blob)])
      );
      layerImages = Object.fromEntries(layerEntries);

      fields = msg.fields;

      canvas = new OffscreenCanvas(msg.width, msg.height);
      ctx = canvas.getContext('2d', { willReadFrequently: false });
      metricsById = buildMetricsIndex(ctx, fields);

      self.postMessage({ type: 'init-ok' });
    } catch (err) {
      self.postMessage({ type: 'init-error', message: err.message });
    }
    return;
  }

  if (msg.type === 'render') {
    const { taskId, row, needPng, needJpeg } = msg;
    try {
      drawCertificateOnCanvas(ctx, templateImg, fields, row, metricsById, layerImages);

      let pngBlob = null;
      if (needPng) {
        pngBlob = await canvas.convertToBlob({ type: 'image/png' });
      }

      let jpegBlob = null;
      if (needJpeg) {
        // الخلفية البيضاء بعد التقاط الـ PNG الشفاف — على نفس الكانفاس المُعاد استخدامه
        fillOpaqueBackdrop(ctx);
        jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: PDF_JPEG_QUALITY });
      }

      self.postMessage({ type: 'render-result', taskId, pngBlob, jpegBlob });
    } catch (err) {
      self.postMessage({ type: 'render-result', taskId, error: err.message || String(err) });
    }
    return;
  }

  if (msg.type === 'dispose') {
    // تحرير صريح للمراجع الكبيرة قبل إنهاء العامل — لا ننتظر GC وحده.
    // close() يُحرّر ذاكرة الـ GPU/فك الترميز فوراً بدل انتظار الدورة التالية.
    templateImg?.close?.();
    Object.values(layerImages).forEach((img) => img?.close?.());
    templateImg = null;
    layerImages = {};
    fields = [];
    metricsById = {};
    canvas = null;
    ctx = null;
  }
};
