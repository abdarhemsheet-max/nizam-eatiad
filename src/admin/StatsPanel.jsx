import React, { useEffect, useState } from 'react';
import { listUsers, summarize, usageByDay } from '../core/adminApi.js';
import Icon from '../components/Icon.jsx';

/* =========================================================================
 *  الإحصاءات: أرقام مجمّعة ورسم بياني للنشاط اليومي.
 *
 *  الرسم بـ SVG مكتوب يدوياً لا بمكتبة رسوم: البيانات شريط واحد لكل يوم،
 *  وإضافة مكتبة تخطيط كاملة لأجلها تُضخّم حزمة اللوحة بلا مقابل.
 * ========================================================================= */

const RANGES = [
  { days: 7, label: '٧ أيام' },
  { days: 30, label: '٣٠ يوماً' },
  { days: 90, label: '٩٠ يوماً' },
];

export default function StatsPanel() {
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    listUsers()
      .then((users) => alive && setSummary(summarize(users)))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setSeries(null);
    usageByDay(days)
      .then((rows) => alive && setSeries(rows))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [days]);

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <h2>الإحصاءات</h2>
      </div>

      {error && <div className="auth-message error">{error}</div>}

      <div className="admin-cards">
        <StatCard icon="table" label="المستخدمون" value={summary?.users} />
        <StatCard icon="lock" label="المديرون" value={summary?.admins} />
        <StatCard icon="ban" label="الحسابات الموقوفة" value={summary?.suspended} />
        <StatCard icon="layers" label="المشاريع المحفوظة" value={summary?.projects} />
        <StatCard icon="zap" label="إجمالي المُولَّد" value={summary?.generated} />
      </div>

      <div className="admin-chart-head">
        <h3>النشاط اليومي</h3>
        <div className="align-group admin-range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              className={`checkbox-btn${days === r.days ? ' active' : ''}`}
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {series === null ? (
        <p className="admin-dim">جارٍ التحميل…</p>
      ) : (
        <UsageChart series={series} />
      )}
    </section>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="admin-card">
      <div className="admin-card-icon">
        <Icon name={icon} size={18} />
      </div>
      <div className="admin-card-body">
        <div className="admin-card-value">{value === undefined ? '—' : value.toLocaleString('ar-EG')}</div>
        <div className="admin-card-label">{label}</div>
      </div>
    </div>
  );
}

function UsageChart({ series }) {
  const max = Math.max(1, ...series.map((d) => d.total));
  const total = series.reduce((s, d) => s + d.total, 0);

  if (total === 0) {
    return <p className="empty-hint">لا نشاط مسجّل في هذه الفترة.</p>;
  }

  const W = 720;
  const H = 180;
  const gap = series.length > 45 ? 1 : 3;
  const barW = (W - gap * (series.length - 1)) / series.length;

  const label = (day) =>
    new Intl.DateTimeFormat('ar', { calendar: 'gregory', day: 'numeric', month: 'short' }).format(
      new Date(day + 'T00:00:00'),
    );

  return (
    <div className="admin-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`النشاط اليومي، الإجمالي ${total}`}>
        {/* خطوط إسناد أفقية — بدونها يصعب تقدير ارتفاع أي شريط */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H - f * H}
            y2={H - f * H}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        ))}
        {series.map((d, i) => {
          const h = d.total === 0 ? 0 : Math.max(2, (d.total / max) * (H - 8));
          return (
            <rect
              key={d.day}
              x={i * (barW + gap)}
              y={H - h}
              width={barW}
              height={h}
              rx={barW > 6 ? 2 : 0}
              fill="var(--primary-color)"
              opacity={d.total === 0 ? 0.15 : 0.85}
            >
              <title>{`${label(d.day)}: ${d.total}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="admin-chart-axis">
        <span>{label(series[0].day)}</span>
        <span className="admin-chart-total">الإجمالي: {total.toLocaleString('ar-EG')}</span>
        <span>{label(series[series.length - 1].day)}</span>
      </div>
    </div>
  );
}
