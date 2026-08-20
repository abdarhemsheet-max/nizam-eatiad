export const PDF_JPEG_QUALITY = 0.95;

/* =========================================================================
 *  دوال رسم وقياس خالصة (بلا DOM) — تعمل في الـ Main Thread وفي Web Worker
 *  على حد سواء، لأن Canvas 2D API متطابق في السياقين عبر OffscreenCanvas.
 *
 *  هذا هو مصدر الحقيقة الوحيد لمنطق الرسم: يستخدمه محرك التصدير الرئيسي
 *  وكل Worker من عمّال التوليد المتوازي، فلا يوجد منطقان مختلفان قد ينحرفان
 *  عن بعضهما.
 * ========================================================================= */

/**
 * قياس خط الأساس وارتفاع السطر عبر TextMetrics القياسية (fontBoundingBox*)
 * بدل تخطيط DOM — تُقرأ من جداول القياسات الحقيقية للخط (hhea/OS2)، فهي
 * دقيقة تماماً مثل التخطيط، لكنها متاحة أيضاً داخل Worker بلا نافذة مستند.
 */
export function measureLineMetricsCanvas(ctx, field) {
  ctx.save();
  ctx.font = `${field.bold ? 'bold ' : ''}${field.size}px "${field.family}", sans-serif`;
  const m = ctx.measureText('أبجد ABC 123');
  ctx.restore();

  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? field.size * 0.8;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? field.size * 0.2;
  return { baseline: ascent, lineHeight: ascent + descent };
}

/** نص الحقل الفعلي: ثابت في الوضع اليدوي، ومن صف الإكسل في وضع الأتمتة. */
export function textForField(field, row) {
  if (field.kind === 'manual') return (field.text ?? '').replace(/\s+$/, '');
  const value = row?.[field.colIndex];
  return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * إضافة خلفية بيضاء *خلف* المحتوى الموجود — تُستدعى فقط قبل إنتاج JPEG/PDF
 * لأنهما لا يدعمان الشفافية، وبعد التقاط الـ PNG حتى يبقى محافظاً على الشفافية.
 */
export function fillOpaqueBackdrop(ctx) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** رسم طبقة صورة واحدة (شعار/توقيع) بنفس الدوران والشفافية والظل المعروضين في المعاينة. */
function drawImageLayer(ctx, img, field) {
  ctx.save();
  ctx.globalAlpha = field.opacity / 100;

  if (field.shadowX || field.shadowY || field.shadowBlur) {
    ctx.shadowColor = field.shadowColor;
    ctx.shadowBlur = field.shadowBlur;
    ctx.shadowOffsetX = field.shadowX;
    ctx.shadowOffsetY = field.shadowY;
  }

  if (field.rotation) {
    const cx = field.x + field.w / 2;
    const cy = field.y + field.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((field.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.drawImage(img, field.x, field.y, field.w, field.h);
  ctx.restore();
}

/**
 * رسم شهادة واحدة كاملة على Canvas (يمسح ويعيد الرسم من الصفر).
 * templateImg و layerImages تقبل HTMLImageElement أو ImageBitmap سواء بسواء —
 * drawImage تتعامل معهما بنفس الطريقة، وهذا ما يجعل نفس الدالة تعمل في
 * الـ Main Thread (HTMLImageElement) وداخل الـ Worker (ImageBitmap).
 */
export function drawCertificateOnCanvas(ctx, templateImg, fields, row, metricsById, layerImages) {
  const { width, height } = ctx.canvas;

  // مسح كامل بلا خلفية — تبقى شفافية القالب كما هي في مخرجات PNG
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(templateImg, 0, 0, width, height);

  for (const field of fields) {
    if (field.visible === false) continue;

    if (field.type === 'image') {
      const img = layerImages[field.id];
      if (img) drawImageLayer(ctx, img, field);
      continue;
    }

    const text = textForField(field, row);
    if (!text) continue;

    const lines = text.split('\n');
    const { baseline, lineHeight } = metricsById[field.id];

    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = field.align; // left | center | right (فيزيائية، مطابقة للمعاينة)
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${field.bold ? 'bold ' : ''}${field.size}px "${field.family}", sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${field.letterSpacing}px`;
    ctx.globalAlpha = field.opacity / 100;
    ctx.fillStyle = field.color;

    // الظل: إزاحة Canvas لا تتأثر بمصفوفة التحويل، لذا ندوّر متجه الإزاحة يدوياً
    // حتى يدور الظل مع النص تماماً كما يفعل text-shadow في CSS.
    if (field.shadowX || field.shadowY || field.shadowBlur) {
      const rad = (field.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      ctx.shadowColor = field.shadowColor;
      ctx.shadowBlur = field.shadowBlur;
      ctx.shadowOffsetX = field.shadowX * cos - field.shadowY * sin;
      ctx.shadowOffsetY = field.shadowX * sin + field.shadowY * cos;
    }

    if (field.rotation) {
      // مركز الدوران = مركز صندوق النص كاملاً، تماماً كـ transform-origin: 50% 50%
      const w = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const cx = field.align === 'center' ? field.x : field.align === 'right' ? field.x - w / 2 : field.x + w / 2;
      const cy = field.y + (lineHeight * lines.length) / 2;
      ctx.translate(cx, cy);
      ctx.rotate((field.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    lines.forEach((line, i) => {
      if (!line) return;
      const lineY = field.y + baseline + i * lineHeight;
      ctx.fillText(line, field.x, lineY);

      // الحد الخارجي فوق التعبئة — نفس ترتيب -webkit-text-stroke في المعاينة.
      // نُطفئ الظل هنا حتى لا يُرسم مرتين فيبدو أغمق من المعاينة.
      if (field.strokeWidth > 0) {
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.strokeStyle = field.strokeColor;
        ctx.lineWidth = field.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(line, field.x, lineY);
        ctx.restore();
      }
    });
    ctx.restore();
  }
}

/** بناء فهرس القياسات لكل حقل نصي — استدعاء واحد لكل حقل، لا يعتمد على محتوى الصف. */
export function buildMetricsIndex(ctx, fields) {
  const metricsById = {};
  for (const field of fields) {
    if (field.type !== 'image') metricsById[field.id] = measureLineMetricsCanvas(ctx, field);
  }
  return metricsById;
}
