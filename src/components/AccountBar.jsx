import React, { useState } from 'react';
import { useSession, isAdmin, signOut, startSession } from '../core/session.js';
import { SUPABASE_READY } from '../core/supabase.js';
import AuthScreen from './AuthScreen.jsx';
import Icon from './Icon.jsx';

/* =========================================================================
 *  شريط الحساب في زاوية الشاشة الرئيسية.
 *
 *  الدخول اختياري بالكامل: النظام يعمل كما هو بلا حساب، والحساب يضيف
 *  الحفظ السحابي فقط. لذلك هذا شريط صغير في الزاوية لا حاجز على المدخل —
 *  إجبار التسجيل كان سيهدم أهم ما يميّز النظام: أن الملفات لا تغادر الجهاز.
 * ========================================================================= */

export default function AccountBar() {
  const { ready, user, profile } = useSession();
  const [showAuth, setShowAuth] = useState(false);

  // بلا مفاتيح Supabase لا يوجد حساب أصلاً، فإظهار زر دخول معطّل تشويش.
  if (!SUPABASE_READY || !ready) return null;

  if (showAuth && !user) {
    return (
      <div className="auth-overlay">
        <AuthScreen
          headline={
            <>
              حفظ <span>سحابي</span>
            </>
          }
          subline="سجّل الدخول لحفظ مشاريعك واسترجاعها من أي جهاز"
          onSkip={() => setShowAuth(false)}
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="account-bar">
        <button
          className="account-signin"
          onClick={() => {
            // أول لحظة تصبح فيها مكتبة Supabase مطلوبة فعلاً
            startSession({ force: true });
            setShowAuth(true);
          }}
        >
          <Icon name="lock" size={14} />
          تسجيل الدخول
        </button>
      </div>
    );
  }

  return (
    <div className="account-bar">
      <span className="account-email" dir="ltr" title={user.email}>
        {user.email}
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
