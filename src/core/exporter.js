import { jsPDF } from 'jspdf';
import { useStore, resolveFontName } from './store.js';
import { drawCertificateOnCanvas, buildMetricsIndex, fillOpaqueBackdrop, PDF_JPEG_QUALITY } from './canvasText.js';
import { collectUsedGoogleFontBytes } from './fontLoader.js';
import { WorkerPool } from './workerPool.js';
import { StreamingZipWriter } from './zipStream.js';
import { pickInitialConcurrency } from './exportQueue.js';

/* =========================================================================
 *  محرك توليد الشهادات — Browser Only، بلا Backend
 *
 *  المسار الدفعي (وضع الأتمتة، N صف من إكسل):
 *    قالب واحد يُعاد استخدامه لكل صف → Web Worker (OffscreenCanvas) يرسم
 *    كل شهادة على حدة في تجمّع محدود العدد (2-4 عمّال بالتوازي) → PNG/JPEG
 *    يُضافان فوراً إلى أرشيف ZIP متدفق (fflate) → تُحرَّر المراجع فوراً →
 *    الصف التالي. لا تُحفَظ 200 شهادة في الذاكرة في أي لحظة — فقط ما يعالجه
 *    العمّال النشطون حالياً + المخرجات المضغوطة المتراكمة في الأرشيف.
 *
 *  توليد PDF يبقى على الـ Main Thread عمداً (انظر شرح ذلك في certWorker.js)،
 *  لكنه لا يُجمّد الواجهة لأنه مجرّد تغليف بايتات JPEG جاهزة، لا رسم.
 *
 *  المسار اليدوي (صورة واحدة): يبقى كما كان — مباشر على الخيط الرئيسي،
 *  بلا طابور ولا عمّال، لأنه عنصر واحد فقط.
 * ========================================================================= */

const ILLEGAL_FILENAME = /[\\/:*?"<>|\x00-\x1f]/g;
const nextTick = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ أدوات مساعدة ------------------------------ */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذّر تحميل صورة القالب.'));
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('تعذّر إنشاء الصورة.'))),
      type,
      quality
    );
  });
}

/** انتظار جاهزية خطوط الحقول النصية (المسار اليدوي فقط — البرنامج الدفعي يُحمّل الخطوط في العمّال). */
async function ensureFontsReady(fields) {
  await Promise.all(
    fields
      .filter((f) => f.type !== 'image')
      .map((f) =>
        document.fonts
          .load(`${f.bold ? 'bold ' : ''}${f.size}px "${f.family}"`, 'أبجد ABC 123')
          .catch(() => {})
      )
  );
  await document.fonts.ready;
}

async function loadLayerImages(fields) {
  const imageFields = fields.filter((f) => f.type === 'image');
  const entries = await Promise.all(imageFields.map(async (f) => [f.id, await loadImage(f.src)]));
  return Object.fromEntries(entries);
}

