/* =========================================================================
 *  تجمّع عمّال ثابت العدد — كل شهادة تُرسَل لأول عامل متفرّغ.
 *
 *  حجم التجمّع نفسه هو حد التوازي الفعلي: طلب رسم شهادة رقم 150 ينتظر في
 *  طابور داخلي حتى يتفرّغ أحد العمّال الأربعة (أو أياً كان العدد)، فلا يمكن
 *  إطلاقاً أن تُرسَم أكثر من N شهادة في نفس اللحظة — N هي حجم التجمّع.
 * ========================================================================= */

let taskSeq = 0;

class PooledWorker {
  constructor() {
    // بناء الرابط يجب أن يبقى هنا حرفياً ومباشراً داخل new Worker() — تحليل Vite
    // الساكن الذي يُعيد كتابة هذا المسار إلى ملف مبني بجذّة (hashed) عند البناء
    // الإنتاجي يشترط أن يكون new URL(...) ملاصقاً لـ new Worker() في نفس الموضع؛
    // تمريره كقيمة جاهزة من ملف آخر (كما كان سابقاً) ينجح في وضع التطوير فقط
    // ويفشل في npm run build بخطأ MIME type — عولجت هذه العلّة هنا.
    this.worker = new Worker(new URL('./certWorker.js', import.meta.url), { type: 'module' });
    this.busy = false;
    this._pending = new Map();

    this.worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'render-result') {
        const resolver = this._pending.get(msg.taskId);
        if (resolver) {
          this._pending.delete(msg.taskId);
          resolver(msg);
        }
      }
    };
  }

  init(payload) {
    return new Promise((resolve, reject) => {
      const onMsg = (e) => {
        if (e.data.type === 'init-ok') {
          this.worker.removeEventListener('message', onMsg);
          resolve();
        } else if (e.data.type === 'init-error') {
          this.worker.removeEventListener('message', onMsg);
          reject(new Error(e.data.message));
        }
      };
      this.worker.addEventListener('message', onMsg);
      this.worker.postMessage(payload);
    });
  }

  render(row, needPng, needJpeg) {
    const taskId = ++taskSeq;
    return new Promise((resolve) => {
      this._pending.set(taskId, resolve);
      this.worker.postMessage({ type: 'render', taskId, row, needPng, needJpeg });
    });
  }

  terminate() {
    try {
      this.worker.postMessage({ type: 'dispose' });
    } catch {
      /* العامل قد يكون تعطّل بالفعل */
    }
    this.worker.terminate();
  }
}

export class WorkerPool {
  constructor(size) {
    this.size = size;
    this.workers = [];
    this._idle = [];
    this._waiters = [];
  }

  async init(initPayload) {
    this.workers = Array.from({ length: this.size }, () => new PooledWorker());
    await Promise.all(this.workers.map((w) => w.init(initPayload)));
    this._idle = [...this.workers];
  }

  _acquire() {
    if (this._idle.length) return Promise.resolve(this._idle.pop());
    return new Promise((resolve) => this._waiters.push(resolve));
  }

  _release(worker) {
    if (this._waiters.length) {
      const next = this._waiters.shift();
      next(worker);
    } else {
      this._idle.push(worker);
    }
  }

  /** يرسم صفاً واحداً على أول عامل متفرّغ، وينتظر حتى يتفرّغ واحد إن كانوا جميعاً مشغولين. */
  async render(row, { needPng, needJpeg }) {
    const worker = await this._acquire();
    try {
      const result = await worker.render(row, needPng, needJpeg);
      return result;
    } finally {
      this._release(worker);
    }
  }

  dispose() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this._idle = [];
    this._waiters = [];
  }
}
