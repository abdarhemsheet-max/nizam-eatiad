import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminApp from './AdminApp.jsx';
import { startSession } from '../core/session.js';
import '../styles.css';
import './admin.css';

// اللوحة بلا جلسة لا تعرض شيئاً، فلا معنى لتأجيل تحميل العميل هنا كما
// نفعل في التطبيق حيث الدخول اختياري.
startSession({ force: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);
