import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import Sidebar from './components/Sidebar.jsx';
import Workspace from './components/Workspace.jsx';
import ExportModal from './components/ExportModal.jsx';
import Icon from './components/Icon.jsx';
import { useStore } from './core/store.js';
import { startSession } from './core/session.js';

/**
 * حاجز أخطاء: بدونه أي خطأ غير متوقع في الإنتاج يترك المستخدم أمام صفحة بيضاء
 * بلا أي تفسير. هنا نعرض رسالة واضحة وزر إعادة تحميل.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('خطأ غير متوقع:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <h2>حدث خطأ غير متوقع</h2>
        <p>يمكنك إعادة تحميل الصفحة والمتابعة. لم يُرفع أي من ملفاتك إلى أي خادم.</p>
        <pre>{String(this.state.error?.message || this.state.error)}</pre>
        <button className="btn-modal primary" onClick={() => window.location.reload()}>
          إعادة تحميل الصفحة
        </button>
      </div>
    );
  }
}

export default function App() {
  const view = useStore((s) => s.view);

  // على الهاتف/الآيباد يتحول الشريط الجانبي إلى درج علوي يُفتح ويُغلق فوق مساحة
  // العمل، بدل تكديسه تحتها (كان سيحتاج تمريراً طويلاً لا يناسب اللمس).
  // القيمة لا تأثير لها على الشاشات الكبيرة — CSS تتجاهلها فوق نقطة الفصل.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // تحذير قبل إغلاق التبويب إذا كان هناك عمل قائم (لا يوجد حفظ تلقائي)
  useEffect(() => {
    const onBeforeUnload = (e) => {
      const { templateImage, activeFields, stashedFields } = useStore.getState();
      const hasWork =
        Boolean(templateImage) ||
        Object.keys(activeFields).length > 0 ||
        Object.keys(stashedFields.auto).length > 0 ||
        Object.keys(stashedFields.manual).length > 0;
      if (!hasWork) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // متابعة الجلسة تبدأ مرة واحدة عند الإقلاع: من دخل سابقاً يجد نفسه
  // داخلاً، ومن لم يدخل قط لا يتغيّر شيء بالنسبة له.
  useEffect(() => {
    startSession();
  }, []);

  if (view === 'dashboard') {
    return (
      <ErrorBoundary>
        <Dashboard />
        <ExportModal />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* خلفية معتمة تُغلق الدرج عند الضغط خارجه — تظهر فقط على الشاشات الصغيرة */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <button
        className="mobile-sidebar-toggle"
        onClick={() => setSidebarOpen((v) => !v)}
        title={sidebarOpen ? 'إخفاء لوحة التحكم' : 'إظهار لوحة التحكم'} aria-label={sidebarOpen ? 'إخفاء لوحة التحكم' : 'إظهار لوحة التحكم'}
      >
        <Icon name={sidebarOpen ? 'x' : 'settings'} size={20} />
      </button>

      <Workspace />
      <ExportModal />
    </ErrorBoundary>
  );
}
