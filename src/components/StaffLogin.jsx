import React, { useRef, useState } from 'react';
import { loginWithCode } from '../core/staffApi.js';
import Icon from './Icon.jsx';

/* =========================================================================
 *  دخول الموظف برمز من ثلاثة أرقام يسلّمه المدير.
 *
 *  ثلاثة صناديق منفصلة لا حقل واحد: الرمز قصير ويُملى شفهياً غالباً،
 *  والصناديق تجعل عدد الأرقام المطلوبة واضحاً بلا شرح، وتنقل التركيز
 *  تلقائياً فلا يحتاج المستخدم للمس الشاشة ثلاث مرات.
 * ========================================================================= */

export default function StaffLogin({ onAdminLogin }) {
  const [digits, setDigits] = useState(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refs = [useRef(null), useRef(null), useRef(null)];

  const code = digits.join('');

  function setDigit(index, value) {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError(null);
    if (digit && index < 2) refs[index + 1].current?.focus();
  }

  function onKeyDown(index, e) {
    // الرجوع بالمسح من صندوق فارغ يعيدك للسابق — بدونه يعلق المستخدم.
    if (e.key === 'Backspace' && !digits[index] && index > 0) refs[index - 1].current?.focus();
    if (e.key === 'ArrowLeft' && index < 2) refs[index + 1].current?.focus();
    if (e.key === 'ArrowRight' && index > 0) refs[index - 1].current?.focus();
  }

  /** لصق الرمز كاملاً دفعة واحدة — أسرع طريق حين يصل الرمز في رسالة. */
  function onPaste(e) {
    const pasted = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').slice(0, 3);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', ''];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    refs[Math.min(pasted.length, 2)].current?.focus();
  }

  async function submit(e) {
    e.preventDefault();
    if (code.length !== 3) {
      setError('أدخل الأرقام الثلاثة كاملة.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await loginWithCode(code);
      // النجاح لا يحتاج شيئاً هنا: تغيّر الجلسة يُحدّث الواجهة من نفسه.
    } catch (err) {
      setError(err.message);
      setDigits(['', '', '']);
      refs[0].current?.focus();
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
        <p>أدخل رمز الدخول الذي أعطاك إياه المدير</p>
      </div>

      <form className="auth-card glass-panel" onSubmit={submit}>
        <h3>رمز الدخول</h3>

        <div className="code-inputs" dir="ltr" onPaste={onPaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={refs[i]}
              className="code-digit"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={1}
              value={digit}
              disabled={loading}
              aria-label={`الرقم ${i + 1} من 3`}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && <div className="auth-message error">{error}</div>}

        <button
          className="btn-modal primary"
          type="submit"
          disabled={loading || code.length !== 3}
          style={{ marginTop: 18 }}
        >
          {loading ? <Icon name="refresh" size={15} className="spin" /> : <Icon name="unlock" size={15} />}
          {loading ? 'جارٍ الدخول…' : 'دخول'}
        </button>

        <p className="hint-text" style={{ marginTop: 14, textAlign: 'center' }}>
          لا تملك رمزاً؟ اطلبه من مدير النظام — الحسابات تُنشأ من لوحة المدير وحدها.
        </p>

        {onAdminLogin && (
          <button type="button" className="link-btn" onClick={onAdminLogin}>
            دخول المدير بالبريد وكلمة المرور
          </button>
        )}
      </form>
    </div>
  );
}
