import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
