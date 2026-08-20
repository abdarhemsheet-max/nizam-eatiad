import React from 'react';
import { useSession, isAdmin, signOut } from '../core/session.js';
import { SUPABASE_READY } from '../core/supabase.js';
import Icon from './Icon.jsx';

/* =========================================================================
 *  شريط الحساب في زاوية الشاشة الرئيسية.
 *
 *  الدخول إلزامي ويجري في LoginGate قبل عرض التطبيق، فهذا الشريط لا
 *  يعرض نموذج دخول: من يصل إلى هنا داخلٌ بالفعل. مهمته إظهار من أنت،
 *  ورابط اللوحة إن كنت مديراً، والخروج.
 * ========================================================================= */

export default function AccountBar() {
  const { ready, user, profile } = useSession();

  if (!SUPABASE_READY || !ready || !user) return null;

  return (
    <div className="account-bar">
      <span
        className="account-email"
        dir={profile?.full_name ? 'rtl' : 'ltr'}
        title={user.email}
      >
        {profile?.full_name || user.email}
      </span>

      {isAdmin(profile) && (
        <a className="account-admin" href="./admin.html">
          <Icon name="zap" size={13} />
          لوحة المدير
        </a>
      )}

      <button className="btn-icon" onClick={signOut} title="تسجيل الخروج" aria-label="تسجيل الخروج">
        <Icon name="undo" size={14} />
      </button>
    </div>
  );
}
