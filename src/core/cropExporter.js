import { useStore } from './store.js';
import { StreamingZipWriter } from './zipStream.js';

/* =========================================================================
 *  محرك القص الجماعي — يقصّ كل صورة لتطابق أبعاد قالب PNG واحد (بنفس منطق
 *  CSS object-fit: cover: تكبير حتى يغطي الإطار كاملاً، ثم قص الزائد من
 *  المنتصف بلا تمديد/تشويه)، ثم يركّب القالب فوقها ويُصدِّرها جميعاً كملف
 *  ZIP واحد. يعيد استخدام نفس حالة exportProgress ونافذة ExportModal
 *  الموجودتين أصلاً — القص عملية أخف بكثير من توليد الشهادات (بلا نص ولا
 *  خطوط)، فتكفي معالجة متسلسلة على الخيط الرئيسي بلا Worker.
 * ========================================================================= */

const ILLEGAL_FILENAME = /[\\/:*?"<>|\x00-\x1f]/g;
const nextTick = () => new Promise((r) => setTimeout(r, 0));

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذّر تحميل الصورة.'));
    img.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('تعذّر إنشاء الصورة.'))), 'image/png');
  });
}

function sanitizeFileName(name, fallbackIndex) {
  const withoutExt = String(name ?? '').replace(/\.[^./\\]+$/, '');
  const clean = withoutExt.replace(ILLEGAL_FILENAME, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean || `photo_${fallbackIndex + 1}`;
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * إحداثيات القص بمنطق "cover": تكبير الصورة المصدر حتى تغطي الهدف كاملاً،
 * ثم اقتطاع الزائد من المنتصف — بلا أي تمديد يُشوّه أبعاد الصورة الأصلية.
 */
function computeCoverRect(srcW, srcH, dstW, dstH) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sh = srcH;
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh };
  }
  const sw = srcW;
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw, sh };
}

