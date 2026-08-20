import React, { useEffect, useState } from 'react';
import { listStaff, createStaff, regenerateCode } from '../core/staffApi.js';
import { setUserStatus, setAllowedModes } from '../core/adminApi.js';
import Icon from '../components/Icon.jsx';
import { MODES } from '../core/modes.js';

/* =========================================================================
 *  الموظفون: إنشاء حساب باسم الموظف، وتسليمه رمزاً من ثلاثة أرقام.
 *
 *  الرمز معروض للمدير دائماً لا مرة واحدة: هو من يسلّمه شفهياً، وإخفاؤه
 *  بعد الإنشاء يعني تجديده كلما نسيه أحد — والتجديد يُبطل رمز الموظف
 *  القديم فيقطعه عن النظام بلا سبب.
 * ========================================================================= */

const fmtDate = (v) =>
  v ? new Intl.DateTimeFormat('ar', { calendar: 'gregory', dateStyle: 'medium' }).format(new Date(v)) : '—';

export default function StaffPanel() {
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState(null);

  async function refresh() {
    try {
      setError(null);
      setStaff(await listStaff());
    } catch (err) {
      setError(err.message);
      setStaff([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    const fullName = name.trim();
    if (!fullName) return;

    setBusy(true);
    setError(null);
    try {
      const created = await createStaff(fullName);
      setJustCreated({ name: fullName, code: created.code });
      setName('');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate(row) {
    setBusy(true);
    setError(null);
    try {
      const code = await regenerateCode(row.id);
      setJustCreated({ name: row.full_name, code });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /** تبديل قسم واحد لموظف. الحارس في قاعدة البيانات يمنع الموظف من فعلها لنفسه. */
  async function toggleMode(row, modeId) {
    const current = Array.isArray(row.allowed_modes) ? row.allowed_modes : [];
    const next = current.includes(modeId)
      ? current.filter((m) => m !== modeId)
      : [...current, modeId];

    setBusy(true);
    setError(null);
    try {
      await setAllowedModes(row.id, next);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(row) {
    setBusy(true);
    setError(null);
    try {
      await setUserStatus(row.id, row.status === 'active' ? 'suspended' : 'active');
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
        <h2>الموظفون</h2>
        <button className="btn-icon" onClick={refresh} title="تحديث" aria-label="تحديث القائمة">
          <Icon name="refresh" size={15} />
        </button>
      </div>

      <form className="staff-create" onSubmit={handleCreate}>
        <input
          className="manual-text-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم الموظف"
          disabled={busy}
          aria-label="اسم الموظف الجديد"
        />
        <button className="btn-add" type="submit" disabled={busy || !name.trim()}>
          <Icon name={busy ? 'refresh' : 'plus'} size={15} className={busy ? 'spin' : undefined} />
          إنشاء حساب
        </button>
      </form>

      {justCreated && (
        <div className="staff-code-reveal">
          <div>
            رمز <strong>{justCreated.name}</strong>
          </div>
          <div className="staff-code-value" dir="ltr">
            {justCreated.code}
          </div>
          <button className="link-btn" onClick={() => setJustCreated(null)}>
            إخفاء
          </button>
        </div>
      )}

      {error && <div className="auth-message error">{error}</div>}

      {staff === null ? (
        <p className="admin-dim">جارٍ التحميل…</p>
      ) : staff.length === 0 ? (
        <p className="empty-hint">لا يوجد موظفون بعد — أنشئ أول حساب من الحقل أعلاه.</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>الرمز</th>
                <th>الأقسام المسموحة</th>
                <th>الحالة</th>
                <th>المشاريع</th>
                <th>آخر دخول</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((row) => (
                <tr key={row.id} className={row.status === 'suspended' ? 'is-suspended' : undefined}>
                  <td>
                    <strong>{row.full_name || '—'}</strong>
                    {row.role === 'admin' && <span className="admin-self">مدير</span>}
                  </td>
                  <td>
                    <span className="staff-code-chip" dir="ltr">
                      {row.code}
                    </span>
                  </td>
                  <td>
                    <div className="mode-chips">
                      {MODES.map((m) => {
                        const on = (row.allowed_modes ?? []).includes(m.id);
                        return (
                          <button
                            key={m.id}
                            className={`mode-chip${on ? ' on' : ''}`}
                            disabled={busy}
                            onClick={() => toggleMode(row, m.id)}
                            title={`${on ? 'إخفاء' : 'إظهار'} قسم ${m.title}`}
                            aria-pressed={on}
                          >
                            <Icon name={m.icon} size={12} />
                            {m.title}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <span className={`admin-pill${row.status === 'suspended' ? ' danger' : ' ok'}`}>
                      {row.status === 'suspended' ? 'موقوف' : 'نشط'}
                    </span>
                  </td>
                  <td className="admin-num">{row.projects_count}</td>
                  <td className="admin-dim">{fmtDate(row.last_used_at)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="btn-icon"
                        disabled={busy}
                        onClick={() => handleRegenerate(row)}
                        title="تجديد الرمز (يُبطل الرمز الحالي فوراً)"
                        aria-label={`تجديد رمز ${row.full_name}`}
                      >
                        <Icon name="refresh" size={14} />
                      </button>
                      <button
                        className={`btn-icon${row.status === 'active' ? ' danger' : ''}`}
                        disabled={busy}
                        onClick={() => handleStatus(row)}
                        title={row.status === 'active' ? 'إيقاف الحساب' : 'إعادة التفعيل'}
                        aria-label={row.status === 'active' ? 'إيقاف الحساب' : 'إعادة التفعيل'}
                      >
                        <Icon name={row.status === 'active' ? 'ban' : 'check'} size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint-text">
        الرمز ثلاثة أرقام — ألف احتمال فقط. الخادم يقفل العنوان بعد ٨ محاولات فاشلة خلال ١٥
        دقيقة، وهذا يُبطئ التخمين ولا يمنعه. لا تحفظ في النظام ما لا تحتمل تسرّبه.
      </p>
    </section>
  );
}
