import React, { useState } from 'react';
import { useSession, isAdmin, signOut } from '../core/session.js';
import { SUPABASE_READY } from '../core/supabase.js';
import AuthScreen from '../components/AuthScreen.jsx';
import Icon from '../components/Icon.jsx';
import UsersPanel from './UsersPanel.jsx';
import StatsPanel from './StatsPanel.jsx';
import TemplatesPanel from './TemplatesPanel.jsx';
import StaffPanel from './StaffPanel.jsx';

/* =========================================================================
 *  لوحة المدير — صفحة مستقلة (admin.html) لا يصل إليها التطبيق العادي.
 *
 *  الفصل هنا لأجل الحزمة لا لأجل الأمان: كود اللوحة لا يُحمَّل مع التطبيق
 *  الذي يفتحه كل مستخدم. أما الأمان فمصدره الوحيد سياسات RLS — لو فتح
 *  غير مدير هذا الرابط لرأى الشاشة نفسها فارغة تماماً، ولو حاول تعديل
 *  دور أحد لرفض الخادم الطلب. رسالة "لا تملك صلاحية" أدناه مجاملة
 *  للمستخدم، لا حاجز.
 * ========================================================================= */

const TABS = [
  { id: 'stats', label: 'الإحصاءات', icon: 'zap' },
  { id: 'staff', label: 'الموظفون', icon: 'table' },
  { id: 'users', label: 'كل الحسابات', icon: 'layers' },
  { id: 'templates', label: 'القوالب المشتركة', icon: 'image' },
];

export default function AdminApp() {
  const { ready, user, profile } = useSession();
  const [tab, setTab] = useState('staff');

  if (!SUPABASE_READY) {
    return (
      <AdminShell>
        <div className="admin-notice">
          <Icon name="alert" size={26} />
          <h2>الاتصال بقاعدة البيانات غير مُعَدّ</h2>
          <p>
            متغيّرا <code>VITE_SUPABASE_URL</code> و <code>VITE_SUPABASE_ANON_KEY</code> غير
            موجودين في هذا البناء، ولوحة المدير لا تعمل بدونهما.
          </p>
        </div>
      </AdminShell>
    );
  }

  if (!ready) {
    return (
      <AdminShell>
        <div className="admin-notice">
          <Icon name="refresh" size={26} className="spin" />
          <p>جارٍ التحقّق من الجلسة…</p>
        </div>
      </AdminShell>
    );
  }

  // allowSignUp=false: التسجيل العام مغلق على مستوى المشروع، فزرّ
  // "أنشئ حساباً" لن يقود إلا إلى رفض من الخادم.
  if (!user) {
    return (
      <AuthScreen
        headline="لوحة المدير"
        subline="سجّل الدخول بحساب مدير للمتابعة"
        allowSignUp={false}
      />
    );
  }

  if (!isAdmin(profile)) {
    return (
      <AdminShell>
        <div className="admin-notice">
          <Icon name="lock" size={26} />
          <h2>لا تملك صلاحية الدخول</h2>
          <p>
            دخلت بحساب <strong dir="ltr">{user.email}</strong>، وهو ليس حساب مدير
            {profile?.status === 'suspended' ? ' (الحساب موقوف حالياً).' : '.'}
          </p>
          <div className="admin-notice-actions">
            <button className="btn-modal" onClick={signOut}>
              <Icon name="undo" size={15} /> تسجيل الخروج
            </button>
            <a className="btn-modal primary" href="./index.html">
              <Icon name="home" size={15} /> العودة للنظام
            </a>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      email={user.email}
      tabs={
        <nav className="admin-tabs" aria-label="أقسام اللوحة">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`admin-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </nav>
      }
    >
      {tab === 'stats' && <StatsPanel />}
      {tab === 'staff' && <StaffPanel />}
      {tab === 'users' && <UsersPanel currentUserId={user.id} />}
      {tab === 'templates' && <TemplatesPanel />}
    </AdminShell>
  );
}

function AdminShell({ children, email, tabs }) {
  return (
    <div className="admin-page">
      <header className="admin-header glass-panel">
        <div className="admin-brand">
          <span className="brand-mark" />
          <h1>
            نظام <span>اعتياد</span>
          </h1>
          <span className="admin-badge">لوحة المدير</span>
        </div>

        {email && (
          <div className="admin-account">
            <span className="admin-account-email" dir="ltr">
              {email}
            </span>
            <a className="btn-icon" href="./index.html" title="العودة للنظام" aria-label="العودة للنظام">
              <Icon name="home" size={15} />
            </a>
            <button className="btn-icon" onClick={signOut} title="تسجيل الخروج" aria-label="تسجيل الخروج">
              <Icon name="undo" size={15} />
            </button>
          </div>
        )}
      </header>

      {tabs}

      <main className="admin-body">{children}</main>
    </div>
  );
}