function sanitizeFileName(name, fallbackIndex) {
  const clean = String(name ?? '')
    .replace(/[\r\n\t]+/g, ' ') // الأسطر تصبح مسافات قبل حذف المحارف الممنوعة
    .replace(ILLEGAL_FILENAME, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return clean || `certificate_${fallbackIndex + 1}`;
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

/** بناء جسم PDF واحد من صورة JPEG (Uint8Array مباشرة — بلا Base64/dataURL). */
async function buildSinglePagePdf(jpegBlob, width, height) {
  const orientation = width >= height ? 'landscape' : 'portrait';
  const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const doc = new jsPDF({ orientation, unit: 'px', format: [width, height], hotfixes: ['px_scaling'] });
  doc.addImage(bytes, 'JPEG', 0, 0, width, height, undefined, 'FAST');
  return doc.output('blob');
}

/* --------------------------- المسار اليدوي (صورة واحدة) --------------------------- */

async function runManualExport(fields, templateImage, exportOptions, store) {
  const { startProgress, setProgress, markRowDone, addProgressError } = store;
  startProgress(1, 1);

  try {
    setProgress({ message: 'جارٍ تحميل القالب والخطوط...' });
    const [image] = await Promise.all([loadImage(templateImage.url), ensureFontsReady(fields)]);
    const layerImages = await loadLayerImages(fields);

    const canvas = document.createElement('canvas');
    canvas.width = templateImage.width;
    canvas.height = templateImage.height;
    const ctx = canvas.getContext('2d');
    const metricsById = buildMetricsIndex(ctx, fields);

    const baseName = sanitizeFileName(
      fields.find((f) => f.type !== 'image')?.text ?? fields[0]?.column,
      0
    );
    setProgress({ currentName: baseName, message: `جارٍ التصدير: ${baseName}` });

    drawCertificateOnCanvas(ctx, image, fields, null, metricsById, layerImages);

    if (exportOptions.png) {
      const blob = await canvasToBlob(canvas, 'image/png');
      triggerDownload(blob, `${baseName}.png`);
    }
    if (exportOptions.pdf) {
      fillOpaqueBackdrop(ctx);
      const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', PDF_JPEG_QUALITY);
      const pdfBlob = await buildSinglePagePdf(jpegBlob, templateImage.width, templateImage.height);
      triggerDownload(pdfBlob, `${baseName}.pdf`);
    }

    markRowDone(baseName);
    setProgress({ finished: true, phase: 'done', message: 'اكتمل التصدير بنجاح.' });
  } catch (err) {
    console.error(err);
    addProgressError(0, 'الصورة', err.message);
    setProgress({ finished: true, phase: 'error', message: 'توقفت العملية بسبب خطأ.' });
  }
}

/* --------------------------- المسار الدفعي (إكسل) --------------------------- */

/** رسم صف واحد على الخيط الرئيسي — احتياطي فقط عند تعذّر Worker/OffscreenCanvas. */
function makeMainThreadRenderer(fields, templateImg, layerImages, metricsById, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  return async (row, { needPng, needJpeg }) => {
    drawCertificateOnCanvas(ctx, templateImg, fields, row, metricsById, layerImages);
    const pngBlob = needPng ? await canvasToBlob(canvas, 'image/png') : null;
    let jpegBlob = null;
    if (needJpeg) {
      fillOpaqueBackdrop(ctx);
      jpegBlob = await canvasToBlob(canvas, 'image/jpeg', PDF_JPEG_QUALITY);
    }
    return { pngBlob, jpegBlob };
  };
}

async function runBatchExport(
  fields,
  templateImage,
  excelData,
  exportOptions,
  fileNameColumn,
  store,
  onlyRowIndices,
  fileHandle
) {
  const { startProgress, setProgress, markRowDone, addProgressError } = store;
  const isCancelled = () => useStore.getState().exportProgress.cancelled;

  const indexedRows = (onlyRowIndices ?? excelData.rows.map((_, i) => i)).map((i) => ({
    i,
    row: excelData.rows[i],
  }));

  const needPng = exportOptions.png;
  const needJpeg = exportOptions.pdf;
  const useZip = exportOptions.zip;
  const useMerge = exportOptions.mergePdf;

  // التوازي: 2-4 حسب أنوية الجهاز، ويهبط تلقائياً لواحد على الأجهزة الضعيفة
  // (ذاكرة منخفضة معلنة، أو نواة واحدة فعلياً).
  let concurrency = pickInitialConcurrency();
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) concurrency = 1;

  startProgress(indexedRows.length, concurrency);

  let pool = null;
  let mainThreadRender = null;
  let zipWriter = null;

  try {
    setProgress({ message: 'جارٍ تحميل الخطوط والصور...' });
    const [fontBytes, templateBlob] = await Promise.all([
      collectUsedGoogleFontBytes(fields),
      fetch(templateImage.url).then((r) => r.blob()),
    ]);

    const layerBlobs = {};
    for (const f of fields) {
      if (f.type === 'image') layerBlobs[f.id] = await fetch(f.src).then((r) => r.blob());
    }

    // محاولة تجهيز تجمّع العمّال؛ سقوط آمن للرسم على الخيط الرئيسي عند الفشل
    let useWorkers = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
    if (useWorkers) {
      try {
        setProgress({ message: `جارٍ تهيئة ${concurrency} عمّال معالجة...` });
        pool = new WorkerPool(concurrency);
        await pool.init({
          type: 'init',
          fields,
          templateBlob,
          layerBlobs,
          width: templateImage.width,
          height: templateImage.height,
          fontBytes,
        });
      } catch (err) {
        console.warn('تعذّر تشغيل عمّال المعالجة، سيُستخدم الخيط الرئيسي بدلاً منها:', err);
        pool?.dispose();
        pool = null;
        useWorkers = false;
      }
    }

    if (!useWorkers) {
      setProgress({ message: 'جارٍ التحضير على الخيط الرئيسي...' });
      const [templateImg] = await Promise.all([loadImage(templateImage.url), ensureFontsReady(fields)]);
      const layerImages = await loadLayerImages(fields);
      const probeCanvas = document.createElement('canvas');
      const metricsById = buildMetricsIndex(probeCanvas.getContext('2d'), fields);
      mainThreadRender = makeMainThreadRenderer(
        fields,
        templateImg,
        layerImages,
        metricsById,
        templateImage.width,
        templateImage.height
      );
      concurrency = 1; // لا تفرّع حقيقياً بلا عمّال — نُعلن ذلك بصدق في الواجهة
      setProgress({ concurrency });
    }

    // وجهة الإخراج — fileHandle (إن وُجد) جاء جاهزاً من Sidebar.jsx حيث طُلب
    // ضمن بادرة ضغطة الزر مباشرة (شرط متصفّحي لإظهار مربع "أين تريد الحفظ؟")
    if (useZip) {
      zipWriter = new StreamingZipWriter({ fileHandle });
    }
    const looseFiles = []; // فقط عند تعطيل ZIP

    const nameColumn = fileNameColumn ?? fields.find((f) => f.type !== 'image')?.colIndex ?? 0;
    const computeBaseName = (row, i) =>
      `${String(i + 1).padStart(3, '0')}_${sanitizeFileName(row[nameColumn], i)}`;

    // تجميع صفحات PDF المدمج بترتيب الصفوف الأصلي رغم اكتمال العمّال خارج الترتيب.
    // pdfBuffer.set(i, null) تعني "هذا الصف فشل" — يجب أن يُعلَّم صراحة ليتخطّاه
    // المؤشر التسلسلي، وإلا يبقى عالقاً عند أول صف فاشل فتُفقَد كل الصفحات
    // اللاحقة بصمت (كانت هذه علّة حقيقية اكتُشفت أثناء الاختبار وأُصلحت هنا).
    let mergedDoc = null;
    const pdfBuffer = new Map();
    let nextFlushIndex = 0;
    const pageFormat = [templateImage.width, templateImage.height];
    const orientation = templateImage.width >= templateImage.height ? 'landscape' : 'portrait';

    const flushMergedPdf = async () => {
      while (pdfBuffer.has(nextFlushIndex)) {
        const blob = pdfBuffer.get(nextFlushIndex);
        pdfBuffer.delete(nextFlushIndex);
        nextFlushIndex++;
        if (!blob) continue; // صف فاشل — نتخطى صفحته فقط ونتابع الترقيم
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (!mergedDoc) {
          mergedDoc = new jsPDF({ orientation, unit: 'px', format: pageFormat, hotfixes: ['px_scaling'] });
        } else {
          mergedDoc.addPage(pageFormat, orientation);
        }
        mergedDoc.addImage(bytes, 'JPEG', 0, 0, templateImage.width, templateImage.height, undefined, 'FAST');
      }
    };

    await Promise.all(
      indexedRows.map(async ({ i, row }, relativeIndex) => {
        if (isCancelled()) return;

        const baseName = computeBaseName(row, i);
        setProgress({ currentName: baseName, message: `جارٍ توليد: ${baseName}` });

        try {
          const result = useWorkers
            ? await pool.render(row, { needPng, needJpeg })
            : await mainThreadRender(row, { needPng, needJpeg });

          if (isCancelled()) return;
          if (result.error) throw new Error(result.error);

          if (needPng && result.pngBlob) {
            if (zipWriter) await zipWriter.addFile(`PNG/${baseName}.png`, result.pngBlob);
            else looseFiles.push({ blob: result.pngBlob, name: `${baseName}.png` });
          }

          if (needJpeg && result.jpegBlob) {
            if (useMerge) {
              pdfBuffer.set(relativeIndex, result.jpegBlob);
              await flushMergedPdf();
            } else {
              const pdfBlob = await buildSinglePagePdf(result.jpegBlob, templateImage.width, templateImage.height);
              if (zipWriter) await zipWriter.addFile(`PDF/${baseName}.pdf`, pdfBlob);
              else looseFiles.push({ blob: pdfBlob, name: `${baseName}.pdf` });
            }
          }

          markRowDone(baseName);
        } catch (err) {
          console.error(err);
          addProgressError(i, baseName, err.message || String(err));
          // نُعلِّم هذا الموضع صراحة "بلا صفحة" حتى لا يعلق مؤشر الدمج التسلسلي
          // منتظراً صفاً لن يصل أبداً — وإلا تُفقَد كل الصفحات اللاحقة بصمت.
          if (useMerge && needJpeg) {
            pdfBuffer.set(relativeIndex, null);
            await flushMergedPdf();
          }
        }

        await nextTick(); // إفساح المجال لتحديث الواجهة وزر الإلغاء
      })
    );

    pool?.dispose();
    pool = null;

    if (isCancelled()) {
      await zipWriter?.abort();
      setProgress({ running: true, finished: true, phase: 'cancelled', message: 'تم إلغاء العملية.' });
      return;
    }

    if (mergedDoc) {
      const blob = mergedDoc.output('blob');
      const name = `شهادات_مدمجة_${indexedRows.length}.pdf`;
      if (zipWriter) await zipWriter.addFile(name, blob);
      else looseFiles.push({ blob, name });
    }

    const { succeeded, errors } = useStore.getState().exportProgress;
    const summary = `اكتمل: ${succeeded} نجحت${errors.length ? `، ${errors.length} فشلت` : ''}.`;

    if (zipWriter) {
      setProgress({ phase: 'zipping', message: 'جارٍ حفظ الشهادات في الملف المضغوط...' });
      const finalBlob = await zipWriter.finish();
      if (finalBlob) {
        setProgress({
          running: true,
          finished: true,
          phase: 'done',
          message: summary,
          downloadReady: { blob: finalBlob, fileName: `شهادات_${new Date().toISOString().slice(0, 10)}.zip` },
        });
      } else {
        setProgress({ running: true, finished: true, phase: 'done', savedToDisk: true, message: summary });
      }
    } else {
      setProgress({ message: 'جارٍ تنزيل الملفات...' });
      for (const file of looseFiles) {
        triggerDownload(file.blob, file.name);
        await sleep(250); // المتصفح يحجب التنزيلات المتلاحقة
      }
      setProgress({ running: true, finished: true, phase: 'done', message: summary });
    }
  } catch (err) {
    console.error(err);
    pool?.dispose();
    await zipWriter?.abort();
    addProgressError(-1, '', err.message || String(err));
    setProgress({ running: true, finished: true, phase: 'error', message: 'توقفت العملية بسبب خطأ.' });
  }
}

/* ------------------------------ نقطة الدخول ------------------------------ */

/**
 * تشغيل عملية التوليد كاملة اعتماداً على حالة المخزن.
 * @param {{ onlyRowIndices?: number[], fileHandle?: FileSystemFileHandle }} opts
 *   onlyRowIndices لإعادة توليد صفوف فاشلة فقط.
 *   fileHandle مقبض حفظ مباشر على القرص، مطلوب أن يُطلَب من المتصفح ضمن
 *   بادرة ضغطة الزر مباشرة — انظر التعليق في zipStream.js.
 */
export async function runExport(opts = {}) {
  const store = useStore.getState();
  const { mode, templateImage, excelData, activeFields, exportOptions, fileNameColumn } = store;

  // ترتيب الرسم يطابق ترتيب الطبقات المعروض (z) — إغفال هذا الترتيب كان يجعل
  // التصدير يرسم بترتيب إضافة الحقول بدل ترتيبها المرئي الفعلي.
  const fields = Object.values(activeFields)
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
    .map((f) => (f.type === 'image' ? f : { ...f, family: resolveFontName(f) }));

  if (mode === 'manual') {
    return runManualExport(fields, templateImage, exportOptions, store);
  }
  return runBatchExport(
    fields,
    templateImage,
    excelData,
    exportOptions,
    fileNameColumn,
    store,
    opts.onlyRowIndices,
    opts.fileHandle
  );
}

/** تنزيل الأرشيف الجاهز صراحة — لا تنزيل تلقائي عند الاكتمال. */
export function confirmDownload() {
  const { downloadReady } = useStore.getState().exportProgress;
  if (downloadReady) triggerDownload(downloadReady.blob, downloadReady.fileName);
}

/** إعادة توليد الصفوف الفاشلة فقط، كأرشيف جديد منفصل. */
export function retryFailedRows() {
  const { errors } = useStore.getState().exportProgress;
  const rowIndices = errors.filter((e) => e.rowIndex >= 0).map((e) => e.rowIndex);
  if (rowIndices.length) return runExport({ onlyRowIndices: rowIndices });
}
