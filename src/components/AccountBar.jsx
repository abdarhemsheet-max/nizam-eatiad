import React, { useState } from 'react';
import { useSession, isAdmin, signOut, startSession } from '../core/session.js';
import { SUPABASE_READY } from '../core/supabase.js';
import AuthScreen from './AuthScreen.jsx';
import StaffLogin from './StaffLogin.jsx';
import Icon from './Icon.jsx';

/* =========================================================================
 *  شريط الحساب في زاوية الشاشة الرئيسية.
 *
 *  الدخول اختياري بالكامل: النظام يعمل كما هو بلا حساب، والحساب يضيف
 *  الحفظ السحابي فقط. لذلك هذا شريط صغير في الزاوية لا حاجز على المدخل —
 *  إجبار التسجيل كان سيهدم أهم ما يميّز النظام: أن الملفات لا تغادر الجهاز.
 *
 *  للموظف رمز من ثلاثة أرقام، وللمدير بريد وكلمة مرور. الرمز هو الواجهة
 *  الافتراضية لأنه حال الأغلبية؛ دخول المدير خلف رابط صغير.
 * ========================================================================= */

export default function AccountBar() {
  const { ready, user, profile } = useSession();
  const [mode, setMode] = useState(null); // null | 'staff' | 'admin'

  // بلا مفاتيح Supabase لا يوجد حساب أصلاً، فإظهار زر دخول معطّل تشويش.
  if (!SUPABASE_READY || !ready) return null;

  if (mode && !user) {
    return (
      <div className="auth-overlay">
        {mode === 'staff' ? (
          <StaffLogin onAdminLogin={() => setMode('admin')} />
        ) : (
          <AuthScreen
            headline={
              <>
                دخول <span>المدير</span>
              </>
            }
            subline="بالبريد الإلكتروني وكلمة المرور"
            onSkip={() => setMode('staff')}
            skipLabel="الرجوع إلى الدخول بالرمز"
            allowSignUp={false}
          />
        )}

        <button className="auth-close btn-icon" onClick={() => setMode(null)} title="إغلاق" aria-label="إغلاق شاشة الدخول">
          <Icon name="x" size={16} />
        </button>
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
            setMode('staff');
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
      <span className="account-email" dir={profile?.full_name ? 'rtl' : 'ltr'} title={user.email}>
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
