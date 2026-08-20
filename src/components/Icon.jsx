import React from 'react';

/* =========================================================================
 *  مجموعة أيقونات خطّية موحّدة (SVG مباشر، بلا مكتبة خارجية) — تحل محل
 *  الإيموجي المستخدم سابقاً في كل الأزرار والتبويبات. نفس السُّمك ونفس
 *  الأسلوب الهندسي في كل أيقونة، وهذا بالذات ما يمنح الواجهة هوية موحّدة
 *  بدل شكل "لوحة تحكم AI" النمطي (إيموجي + زجاج + توهّج).
 * ========================================================================= */

const PATHS = {
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="10" r="1.4" />
      <path d="M4 17l5-5 4 4 3-3 4 4" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16M15 4v16" />
    </>
  ),
  camera: (
    <>
      <rect x="2.5" y="7" width="19" height="13" rx="2" />
      <path d="M8 7l1.5-2.5h5L16 7" />
      <circle cx="12" cy="13.5" r="3.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  pen: (
    <>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6.5" r="2" />
      <circle cx="6" cy="17.5" r="2" />
      <path d="M20 4 7.5 15.5M20 20 7.5 8.5" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.4 4.1L18 8.5l-4.6 1.4L12 14l-1.4-4.1L6 8.5l4.6-1.4Z" />
      <path d="M19 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M10.6 5.7A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.3 4M6.4 7.4C3.9 9.1 2.5 12 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.3-.6" />
      <path d="M9.9 10a2.6 2.6 0 0 0 3.6 3.6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-1.9" />
    </>
  ),
  zap: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" stroke="none" />,
  bot: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="2.5" />
      <path d="M12 9V5" />
      <circle cx="12" cy="4" r="1.3" />
      <circle cx="9" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  refresh: <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  download: <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  package: <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" />,
  check: <path d="M5 13l4 4L19 7" />,
  x: <path d="M6 6l12 12M6 18 18 6" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  resize: <path d="M20 4 4 20M20 4v6M20 4h-6M4 20v-6M4 20h6" />,
  undo: <path d="M3 7v6h6M3 13a9 9 0 1 0 3-6.7" />,
  redo: <path d="M21 7v6h-6M21 13a9 9 0 1 1-3-6.7" />,
  layers: <path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />,
  trash: (
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m5 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
  ),
  alert: <path d="M12 2 1 21h22L12 2ZM12 9v4m0 3.2v.2" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  shadow: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M14.5 14.5a6.5 6.5 0 1 0-4-4" opacity="0.5" />
    </>
  ),
  sparkle: (
    <path d="M12 3l1.4 4.1L18 8.5l-4.6 1.4L12 14l-1.4-4.1L6 8.5l4.6-1.4Z" />
  ),
  type: <path d="M5 6V4h14v2M9 20h6M12 4v16" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 11 12 3.5 20.5 11" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </>
  ),
};

/**
 * أيقونة خطية 1.8px بلونٍ يرِث من العنصر الأب (currentColor) — استبدال مباشر
 * للإيموجي: <Icon name="settings" /> بدل ⚙️، بنفس مكان الاستخدام تماماً.
 */
export default function Icon({ name, size = 18, className, style, title }) {
  const content = PATHS[name];
  if (!content) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {content}
    </svg>
  );
}
