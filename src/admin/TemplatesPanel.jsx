import React, { useEffect, useRef, useState } from 'react';
import { listSharedTemplates, uploadSharedTemplate, deleteSharedTemplate } from '../core/adminApi.js';
import Icon from '../components/Icon.jsx';

/* =========================================================================
 *  القوالب المشتركة: يرفعها المدير فيراها كل المستخدمين جاهزة للاستعمال،
 *  بدل أن يرفع كل واحد نسخته من القالب نفسه.
 * ========================================================================= */

export default function TemplatesPanel() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  async function refresh() {
    try {
      setError(null);
      setItems(await listSharedTemplates());
    } catch (err) {
      setError(err.message);
      setItems([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleFiles(files) {
    const list = Array.from(files || []);
    if (list.length === 0) return;

    setBusy(true);
    setError(null);
    // رفع متسلسل لا متوازٍ: الفشل في منتصف دفعة متوازية يترك المدير بلا
    // معرفة أي ملف نجح، والعدد هنا صغير فلا مكسب من التوازي.
    const failed = [];
    for (const file of list) {
      try {
        await uploadSharedTemplate(file);
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    if (failed.length) setError(failed.join(' — '));
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    await refresh();
  }

  async function handleDelete(t) {
    setBusy(true);
    setError(null);
    try {
      await deleteSharedTemplate(t);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <h2>القوالب المشتركة</h2>
        <button className="btn-icon" onClick={refresh} title="تحديث" aria-label="تحديث القائمة">
          <Icon name="refresh" size={15} />
        </button>
      </div>

      <label className="upload-box" style={{ display: 'block' }}>
        <div className="upload-icon">
          <Icon name={busy ? 'refresh' : 'image'} size={26} className={busy ? 'spin' : undefined} />
        </div>
        <div>{busy ? 'جارٍ الرفع…' : 'اسحب صور القوالب هنا أو اضغط للاختيار'}</div>
        <div className="hint-text">PNG أو JPG أو WebP — حتى ٢٠ ميغابايت للصورة</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {error && <div className="auth-message error">{error}</div>}

      {items === null ? (
        <p className="admin-dim">جارٍ التحميل…</p>
      ) : items.length === 0 ? (
        <p className="empty-hint">لا توجد قوالب مشتركة بعد.</p>
      ) : (
        <div className="admin-templates">
          {items.map((t) => (
            <figure key={t.id} className="admin-template">
              <img src={t.url} alt={t.name} loading="lazy" />
              <figcaption>
                <span className="admin-template-name" title={t.name}>
                  {t.name}
                </span>
                <span className="admin-dim">
                  {t.width && t.height ? `${t.width}×${t.height}` : '—'}
                </span>
              </figcaption>
              <button
                className="btn-icon danger admin-template-del"
                disabled={busy}
                onClick={() => handleDelete(t)}
                title="حذف القالب"
                aria-label={`حذف القالب ${t.name}`}
              >
                <Icon name="trash" size={14} />
              </button>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