export async function runCropExport() {
  const store = useStore.getState();
  const { cropTemplate, cropImages, cropBlurFaces, cropBlurStyle, cropManualMasks } = store;
  const { startProgress, setProgress, markRowDone, addProgressError } = store;
  const isCancelled = () => useStore.getState().exportProgress.cancelled;

  startProgress(cropImages.length, 1);

  let zipWriter = null;
  let totalFacesBlurred = 0;
  try {
    setProgress({ message: 'جارٍ تحميل القالب...' });
    const templateImg = await loadImage(cropTemplate.url);
    const { width, height } = cropTemplate;

    // تغبيش الوجوه: تحميل نموذج الكشف مرة واحدة قبل الحلقة، لا لكل صورة.
    // هذه ميزة خصوصية صريحة — فإن طُلبت ولم نتمكن من تحميل النموذج، نوقف
    // العملية كاملة بخطأ واضح بدل تصدير صور بوجوه غير مغبَّشة بصمت.
    // الصور التي عدَّلها المستخدم يدوياً في المعاينة (سحب/تحجيم/إضافة/حذف
    // مناطق) تملك مفتاحاً في cropManualMasks — تُستخدم مناطقها كما هي بالضبط
    // بلا إعادة كشف، فتُصدَّر مطابقة تماماً لما ظهر في المعاينة الحيّة.
    let applyFaceEffectsOnCanvas = null;
    let applyRegionsEffect = null;
    if (cropBlurFaces) {
      setProgress({ message: 'جارٍ تحميل نموذج التعرّف على الوجوه (مرة واحدة فقط)...' });
      try {
        const mod = await import('./faceBlur.js');
        await mod.ensureFaceModel();
        applyFaceEffectsOnCanvas = mod.applyFaceEffectsOnCanvas;
        applyRegionsEffect = mod.applyRegionsEffect;
      } catch (err) {
        throw new Error('تعذّر تحميل نموذج كشف الوجوه. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة، أو عطّل خيار تغبيش الوجوه.');
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    zipWriter = new StreamingZipWriter({});

    for (let i = 0; i < cropImages.length; i++) {
      if (isCancelled()) break;
      const entry = cropImages[i];
      const baseName = `${String(i + 1).padStart(3, '0')}_${sanitizeFileName(entry.name, i)}`;
      setProgress({ currentName: baseName, message: `جارٍ قصّ: ${baseName}` });

      try {
        const photo = await loadImage(entry.url);
        const { sx, sy, sw, sh } = computeCoverRect(photo.naturalWidth, photo.naturalHeight, width, height);

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, width, height);

        if (applyFaceEffectsOnCanvas) {
          const manualRegions = cropManualMasks[entry.id];
          if (manualRegions) {
            // المستخدم راجع/عدَّل هذه الصورة يدوياً — نستخدم مناطقه كما هي
            // بالضبط (بإحداثيات قالب القص نفسها، بلا أي تحويل مطلوب).
            applyRegionsEffect(ctx, manualRegions, cropBlurStyle);
            totalFacesBlurred += manualRegions.length;
          } else {
            setProgress({ message: `جارٍ الكشف عن الوجوه: ${baseName}...` });
            // تحويل مستطيل الوجه من إحداثيات الصورة الأصلية إلى إحداثيات
            // الكانفاس المقصوص — نفس مقياس القص الموحّد (scaleX === scaleY دائماً
            // لأن القص يحافظ على النسبة، فمقياس واحد يكفي للمحورين).
            const scale = width / sw;
            const mapRect = (r) => ({
              x: (r.x - sx) * scale,
              y: (r.y - sy) * scale,
              w: r.w * scale,
              h: r.h * scale,
            });
            const count = await applyFaceEffectsOnCanvas(ctx, photo, mapRect, cropBlurStyle);
            totalFacesBlurred += count;
          }
        }

        ctx.drawImage(templateImg, 0, 0, width, height);

        const blob = await canvasToBlob(canvas);
        await zipWriter.addFile(`${baseName}.png`, blob);
        markRowDone(baseName);
      } catch (err) {
        console.error(err);
        addProgressError(i, entry.name, err.message || String(err));
      }
      await nextTick();
    }

    if (isCancelled()) {
      await zipWriter.abort();
      setProgress({ running: true, finished: true, phase: 'cancelled', message: 'تم إلغاء العملية.' });
      return;
    }

    setProgress({ phase: 'zipping', message: 'جارٍ حفظ الصور في الملف المضغوط...' });
    const finalBlob = await zipWriter.finish();

    const { succeeded, errors } = useStore.getState().exportProgress;
    let summary = `اكتمل: ${succeeded} نجحت${errors.length ? `، ${errors.length} فشلت` : ''}.`;
    if (cropBlurFaces) summary += ` — ${totalFacesBlurred} وجهاً غُبِّش.`;
    setProgress({
      running: true,
      finished: true,
      phase: 'done',
      message: summary,
      downloadReady: { blob: finalBlob, fileName: `صور_مقصوصة_${new Date().toISOString().slice(0, 10)}.zip` },
    });
  } catch (err) {
    console.error(err);
    await zipWriter?.abort();
    addProgressError(-1, '', err.message || String(err));
    setProgress({ running: true, finished: true, phase: 'error', message: err.message || 'توقفت العملية بسبب خطأ.' });
  }
}

/** تنزيل الأرشيف الجاهز صراحة — لا تنزيل تلقائي عند الاكتمال. */
export function confirmCropDownload() {
  const { downloadReady } = useStore.getState().exportProgress;
  if (downloadReady) triggerDownload(downloadReady.blob, downloadReady.fileName);
}

/** إعادة قصّ الصور الفاشلة فقط، كأرشيف جديد منفصل. */
export async function retryFailedCrops() {
  const { errors } = useStore.getState().exportProgress;
  const failedIndices = new Set(errors.filter((e) => e.rowIndex >= 0).map((e) => e.rowIndex));
  if (!failedIndices.size) return;

  const store = useStore.getState();
  const subset = store.cropImages.filter((_, i) => failedIndices.has(i));
  if (!subset.length) return;

  // تشغيل مؤقت بمجموعة الصور الفاشلة فقط، بلا المساس بقائمة الصور الكاملة في الواجهة
  const original = store.cropImages;
  useStore.setState({ cropImages: subset });
  try {
    await runCropExport();
  } finally {
    useStore.setState({ cropImages: original });
  }
}
