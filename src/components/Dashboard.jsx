import React from 'react';
import { useStore } from '../core/store.js';
import Icon from './Icon.jsx';
import AccountBar from './AccountBar.jsx';

/* =========================================================================
 *  الشاشة الرئيسية: نقطة الدخول الوحيدة للنظام — 4 مربعات كبيرة، كل واحد
 *  يفتح بيئة عمل مستقلة بالكامل عن البقية (لا شريط تبويبات بعدها؛ الرجوع
 *  لهذه الشاشة هو الطريقة الوحيدة للتنقّل بين الأوضاع). بيانات كل وضع تبقى
 *  محفوظة في المخزن أثناء التنقّل، فالعودة لنفس المربع تستأنف العمل كما تركته.
 * ========================================================================= */

const MODULES = [
  {
    mode: 'auto',
    icon: 'settings',
    title: 'أتمتة',
    desc: 'توليد دفعة شهادات كاملة من ملف إكسل دفعة واحدة.',
  },
  {
    mode: 'manual',
    icon: 'pen',
    title: 'يدوي',
    desc: 'إضافة نصوص وصور يدوياً على شهادة أو صورة واحدة.',
  },
  {
    mode: 'crop',
    icon: 'scissors',
    title: 'قص جماعي',
    desc: 'قص عدة صور بنفس أبعاد قالب واحد وتطبيقه عليها جميعاً.',
  },
  {
    mode: 'posts',
    icon: 'sparkles',
    title: 'نصوص',
    desc: 'توليد نصوص منشورات جاهزة عبر الذكاء الاصطناعي.',
  },
];

export default function Dashboard() {
  const enterMode = useStore((s) => s.enterMode);

  return (
    <div className="dashboard">
      <AccountBar />

      <div className="dashboard-header">
        <h1>
          <span className="brand-mark" />
          نظام <span>اعتياد</span>
        </h1>
        <p>اختر بيئة العمل التي تريدها للبدء</p>
      </div>

      <div className="dashboard-grid">
        {MODULES.map((m) => (
          <button key={m.mode} className="dashboard-card" onClick={() => enterMode(m.mode)}>
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
