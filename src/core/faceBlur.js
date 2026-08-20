/* =========================================================================
 *  تغبيش الوجوه التلقائي — كشف بالكامل داخل المتصفح عبر TensorFlow.js
 *  ونموذج BlazeFace (Google)، بلا رفع أي صورة لأي خادم أو خدمة خارجية.
 *  النموذج نفسه يُحمَّل من CDN عام أول استعمال فقط (~1-2MB)، ثم يعمل محلياً
 *  بالكامل — نفس مبدأ خصوصية بقية النظام، وبلا استثناء.
 *
 *  ملف منفصل ويُحمَّل كسولاً فقط عند تفعيل الخيار — لا يدفع أي مستخدم آخر
 *  ثمن حزمة TF.js (~1MB) الثقيلة نسبياً ما لم يُفعِّل تغبيش الوجوه صراحة.
 * ========================================================================= */

let modelPromise = null;

/**
 * تحميل النموذج مرة واحدة فقط وإعادة استخدامه لكل الصور اللاحقة.
 * الاستدعاء الأول الفعلي لأي نموذج WebGL بطيء جداً (~7 ثوانٍ، تجميع
 * shaders) بصرف النظر عن سرعة تحميل الملفات نفسها؛ الاستدعاءات اللاحقة
 * سريعة (~30ms). لذا "ندفّئ" النموذج بصورة وهمية فور تحميله هنا، بدل أن
 * تظهر الصورة الأولى الحقيقية متجمّدة لسبع ثوانٍ بلا تفسير للمستخدم.
 */
async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [tf, blazeface] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('@tensorflow-models/blazeface'),
      ]);
      await tf.ready();
      const model = await blazeface.load();

      const warmupCanvas = document.createElement('canvas');
      warmupCanvas.width = 128;
      warmupCanvas.height = 128;
      await model.estimateFaces(warmupCanvas, false).catch(() => {});

      return model;
    })().catch((err) => {
      modelPromise = null; // السماح بإعادة المحاولة لاحقاً بدل تجميد الفشل للأبد
      throw err;
    });
  }
  return modelPromise;
}

/** تحميل مسبق اختياري (لا يُبلِّغ عن الفشل) — لبدء التنزيل فور تفعيل الخيار في الواجهة. */
export function warmUpFaceModel() {
  loadModel().catch(() => {});
}

/** تحميل مُنتظَر يُفشِل بوضوح — يُستخدم عند بدء التصدير الفعلي ليتوقف الكشف بخطأ بيّن لا بصمت. */
export function ensureFaceModel() {
  return loadModel();
}

/**
 * كشف الوجوه في عنصر صورة (HTMLImageElement) وإرجاع مستطيلاتها بإحداثيات
 * الصورة الأصلية (بكسل طبيعي)، مع هامش إضافي محدود حول كل وجه يغطي الجبهة
 * والذقن دون تضخيم الصندوق لمساحة واسعة من الخلفية — الشكل النهائي المرسوم
 * بيضاوي (انظر applyFaceEffect)، فالهامش هنا يبقى قريباً من حدود الوجه فعلياً.
 */
export async function detectFaces(imgEl) {
  const model = await loadModel();
  const predictions = await model.estimateFaces(imgEl, false);

  return predictions.map((p) => {
    const [x1, y1] = p.topLeft;
    const [x2, y2] = p.bottomRight;
    const w = x2 - x1;
    const h = y2 - y1;

    const padX = w * 0.18;
    const padTop = h * 0.22;
    const padBottom = h * 0.12;

    return {
      x: x1 - padX,
      y: y1 - padTop,
      w: w + padX * 2,
      h: h + padTop + padBottom,
    };
  });
}

/**
 * تطبيق تأثير التغبيش (ضبابي أو تربيعي) على منطقة وجه واحدة — بيضاوي الشكل
 * لا مستطيل، فيتبع حدود الوجه بدل تغطية مربّع كبير من الخلفية حوله.
 *
 *  - ضبابي: رسم الكانفاس على نفسه ضمن قصّ بيضاوي بفلتر ضبابي نشط. المعاينة
 *    عبر drawImage(canvas, canvas) معرَّفة رسمياً وآمنة (لا قراءة أثناء
 *    كتابة)، وأخذ العيّنات يتجاوز حدود القص فيُنتج حافة ناعمة طبيعية.
 *  - تربيعي (Pixelate): تصغير المنطقة إلى كانفاس مصغّر جداً ثم تكبيرها
 *    للخلف بلا تنعيم — نفس أسلوب "الفسيفساء" المعروف في تعمية الوجوه.
 */
export function applyFaceEffect(ctx, rect, style = 'blur') {
  const { width: cw, height: ch } = ctx.canvas;
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const w = Math.min(cw - x, rect.w + Math.min(0, rect.x));
  const h = Math.min(ch - y, rect.h + Math.min(0, rect.y));
  if (w <= 0 || h <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.clip();

  if (style === 'pixelate') {
    // حجم كل "مربّع" يتناسب مع حجم الوجه — كبير بما يكفي لإخفاء الملامح
    const blockSize = Math.max(7, Math.min(26, w * 0.14));
    const cols = Math.max(1, Math.round(w / blockSize));
    const rows = Math.max(1, Math.round(h / blockSize));
    const tiny = document.createElement('canvas');
    tiny.width = cols;
    tiny.height = rows;
    tiny.getContext('2d').drawImage(ctx.canvas, x, y, w, h, 0, 0, cols, rows);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiny, 0, 0, cols, rows, x, y, w, h);
  } else {
    // شدّة الضبابية تتناسب مع حجم الوجه — وجه صغير في صورة جماعية يحتاج
    // تغطية كاملة أيضاً، فالحد الأدنى مرتفع نسبياً عمداً لضمان عدم التعرّف.
    const blurPx = Math.max(12, Math.min(55, w * 0.3));
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
  }

  ctx.restore();
}

/** كشف كل الوجوه في الصورة وتطبيق التأثير المُختار مباشرة على الكانفاس المُعطى. */
export async function applyFaceEffectsOnCanvas(ctx, imgEl, mapRect, style = 'blur') {
  const faces = await detectFaces(imgEl);
  for (const face of faces) {
    applyFaceEffect(ctx, mapRect(face), style);
  }
  return faces.length;
}

/**
 * تطبيق التأثير على قائمة مناطق جاهزة مسبقاً (مثلاً مناطق عدّلها المستخدم
 * يدوياً) بلا أي كشف جديد — تُستخدم في المعاينة الحيّة وعند التصدير الفعلي
 * على حدّ سواء، فتبقى نتيجة المعاينة مطابقة تماماً لما يُصدَّر.
 */
export function applyRegionsEffect(ctx, regions, style = 'blur') {
  for (const region of regions) applyFaceEffect(ctx, region, style);
}
