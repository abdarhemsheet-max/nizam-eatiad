/* =========================================================================
 *  طابور معالجة متزامن محدود (Bounded Concurrency Queue)
 *
 *  ينفّذ عدداً محدوداً من المهام في نفس اللحظة (2–4 افتراضياً)، لا كل
 *  المهام دفعة واحدة — هذا ما يمنع إنشاء 200 عملية رسم/تشفير متزامنة
 *  تُثقل الذاكرة والمعالج معاً. يفشل عنصر واحد فلا يوقف الباقي، ويحترم
 *  الإلغاء بين كل عنصر وآخر.
 * ========================================================================= */

/** عدد عمّال مبدئي يتناسب مع أنوية الجهاز، بحدود معقولة (2–4). */
export function pickInitialConcurrency() {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(2, Math.min(4, cores - 1 || 2));
}

/**
 * @param {Array} items عناصر المهمة (مثلاً صفوف الإكسل)
 * @param {(item, index) => Promise<void>} handler ينفّذ عنصراً واحداً؛ يجب ألا يرمي — الأخطاء تُمرَّر لـ onError
 * @param {object} options
 * @param {number} options.concurrency عدد المهام المتزامنة
 * @param {() => boolean} options.isCancelled يُفحص قبل كل مهمة جديدة
 * @param {(item, index, error) => void} [options.onError]
 */
export async function runQueue(items, handler, { concurrency, isCancelled, onError }) {
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));

  async function worker() {
    while (true) {
      if (isCancelled()) return;
      const index = cursor++;
      if (index >= items.length) return;

      try {
        await handler(items[index], index);
      } catch (err) {
        onError?.(items[index], index, err);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
}
