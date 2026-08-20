import React, { useState } from 'react';
import { useStore } from '../core/store.js';
import Icon from './Icon.jsx';

/* =========================================================================
 *  نافذة تقدّم التوليد — تعرض التقدّم اللحظي أثناء العمل، وتقريراً نهائياً
 *  (نجاح/فشل + إعادة توليد الفاشلة) وزر تنزيل صريح بعد الاكتمال.
 *
 *  المكتبات الثقيلة محمَّلة أصلاً بحلول ظهور هذه النافذة (Sidebar حمّلتها
 *  لبدء التصدير)، فالاستيراد الديناميكي هنا يُحل فوراً من الذاكرة المؤقتة.
 * ========================================================================= */
const loadExporter = () => import('../core/exporter.js');
const loadCropExporter = () => import('../core/cropExporter.js');

export default function ExportModal() {
  const progress = useStore((s) => s.exportProgress);
  const mode = useStore((s) => s.mode);
  const cancelProgress = useStore((s) => s.cancelProgress);
  const closeProgress = useStore((s) => s.closeProgress);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!progress.running) return null;

  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  // شريط التقدم يبدو "معلّقاً" في طرفيه: 0% أثناء تحميل الخطوط/تهيئة العمّال
  // قبل بدء أول شهادة، و100% ثابتة أثناء إغلاق الأرشيف بعد اكتمال كل الصفوف.
  // في الحالتين لا رقم دقيق متاح، فنعرض شريطاً متحركاً يؤكد أن العمل مستمر —
  // بدل شريط ساكن قد يُقرَأ كتجمّد.
  const indeterminate =
    !progress.finished && (progress.phase === 'zipping' || (progress.phase === 'rendering' && progress.done === 0));
  const isCrop = mode === 'crop';
  const isBatch = mode !== 'manual';
  const failed = progress.errors.length;
  const hasRetryable = progress.errors.some((e) => e.rowIndex >= 0);

  const handleDownload = async () => {
    setBusy(true);
    if (isCrop) {
      const { confirmCropDownload } = await loadCropExporter();
      confirmCropDownload();
    } else {
      const { confirmDownload } = await loadExporter();
      confirmDownload();
    }
    setBusy(false);
  };

  const handleRetry = async () => {
    setBusy(true);
    setShowErrors(false);
    if (isCrop) {
      const { retryFailedCrops } = await loadCropExporter();
      await retryFailedCrops();
    } else {
      const { retryFailedRows } = await loadExporter();
      await retryFailedRows();
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3 className="modal-title">
          {progress.finished ? 'انتهت العملية' : isCrop ? 'جارٍ قصّ ' : 'جارٍ توليد '}
          {!progress.finished && <span>{isCrop ? 'الصور' : 'الشهادات'}</span>}
        </h3>

        <div className="progress-track">
          <div
            className={`progress-fill${indeterminate ? ' indeterminate' : ''}`}
            style={indeterminate ? undefined : { width: `${percent}%` }}
          />
        </div>

        <div className="progress-numbers">
          <span>
            {progress.done} / {progress.total}
          </span>
          <span>{indeterminate ? '...' : `${percent}%`}</span>
        </div>

        {!progress.finished && progress.currentName && isBatch && (
          <div className="modal-current-name">
            جاري إنشاء: <strong>{progress.currentName}</strong>
          </div>
        )}

        {!progress.finished && progress.concurrency > 1 && (
          <div className="modal-concurrency">{progress.concurrency} شهادات بالتوازي</div>
        )}

        <div className="modal-status">{progress.message}</div>

        {/* التقرير النهائي — نجاح/فشل بعد الاكتمال فقط */}
        {progress.finished && isBatch && (
          <div className="modal-summary">
            <div className="summary-row success">
              <Icon name="check" size={15} />
              تم إنشاء: {progress.succeeded}
            </div>
            {failed > 0 && (
              <div className="summary-row danger">
                <Icon name="alert" size={15} />
                فشل: {failed}
                <button className="link-btn" onClick={() => setShowErrors((v) => !v)}>
                  {showErrors ? 'إخفاء الأخطاء' : 'عرض الأخطاء'}
                </button>
              </div>
            )}
          </div>
        )}

        {(!progress.finished || showErrors) && progress.errors.length > 0 && (
          <div className="modal-errors">
            {progress.errors.map((e, i) => (
              <div key={i}>
                {e.name || `صف ${e.rowIndex + 1}`} — {e.message}
              </div>
            ))}
          </div>
        )}

        {progress.finished && progress.downloadReady && (
          <div className="modal-package">
            <Icon name="package" size={16} />
            {progress.downloadReady.fileName}
          </div>
        )}
        {progress.finished && progress.savedToDisk && (
          <div className="modal-package">
            <Icon name="check" size={16} />
            حُفظ الملف مباشرة على القرص الذي اخترته.
          </div>
        )}

        <div className="modal-actions">
          {!progress.finished ? (
            <button className="btn-modal" onClick={cancelProgress} disabled={progress.cancelled}>
              {progress.cancelled ? 'جارٍ الإلغاء...' : 'إلغاء العملية'}
            </button>
          ) : (
            <>
              {failed > 0 && hasRetryable && (
                <button className="btn-modal" onClick={handleRetry} disabled={busy}>
                  <Icon name="refresh" size={15} />
                  إعادة المحاولة للفاشلة
                </button>
              )}
              <button className="btn-modal" onClick={closeProgress} disabled={busy}>
                إغلاق
              </button>
              {progress.downloadReady && (
                <button className="btn-modal primary" onClick={handleDownload} disabled={busy}>
                  <Icon name="download" size={15} />
                  تحميل ZIP
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
