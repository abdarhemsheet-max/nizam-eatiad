import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// تطبيق يعمل بالكامل على المتصفح (Client-Side Only) بدون أي Backend
export default defineConfig({
  plugins: [react()],

  // مسارات نسبية: الناتج يعمل من جذر النطاق أو من مجلد فرعي
  // (GitHub Pages مثلاً) بلا أي تعديل.
  base: './',

  server: {
    port: 5173,
    open: true,
  },

  build: {
    outDir: 'dist',
    // المكتبات الثقيلة (xlsx / jspdf / jszip) تُحمَّل عند الطلب فقط عبر dynamic import،
    // فيبقى التحميل الأول خفيفاً. هنا نفصل React في ملف مستقل ليُخزَّن مؤقتاً بين الإصدارات.
    rollupOptions: {
      // صفحتان مستقلتان: التطبيق ولوحة المدير. الفصل هنا يعني أن كود
      // اللوحة (جداول المستخدمين، الرسم البياني، إدارة الأدوار) لا يُحمَّل
      // إطلاقاً مع التطبيق الذي يفتحه كل مستخدم.
      input: {
        // __dirname غير معرّف في وحدات ESM، و package.json يضبط
        // "type": "module" — فالمسار يُشتق من import.meta.url.
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        admin: fileURLToPath(new URL('admin.html', import.meta.url)),
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
