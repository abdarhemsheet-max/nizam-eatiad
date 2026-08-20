import React, { useState } from 'react';
import { supabase } from '../core/supabase.js';

/* =========================================================================
 *  شاشة تسجيل الدخول: الدخول أو إنشاء حساب جديد (بريد إلكتروني + كلمة مرور)
 *  عبر Supabase Auth. بعد الدخول يظهر النظام الكامل مع حفظ المشاريع سحابياً.
 * ========================================================================= */

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || password.length < 6) {
      setError('أدخل بريداً إلكترونياً وكلمة مرور (6 أحرف على الأقل).');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setNotice('تم إنشاء الحساب! تفقّد بريدك الإلكتروني لتأكيده ثم سجّل الدخول.');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
          }
          throw error;
        }
      }
    } catch (err) {
      setError(err.message || 'حدث خطأ غير متوقع.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>
          <span className="brand-mark" />
          نظام <span>اعتياد</span>
        </h1>
        <p>{isSignUp ? 'أنشئ حساباً جديداً لحفظ مشاريعك' : 'سجّل الدخول للوصول إلى مشاريعك المحفوظة'}</p>
      </div>

      <form className="auth-card glass-panel" onSubmit={handleSubmit}>
        <h3>{isSignUp ? 'حساب جديد' : 'تسجيل الدخول'}</h3>

        <label className="field-label">البريد الإلكتروني</label>
        <input
          className="manual-text-input"
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />

        <label className="field-label" style={{ marginTop: 14 }}>كلمة المرور</label>
        <input
          className="manual-text-input"
          type="password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
        />

        {error && <div className="auth-message error">{error}</div>}
        {notice && <div className="auth-message success">{notice}</div>}

        <button className="btn-modal primary" type="submit" disabled={loading} style={{ marginTop: 18 }}>
          {loading ? '...' : isSignUp ? 'إنشاء الحساب' : 'دخول'}
        </button>

        <button type="button" className="link-btn" onClick={() => setIsSignUp((v) => !v)}>
          {isSignUp ? 'لديك حساب بالفعل؟ سجّل الدخول' : 'ليس لديك حساب؟ أنشئ حساباً جديداً'}
        </button>
      </form>
    </div>
  );
}
