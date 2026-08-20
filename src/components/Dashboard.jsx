import React from 'react';
import { useStore } from '../core/store.js';
import { useSession } from '../core/session.js';
import { allowedModes } from '../core/modes.js';
import Icon from './Icon.jsx';
import AccountBar from './AccountBar.jsx';

/* =========================================================================
 *  الشاشة الرئيسية: نقطة الدخول الوحيدة للنظام — مربعات كبيرة، كل واحد
 *  يفتح بيئة عمل مستقلة بالكامل عن البقية (لا شريط تبويبات بعدها؛ الرجوع
 *  لهذه الشاشة هو الطريقة الوحيدة للتنقّل بين الأوضاع). بيانات كل وضع تبقى
 *  محفوظة في المخزن أثناء التنقّل، فالعودة لنفس المربع تستأنف العمل كما تركته.
 *
 *  المربعات المعروضة هي ما سمح به المدير لهذا الموظف (allowed_modes في
 *  ملفه). التقييد تنظيمي لا أمني — الأقسام لا تفتح بيانات محمية، وكلها
 *  أدوات تعمل على ملفات المستخدم على جهازه.
 * ========================================================================= */

export default function Dashboard() {
  const enterMode = useStore((s) => s.enterMode);
  const { profile } = useSession();

  const modules = allowedModes(profile);

  return (
    <div className="dashboard">
      <AccountBar />

      <div className="dashboard-header">
        <h1>
          <span className="brand-mark" />
          نظام <span>اعتياد</span>
        </h1>
        <p>
          {modules.length === 0
            ? 'لم يُسمح لحسابك بأي قسم بعد — راجع مدير النظام'
            : 'اختر بيئة العمل التي تريدها للبدء'}
        </p>
      </div>

      <div className="dashboard-grid">
        {modules.map((m) => (
          <button key={m.id} className="dashboard-card" onClick={() => enterMode(m.id)}>
            <div className="dashboard-card-icon">
              <Icon name={m.icon} size={28} />
            </div>
            <div className="dashboard-card-title">{m.title}</div>
            <p className="dashboard-card-desc">{m.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
