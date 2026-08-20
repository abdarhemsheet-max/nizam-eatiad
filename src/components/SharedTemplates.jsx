import React, { useEffect, useState } from 'react';
import { listTemplatesForMode } from '../core/templatesApi.js';
import { useStore } from '../core/store.js';
import Icon from './Icon.jsx';

/* =========================================================================
 *  القوالب الجاهزة التي رفعها المدير لهذا القسم.
 *
 *  تُطلَب عند فتح القسم لا عند إقلاع التطبيق: الموظف قد يعمل بقالبه الخاص
 *  فلا داعي لجلب قائمة لن يفتحها.
 *
 *  القسم كله يختفي إذا لم يرفع المدير شيئاً — صندوق فارغ مكتوب فيه "لا
 *  توجد قوالب" يشغل مساحة ويشوّش على من لا يعنيه الأمر.
 * ========================================================================= */

export default function SharedTemplates({ mode, target = 'template' }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const loadSharedTemplate = useStore((s) => s.loadSharedTemplate);

  useEffect(() => {
    let alive = true;
    listTemplatesForMode(mode)
      .then((rows) => alive && setItems(rows))
      .catch(() => alive && setItems([])); // فشل الجلب لا يمنع العمل بقالب خاص
    return () => {
      alive = false;
    };
  }, [mode]);

  if (items.length === 0) return null;

  async function pick(t) {
    setLoadingId(t.id);
    setError(null);
    try {
      await loadSharedTemplate(t.url, t.name, target);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="shared-templates">
      <h3>قوالب جاهزة</h3>

      <div className="shared-templates-grid">
        {items.map((t) => (
          <button
            key={t.id}
            className="shared-template"
            onClick={() => pick(t)}
            disabled={loadingId !== null}
            title={`${t.name}${t.width ? ` — ${t.width}×${t.height}px` : ''}`}
          >
            <img src={t.url} alt="" loading="lazy" />
            <span className="shared-template-name">{t.name}</span>
            {loadingId === t.id && (
              <span className="shared-template-busy">
                <Icon name="refresh" size={16} className="spin" />
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="auth-message error">{error}</div>}
    </div>
  );
}
