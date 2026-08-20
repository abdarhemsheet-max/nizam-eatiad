import { Zip, ZipPassThrough } from 'fflate';

/* =========================================================================
 *  كاتب ZIP متدفق حقيقي — يضيف كل ملف فور توفّره بدل تجميع كل الشهادات
 *  (200 PNG + 200 PDF) في الذاكرة قبل الضغط، كما كانت تفعل JSZip ضمنياً
 *  عبر generateAsync() التي تحتاج كل الملفات جاهزة أولاً.
 *
 *  STORE لا Deflate عمداً: الملفات الناتجة (PNG/PDF) مضغوطة أصلاً بصيغتها،
 *  وإعادة ضغطها تستهلك وقت معالج بلا أي فائدة تُذكر في الحجم.
 *
 *  مساران للإخراج النهائي:
 *   1) File System Access API (Chrome/Edge): كتابة مباشرة على القرص أثناء
 *      التوليد — استهلاك ذاكرة شبه صفري بصرف النظر عن عدد الشهادات، ولا
 *      يبدأ الملف صالحاً للفتح إلا بعد close() في النهاية (يطابق شرط
 *      "لا يبدأ التحميل قبل الاكتمال" لأنه ليس تنزيل متصفح تقليدياً أصلاً).
 *   2) احتياطي في الذاكرة (كل المتصفحات): تجميع القطع المضغوطة (لا الكتل
 *      الخام) في مصفوفة، وتجميعها في Blob واحد فقط عند النهاية لتنزيله.
 * ========================================================================= */

/**
 * ملاحظة: طلب موضع الحفظ (showSaveFilePicker) يحتاج بادرة مستخدم مباشرة
 * (transient activation) لا تنجو من انتظار جلب الخطوط/تهيئة العمّال. لذلك
 * يستدعيه Sidebar.jsx مباشرة من مُعالج ضغطة الزر (بلا استيراد هذه الوحدة —
 * فالدالة عامة `window.showSaveFilePicker` ولا تحتاج استيراداً أصلاً)، ثم
 * يمرّر النتيجة (handle أو null) إلى exporter.js عبر { fileHandle }.
 */

class StreamingZipWriter {
  constructor({ fileHandle } = {}) {
    this._writable = null;
    this._fileHandle = fileHandle ?? null;
    this._memoryChunks = fileHandle ? null : [];
    this._writeQueue = Promise.resolve();
    this._closed = false;

    this._zip = new Zip((err, chunk, final) => {
      if (err) {
        this._error = err;
        return;
      }
      this._enqueueChunk(chunk);
      if (final) this._finalized = true;
    });
  }

  async _ensureWritable() {
    if (!this._fileHandle || this._writable) return;
    this._writable = await this._fileHandle.createWritable();
  }

  _enqueueChunk(chunk) {
    // نضمن ترتيب الكتابة الصحيح حتى لو وصلت القطع بشكل متزامن من fflate
    this._writeQueue = this._writeQueue.then(async () => {
      if (this._memoryChunks) {
        this._memoryChunks.push(chunk);
      } else {
        await this._ensureWritable();
        await this._writable.write(chunk);
      }
    });
  }

  /** إضافة ملف واحد كاملاً إلى الأرشيف (بلا ضغط — STORE). */
  async addFile(name, blob) {
    if (this._error) throw this._error;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const entry = new ZipPassThrough(name);
    this._zip.add(entry);
    entry.push(bytes, true);
    await this._writeQueue;
    if (this._error) throw this._error;
  }

  /** إنهاء الأرشيف. يُعيد Blob في المسار الاحتياطي، أو null بعد الكتابة المباشرة للقرص. */
  async finish() {
    this._zip.end();
    await this._writeQueue;
    if (this._error) throw this._error;

    if (this._memoryChunks) {
      const blob = new Blob(this._memoryChunks, { type: 'application/zip' });
      this._memoryChunks = null; // تحرير فوري — لا حاجة للقطع الخام بعد تجميعها
      return blob;
    }

    await this._writable.close();
    this._closed = true;
    return null;
  }

  /** إلغاء فوري — يحذف الملف الجزئي على القرص إن وُجد بدل تركه تالفاً. */
  async abort() {
    this._memoryChunks = null;
    if (this._writable && !this._closed) {
      try {
        await this._writable.abort();
      } catch {
        /* تجاهل: بعض المتصفحات ترفض abort على تيار مغلق أصلاً */
      }
    }
    if (this._fileHandle?.remove) {
      try {
        await this._fileHandle.remove();
      } catch {
        /* الملف قد لا يكون أُنشئ فعلياً بعد */
      }
    }
  }
}

export { StreamingZipWriter };
