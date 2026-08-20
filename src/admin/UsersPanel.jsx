import React, { useEffect, useState } from 'react';
import { listUsers, listUserProjects, setUserRole, setUserStatus } from '../core/adminApi.js';
import Icon from '../components/Icon.jsx';

/* =========================================================================
 *  المستخدمون: القائمة، وتغيير الدور والحالة، ومشاريع كل مستخدم.
 *
 *  المشاريع تُطلَب عند فتح صفّ المستخدم لا مع القائمة — لوحة فيها مئة
 *  مستخدم لا يجوز أن تجلب مشاريع الجميع لتعرض ثلاثة منها.
 * ========================================================================= */

const fmtDate = (v) =>
  v ? new Intl.DateTimeFormat('ar', { calendar: 'gregory', dateStyle: 'medium' }).format(new Date(v)) : '—';

export default function UsersPanel({ currentUserId }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [openId, setOpenId] = useState(null);

  async function refresh() {
    try {
      setError(null);
      setUsers(await listUsers());
    } catch (err) {
      setError(err.message);
      setUsers([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function apply(userId, fn) {
    setBusyId(userId);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (users === null) {
    return (
      <div className="admin-notice">
        <Icon name="refresh" size={22} className="spin" />
        <p>جارٍ تحميل المستخدمين…</p>
      </div>
    );
  }

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <h2>المستخدمون</h2>
        <button className="btn-icon" onClick={refresh} title="تحديث" aria-label="تحديث القائمة">
          <Icon name="refresh" size={15} />
        </button>
      </div>

      {error && <div className="auth-message error">{error}</div>}

      {users.length === 0 ? (
        <p className="empty-hint">لا يوجد مستخدمون مسجّلون بعد.</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>الحساب</th>
                <th>الدور</th>
                <th>الحالة</th>
                <th>المشاريع</th>
                <th>المُولَّد</th>
                <th>آخر نشاط</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === currentUserId;
                const busy = busyId === u.id;
                const open = openId === u.id;
                return (
                  <React.Fragment key={u.id}>
                    <tr className={u.status === 'suspended' ? 'is-suspended' : undefined}>
                      <td>
                        <button
                          className="admin-user-cell"
                          onClick={() => setOpenId(open ? null : u.id)}
                          aria-expanded={open}
                        >
                          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={13} />
                          <span dir="ltr">{u.email || u.id.slice(0, 8)}</span>
                        </button>
                        {self && <span className="admin-self">أنت</span>}
                      </td>
                      <td>
                        <span className={`admin-pill${u.role === 'admin' ? ' gold' : ''}`}>
                          {u.role === 'admin' ? 'مدير' : 'مستخدم'}
                        </span>
                      </td>
                      <td>
                        <span className={`admin-pill${u.status === 'suspended' ? ' danger' : ' ok'}`}>
                          {u.status === 'suspended' ? 'موقوف' : 'نشط'}
                        </span>
                      </td>
                      <td className="admin-num">{u.projects_count}</td>
                      <td className="admin-num">{u.generated_count}</td>
                      <td className="admin-dim">{fmtDate(u.last_activity || u.last_seen_at)}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            className="btn-icon"
                            disabled={busy}
                            title={u.role === 'admin' ? 'إنزال إلى مستخدم' : 'ترقية إلى مدير'}
                            aria-label={u.role === 'admin' ? 'إنزال إلى مستخدم' : 'ترقية إلى مدير'}
                            onClick={() =>
                              apply(u.id, () => setUserRole(u.id, u.role === 'admin' ? 'user' : 'admin'))
                            }
                          >
                            <Icon name={u.role === 'admin' ? 'unlock' : 'lock'} size={14} />
                          </button>
                          <button
                            className={`btn-icon${u.status === 'active' ? ' danger' : ''}`}
                            disabled={busy || self}
                            title={
                              self
                                ? 'لا يمكنك إيقاف حسابك'
                                : u.status === 'active'
                                  ? 'إيقاف الحساب'
                                  : 'إعادة التفعيل'
                            }
                            aria-label={u.status === 'active' ? 'إيقاف الحساب' : 'إعادة التفعيل'}
                            onClick={() =>
                              apply(u.id, () =>
                                setUserStatus(u.id, u.status === 'active' ? 'suspended' : 'active'),
                              )
                            }
                          >
                            <Icon name={u.status === 'active' ? 'ban' : 'check'} size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="admin-detail-row">
                        <td colSpan={7}>
                          <UserProjects userId={u.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UserProjects({ userId }) {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    listUserProjects(userId)
      .then((rows) => alive && setProjects(rows))
      .catch((err) => alive && (setError(err.message), setProjects([])));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (error) return <div className="auth-message error">{error}</div>;
  if (projects === null) return <p className="admin-dim">جارٍ التحميل…</p>;
  if (projects.length === 0) return <p className="admin-dim">لم يحفظ هذا المستخدم أي مشروع.</p>;

  return (
    <ul className="admin-projects">
      {projects.map((p) => (
        <li key={p.id}>
          <Icon name="layers" size={13} />
          <span className="admin-project-name">{p.name}</span>
          <span className="admin-dim">{p.template_name || 'بلا قالب'}</span>
          <span className="admin-dim">{fmtDate(p.updated_at)}</span>
        </li>
      ))}
    </ul>
  );
}
