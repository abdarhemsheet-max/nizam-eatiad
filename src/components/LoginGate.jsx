import React, { useState } from 'react';
import AuthScreen from './AuthScreen.jsx';
import StaffLogin from './StaffLogin.jsx';

/* =========================================================================
 *  حاجز الدخول: لا يُستعمل النظام قبل تسجيل الدخول.
 *
 *  للموظف رمز من ثلاثة أرقام، وللمدير بريد وكلمة مرور. الرمز هو الواجهة
 *  الافتراضية لأنه حال الأغلبية، ودخول المدير خلف رابط صغير أسفل النموذج.
 *
 *  لا يوجد هنا "متابعة بلا حساب": صاحب النظام اختار أن يكون الدخول
 *  إلزامياً ليعرف من ولّد ماذا، ولتُقيَّد الأقسام على كل موظف.
 * ========================================================================= */

export default function LoginGate() {
  const [asAdmin, setAsAdmin] = useState(false);

  if (asAdmin) {
    return (
      <AuthScreen
        headline={
          <>
            دخول <span>المدير</span>
          </>
        }
        subline="بالبريد الإلكتروني وكلمة المرور"
        allowSignUp={false}
        onSkip={() => setAsAdmin(false)}
        skipLabel="الرجوع إلى الدخول بالرمز"
      />
    );
  }

  return <StaffLogin onAdminLogin={() => setAsAdmin(true)} />;
}
