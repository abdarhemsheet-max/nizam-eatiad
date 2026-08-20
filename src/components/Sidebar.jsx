import React, { useEffect, useRef, useState } from 'react';
import {
  useStore,
  GOOGLE_FONTS,
  SYSTEM_FONTS,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  CROP_MAX_IMAGES,
  previewText,
  resolveFontName,
  measureLineMetrics,
} from '../core/store.js';
import { generatePost, getTodayInfo, SUGGESTED_MODELS } from '../core/postsApi.js';
import Icon from './Icon.jsx';

/* المكتبات الثقيلة (xlsx / jspdf / fflate) تُحمَّل عند أول استعمال فعلي فقط،
   فلا يدفع من يفتح الصفحة ثمنها في التحميل الأول. postsApi.js خفيف (fetch
   عادي بلا مكتبات) فلا حاجة لتحميله الكسول مثل البقية. */
const loadXLSX = () => import('xlsx');
const loadExporter = () => import('../core/exporter.js');
const loadCropExporter = () => import('../core/cropExporter.js');

/* =========================================================================
 *  اللوحة الجانبية — أوضاع تتشارك نفس لوحة الإعدادات المتقدمة:
 *    أتمتة : قالب + إكسل → توليد دفعة شهادات.
 *    يدوي  : صورة واحدة + نصوص يكتبها المستخدم → تصدير ملف واحد.
 * ========================================================================= */

const MODE_META = {
  auto: { icon: 'settings', label: 'أتمتة' },
  manual: { icon: 'pen', label: 'يدوي' },
  crop: { icon: 'scissors', label: 'قص جماعي' },
  posts: { icon: 'sparkles', label: 'نصوص' },
};

const FONT_LABELS = {
  Cairo: 'Cairo (كايرو)',
  Tajawal: 'Tajawal (تجوال)',
  Almarai: 'Almarai (المراعي)',
  Amiri: 'Amiri (أميري)',
  Changa: 'Changa (تشانجا)',
};

/* ------------------------- صندوق رفع (نقر أو سحب) ------------------------- */
function UploadBox({ icon, hint, accept, fileName, onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file) onFile(file);
    if (inputRef.current) inputRef.current.value = ''; // يسمح بإعادة رفع نفس الملف
  };

  return (
    <div
      className={`upload-box${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="upload-icon">{icon}</div>
      <div>{hint}</div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {fileName && <div className="file-name-display">{fileName}</div>}
    </div>
  );
}

/* --------------------- شريط تمرير مربوط بخانة رقمية --------------------- */
function NumSlider({ label, min, max, value, onChange }) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = (raw) => {
    setText(raw);
    if (raw === '' || raw === '-') return; // انتظار إكمال الكتابة
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    onChange(Math.min(max, Math.max(min, n)));
  };

  return (
    <div className="settings-col">
      <label>{label}</label>
      <div className="slider-group">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(String(value))}
        />
      </div>
    </div>
  );
}

/* ======================= لوحة الإعدادات المتقدمة =========================
 *  مشتركة حرفياً بين حقول الأتمتة والنصوص اليدوية — نفس الخصائص لكليهما.
 * ======================================================================= */
function FieldSettings({ field }) {
  const updateField = useStore((s) => s.updateField);
  const resizeImageField = useStore((s) => s.resizeImageField);
  const toggleAspectLock = useStore((s) => s.toggleAspectLock);
  const templateImage = useStore((s) => s.templateImage);
  const set = (patch) => updateField(field.id, patch);
  const isImage = field.type === 'image';

  /** توسيط أفقي حقيقي: نصوص تُثبَّت على محاذاة الوسط، وصور تُوسَّط بحافتها العلوية اليسرى. */
  const centerH = () => {
    if (!templateImage) return;
    if (isImage) set({ x: Math.round(templateImage.width / 2 - field.w / 2) });
    else set({ align: 'center', x: Math.round(templateImage.width / 2) });
  };

  /** توسيط عمودي: نطرح نصف الارتفاع الفعلي — للصور من w/h، وللنصوص من ارتفاع الأسطر المقيس. */
  const centerV = () => {
    if (!templateImage) return;
    if (isImage) {
      set({ y: Math.round(templateImage.height / 2 - field.h / 2) });
      return;
    }
    const { lineHeight } = measureLineMetrics({ ...field, family: resolveFontName(field) });
    const lines = (previewText(field) || '').split('\n').length;
    set({ y: Math.round(templateImage.height / 2 - (lineHeight * lines) / 2) });
  };

  return (
    <div className="field-options-panel">
      {/* 0. محتوى النص — نصوص الوضع اليدوي فقط (الأتمتة تأخذ نصها من الإكسل) */}
      {field.kind === 'manual' && !isImage && (
        <div className="settings-card">
          <div className="settings-card-title">
            <Icon name="type" size={13} />
            محتوى النص
          </div>
          <textarea
            className="text-content-area"
            rows={2}
            value={field.text}
            placeholder="اكتب النص... (Enter لسطر جديد)"
            onChange={(e) => set({ text: e.target.value })}
          />
        </div>
      )}

      {/* 0ب. أبعاد الصورة — طبقات الصور فقط */}
      {isImage && (
        <div className="settings-card">
          <div className="settings-card-title">
            <Icon name="image" size={13} />
            أبعاد الصورة
          </div>
          <div className="settings-row">
            <div className="settings-col">
              <label>العرض (px):</label>
              <input
                type="text"
                value={field.w}
                onChange={(e) => resizeImageField(field.id, Number(e.target.value) || field.w, field.h)}
              />
            </div>
            <div className="settings-col">
              <label>الارتفاع (px):</label>
              <input
                type="text"
                value={field.h}
                onChange={(e) => resizeImageField(field.id, field.w, Number(e.target.value) || field.h)}
              />
            </div>
          </div>
          <div
            className={`checkbox-btn${field.lockAspect ? ' active' : ''}`}
            onClick={() => toggleAspectLock(field.id)}
          >
            <Icon name={field.lockAspect ? 'lock' : 'unlock'} size={14} />
            {field.lockAspect ? 'نسبة الأبعاد مقفلة' : 'نسبة الأبعاد حرّة'}
          </div>
        </div>
      )}

      {/* 1. إعدادات النص الأساسية — نصوص فقط */}
      {!isImage && (
        <div className="settings-card">
          <div className="settings-card-title">
            <Icon name="type" size={13} />
            خط النص الأساسي
          </div>

          <div className="settings-col">
            <label>نوع الخط:</label>
            <select value={field.font} onChange={(e) => set({ font: e.target.value })}>
              <optgroup label="خطوط ويب عربية (Google)">
                {GOOGLE_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {FONT_LABELS[f] ?? f}
                  </option>
                ))}
              </optgroup>
              <optgroup label="خطوط النظام الأساسية">
                {SYSTEM_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </optgroup>
              <optgroup label="خطوط من جهازك">
                <option value="custom">إدخال اسم خط من الجهاز...</option>
              </optgroup>
            </select>
            {field.font === 'custom' && (
              <input
                type="text"
                placeholder="اكتب اسم الخط هنا..."
                style={{ marginTop: 5 }}
                value={field.customFont}
                onChange={(e) => set({ customFont: e.target.value })}
              />
            )}
          </div>

          <NumSlider
            label="حجم الخط (px):"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            value={field.size}
            onChange={(size) => set({ size })}
          />

          <div className="settings-col">
            <label>المحاذاة (نقطة الإرساء):</label>
            <div className="align-group">
              {[
                ['right', 'يمين'],
                ['center', 'وسط'],
                ['left', 'يسار'],
              ].map(([value, text]) => (
                <div
                  key={value}
                  className={`checkbox-btn${field.align === value ? ' active' : ''}`}
                  onClick={() => set({ align: value })}
                >
                  {text}
                </div>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-col">
              <label>لون النص:</label>
              <input type="color" value={field.color} onChange={(e) => set({ color: e.target.value })} />
            </div>
            <div className="settings-col" style={{ justifyContent: 'flex-end' }}>
              <label className="checkbox-btn">
                <input
                  type="checkbox"
                  checked={field.bold}
                  onChange={(e) => set({ bold: e.target.checked })}
                />
                <strong>عريض (Bold)</strong>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 2. إعدادات متقدمة — التباعد نصوص فقط، الشفافية والدوران مشتركة */}
      <div className="settings-card">
        <div className="settings-card-title">
          <Icon name="settings" size={13} />
          إعدادات متقدمة
        </div>
        {!isImage && (
          <NumSlider
            label="التباعد بين الأحرف (px):"
            min={-10}
            max={50}
            value={field.letterSpacing}
            onChange={(letterSpacing) => set({ letterSpacing })}
          />
        )}
        <NumSlider
          label="الشفافية (%):"
          min={0}
          max={100}
          value={field.opacity}
          onChange={(opacity) => set({ opacity })}
        />
        <NumSlider
          label={isImage ? 'الدوران (°):' : 'دوران النص (°):'}
          min={-180}
          max={180}
          value={field.rotation}
          onChange={(rotation) => set({ rotation })}
        />
      </div>

      {/* 3. الحد الخارجي — نصوص فقط */}
      {!isImage && (
        <div className="settings-card">
          <div className="settings-card-title">
            <Icon name="pen" size={13} />
            الحد الخارجي (Stroke)
          </div>
          <div className="settings-col">
            <label>لون الحد:</label>
            <input
              type="color"
              value={field.strokeColor}
              onChange={(e) => set({ strokeColor: e.target.value })}
            />
          </div>
          <NumSlider
            label="سُمك الحد (px):"
            min={0}
            max={20}
            value={field.strokeWidth}
            onChange={(strokeWidth) => set({ strokeWidth })}
          />
        </div>
      )}

      {/* 4. إعدادات الظل — مشتركة (الصور تحصل على drop-shadow حقيقي) */}
      <div className="settings-card">
        <div className="settings-card-title">
          <Icon name="shadow" size={13} />
          إعدادات الظل (Shadow)
        </div>
        <div className="settings-col">
          <label>لون الظل:</label>
          <input
            type="color"
            value={field.shadowColor}
            onChange={(e) => set({ shadowColor: e.target.value })}
          />
        </div>
        <NumSlider
          label="التغبيش - Blur (px):"
          min={0}
          max={50}
          value={field.shadowBlur}
          onChange={(shadowBlur) => set({ shadowBlur })}
        />
        <NumSlider
          label="إزاحة أفقية - X (px):"
          min={-50}
          max={50}
          value={field.shadowX}
          onChange={(shadowX) => set({ shadowX })}
        />
        <NumSlider
          label="إزاحة عمودية - Y (px):"
          min={-50}
          max={50}
          value={field.shadowY}
          onChange={(shadowY) => set({ shadowY })}
        />
      </div>

      {/* 5. الموضع — مرآة لعملية السحب داخل مساحة العمل */}
      <div className="settings-card">
        <div className="settings-card-title">
          <Icon name="target" size={13} />
          الموضع على الصورة (px)
        </div>
        <div className="settings-row">
          <div className="settings-col">
            <label>X:</label>
            <input type="text" value={field.x} onChange={(e) => set({ x: Number(e.target.value) || 0 })} />
          </div>
          <div className="settings-col">
            <label>Y:</label>
            <input type="text" value={field.y} onChange={(e) => set({ y: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <div className="align-group">
          <div className="checkbox-btn" onClick={centerH}>
            ↔ توسيط أفقي
          </div>
          <div className="checkbox-btn" onClick={centerV}>
            ↕ توسيط عمودي
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------- بطاقة حقل الأتمتة (عمود من الإكسل) ------------------- */
function AutoFieldItem({ header, colIndex }) {
  const field = useStore((s) => s.activeFields[`field_col_${colIndex}`]);
  const toggleField = useStore((s) => s.toggleField);
  const selectField = useStore((s) => s.selectField);
  const isActive = Boolean(field);

  return (
    <div
      className={`field-toggle${isActive ? ' active' : ''}`}
      onClick={() => isActive && selectField(field.id)}
    >
      <div className="field-toggle-header">
        <span>{header}</span>
        <label className="switch">
          <input type="checkbox" checked={isActive} onChange={() => toggleField(colIndex)} />
          <span className="slider" />
        </label>
      </div>
      {isActive && <FieldSettings field={field} />}
    </div>
  );
}

/* ------------------- طبقة نص يدوية (صف في لوحة الطبقات) ------------------- */
function LayerItem({ field, isTop, isBottom }) {
  const removeField = useStore((s) => s.removeField);
  const selectField = useStore((s) => s.selectField);
  const duplicateField = useStore((s) => s.duplicateField);
  const toggleVisibility = useStore((s) => s.toggleVisibility);
  const moveLayer = useStore((s) => s.moveLayer);
  const isSelected = useStore((s) => s.selectedFieldId === field.id);

  const isImage = field.type === 'image';
  const firstLine = (field.text || '').split('\n')[0];
  const lineCount = (field.text || '').split('\n').length;

  // فتح لوحة الإعدادات للطبقة المحددة فقط — تماماً كلوحات المحررات
  const open = isSelected;
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className={`field-toggle layer${isSelected ? ' active' : ''}${
        field.visible ? '' : ' hidden-layer'
      }`}
    >
      {/* التحديد من صف الطبقة فقط — حتى لا يُلغي الضغطُ داخل لوحة الإعدادات التحديدَ فتُطوى */}
      <div className="layer-row" onClick={() => selectField(isSelected ? null : field.id)}>
        <button
          className="btn-icon"
          title={field.visible ? 'إخفاء الطبقة' : 'إظهار الطبقة'}
          onClick={stop(() => toggleVisibility(field.id))}
        >
          <Icon name={field.visible ? 'eye' : 'eyeOff'} size={14} />
        </button>

        {isImage ? (
          <img className="layer-thumb" src={field.src} alt="" />
        ) : (
          <span className="layer-type-icon">
            <Icon name="type" size={13} />
          </span>
        )}

        <div className="layer-name" title={isImage ? field.column : field.text}>
          <span className="layer-title">{isImage ? field.column : firstLine || '(نص فارغ)'}</span>
          <span className="layer-meta">
            {isImage
              ? `${field.w}×${field.h}px`
              : `${field.column} · ${field.size}px${lineCount > 1 ? ` · ${lineCount} أسطر` : ''}`}
          </span>
        </div>

        <button
          className="btn-icon"
          title="رفع الطبقة للأمام"
          disabled={isTop}
          onClick={stop(() => moveLayer(field.id, 1))}
        >
          <Icon name="chevronUp" size={14} />
        </button>
        <button
          className="btn-icon"
          title="إنزال الطبقة للخلف"
          disabled={isBottom}
          onClick={stop(() => moveLayer(field.id, -1))}
        >
          <Icon name="chevronDown" size={14} />
        </button>
        <button className="btn-icon" title="تكرار الطبقة (Ctrl+D)" onClick={stop(() => duplicateField(field.id))}>
          <Icon name="copy" size={13} />
        </button>
        <button
          className="btn-icon danger"
          title="حذف الطبقة (Delete)"
          onClick={stop(() => removeField(field.id))}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      {open && <FieldSettings field={field} />}
    </div>
  );
}

/* ============================ وضع الأتمتة ============================ */
function AutoSection() {
  const templateImage = useStore((s) => s.templateImage);
  const excelData = useStore((s) => s.excelData);
  const exportOptions = useStore((s) => s.exportOptions);
  const fileNameColumn = useStore((s) => s.fileNameColumn);
  const setTemplateImage = useStore((s) => s.setTemplateImage);
  const setExcelData = useStore((s) => s.setExcelData);
  const toggleExportOption = useStore((s) => s.toggleExportOption);
  const setFileNameColumn = useStore((s) => s.setFileNameColumn);

  const handleExcel = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await loadXLSX();
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (!matrix.length) {
          alert('الملف فارغ أو لا يحتوي على بيانات قابلة للقراءة.');
          return;
        }
        setExcelData({
          name: file.name,
          headers: matrix[0].map((h) => (h === undefined || h === null ? '' : String(h).trim())),
          rows: matrix.slice(1).filter((row) => row.some((c) => String(c).trim() !== '')),
        });
      } catch (err) {
        console.error(err);
        alert('تعذّر قراءة ملف الإكسل. تأكد من الصيغة (xlsx / xls / csv) ومن اتصالك بالإنترنت.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <>
      <div>
        <h3>1. قالب الشهادة</h3>
        <UploadBox
          icon={<Icon name="image" size={26} />}
          hint="اسحب صورة الشهادة هنا أو اضغط للاختيار"
          accept="image/*"
          fileName={templateImage?.name}
          onFile={setTemplateImage}
        />
      </div>

      <div>
        <h3>2. قاعدة البيانات (Excel)</h3>
        <UploadBox
          icon={<Icon name="table" size={26} />}
          hint="اسحب ملف الإكسل هنا أو اضغط للاختيار"
          accept=".xlsx, .xls, .csv"
          fileName={excelData ? `${excelData.name} — ${excelData.rows.length} صف` : undefined}
          onFile={handleExcel}
        />
      </div>

      {excelData && (
        <div>
          <h3>3. الحقول وإعداداتها</h3>
          <div className="fields-list">
            {excelData.headers.map((header, index) =>
              header ? <AutoFieldItem key={index} header={header} colIndex={index} /> : null
            )}
          </div>
        </div>
      )}

      <div>
        <h3>4. إعدادات التصدير</h3>
        <div className="export-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={exportOptions.pdf}
              onChange={() => toggleExportOption('pdf')}
            />
            صيغة PDF (مستند)
          </label>
          {exportOptions.pdf && (
            <label className="checkbox-label sublabel">
              <input
                type="checkbox"
                checked={exportOptions.mergePdf}
                onChange={() => toggleExportOption('mergePdf')}
              />
              دمج كل الشهادات في ملف PDF واحد
            </label>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={exportOptions.png}
              onChange={() => toggleExportOption('png')}
            />
            صيغة PNG (صورة)
          </label>
          <label className="checkbox-label emphasis">
            <input
              type="checkbox"
              checked={exportOptions.zip}
              onChange={() => toggleExportOption('zip')}
            />
            جمع الشهادات في ملف مضغوط (ZIP)
          </label>
          {exportOptions.zip && typeof window !== 'undefined' && 'showSaveFilePicker' in window && (
            <label
              className="checkbox-label sublabel"
              title="يكتب الملف مباشرة على القرص أثناء التوليد بلا حد لحجمه، بدل تجميعه في ذاكرة المتصفح"
            >
              <input
                type="checkbox"
                checked={exportOptions.directDisk}
                onChange={() => toggleExportOption('directDisk')}
              />
              حفظ مباشر على القرص (لأعداد كبيرة جداً)
            </label>
          )}

          {excelData && (
            <div className="settings-col" style={{ marginTop: 5 }}>
              <label className="field-label">تسمية الملفات حسب عمود:</label>
              <select
                className="name-column-select"
                value={fileNameColumn ?? ''}
                onChange={(e) =>
                  setFileNameColumn(e.target.value === '' ? null : Number(e.target.value))
                }
              >
                <option value="">(تلقائي — أول حقل مفعّل)</option>
                {excelData.headers.map((header, index) =>
                  header ? (
                    <option key={index} value={index}>
                      {header}
                    </option>
                  ) : null
                )}
              </select>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ============================ الوضع اليدوي ============================ */
function ManualSection() {
  const templateImage = useStore((s) => s.templateImage);
  const activeFields = useStore((s) => s.activeFields);
  const exportOptions = useStore((s) => s.exportOptions);
  const setTemplateImage = useStore((s) => s.setTemplateImage);
  const addManualText = useStore((s) => s.addManualText);
  const addManualImage = useStore((s) => s.addManualImage);
  const toggleExportOption = useStore((s) => s.toggleExportOption);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.history.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [draft, setDraft] = useState('');
  const imageInputRef = useRef(null);

  // الأعلى في القائمة = الأمامي على الصورة، مثل لوحة طبقات المحررات
  const fields = Object.values(activeFields).sort((a, b) => (b.z ?? 0) - (a.z ?? 0));

  const add = () => {
    if (!templateImage) {
      alert('يرجى رفع الصورة أولاً.');
      return;
    }
    if (!draft.trim()) return;
    addManualText(draft);
    setDraft('');
  };

  const pickImage = () => {
    if (!templateImage) {
      alert('يرجى رفع الصورة أولاً.');
      return;
    }
    imageInputRef.current?.click();
  };

  const onImagePicked = (e) => {
    const file = e.target.files?.[0];
    if (file) addManualImage(file);
    e.target.value = ''; // يسمح برفع نفس الملف مرة أخرى
  };

  return (
    <>
      <div>
        <h3>1. الصورة الأساسية</h3>
        <UploadBox
          icon={<Icon name="image" size={26} />}
          hint="اسحب الصورة هنا أو اضغط للاختيار"
          accept="image/*"
          fileName={templateImage?.name}
          onFile={setTemplateImage}
        />
      </div>

      <div>
        <h3>2. الطبقات</h3>
        <div className="add-text-row">
          <input
            type="text"
            className="manual-text-input"
            placeholder="اكتب النص المراد إضافته..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn-add" onClick={add} title="إضافة طبقة نص">
            <Icon name="plus" size={15} />
            نص
          </button>
        </div>

        <button className="btn-add-image" onClick={pickImage} title="إضافة طبقة صورة (شعار، توقيع، ختم...)">
          <Icon name="image" size={15} />
          إضافة طبقة صورة (شعار / توقيع / ختم)
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onImagePicked}
        />

        <div className="layers-toolbar">
          <button className="btn-icon" title="تراجع (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Icon name="undo" size={14} />
          </button>
          <button className="btn-icon" title="إعادة (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
            <Icon name="redo" size={14} />
          </button>
          <span className="layers-count">{fields.length} طبقة</span>
        </div>

        <div className="fields-list" style={{ marginTop: 10 }}>
          {fields.length === 0 ? (
            <div className="empty-hint">لم تُضف أي طبقات بعد — أضف نصاً أو صورة لتبدأ.</div>
          ) : (
            fields.map((field, i) => (
              <LayerItem
                key={field.id}
                field={field}
                isTop={i === 0}
                isBottom={i === fields.length - 1}
              />
            ))
          )}
        </div>

        <div className="shortcuts-hint">
          اختصارات: الأسهم للتحريك (Shift ×10) · Ctrl+D تكرار · Delete حذف · Ctrl+Z تراجع
        </div>
      </div>

      <div>
        <h3>3. إعدادات التصدير</h3>
        <div className="export-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={exportOptions.pdf}
              onChange={() => toggleExportOption('pdf')}
            />
            صيغة PDF (مستند)
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={exportOptions.png}
              onChange={() => toggleExportOption('png')}
            />
            صيغة PNG (صورة — تحافظ على الشفافية)
          </label>
        </div>
      </div>
    </>
  );
}

/* ============================ وضع القص الجماعي ============================
 *  قالب PNG واحد (إطار/شعار بخلفية شفافة عادةً) + حتى 30 صورة → كل صورة تُقصّ
 *  لتطابق أبعاد القالب تماماً (بمنطق object-fit: cover، بلا تمديد) ثم يُركَّب
 *  القالب فوقها، وتُصدَّر الحزمة كاملة كملف ZIP واحد.
 * ========================================================================= */
function CropSection() {
  const cropTemplate = useStore((s) => s.cropTemplate);
  const cropImages = useStore((s) => s.cropImages);
  const cropBlurFaces = useStore((s) => s.cropBlurFaces);
  const cropBlurStyle = useStore((s) => s.cropBlurStyle);
  const setCropTemplate = useStore((s) => s.setCropTemplate);
  const addCropImages = useStore((s) => s.addCropImages);
  const removeCropImage = useStore((s) => s.removeCropImage);
  const clearCropImages = useStore((s) => s.clearCropImages);
  const setCropBlurFaces = useStore((s) => s.setCropBlurFaces);
  const setCropBlurStyle = useStore((s) => s.setCropBlurStyle);
  const photosInputRef = useRef(null);

  const onPhotosPicked = (e) => {
    if (e.target.files?.length) addCropImages(e.target.files);
    e.target.value = ''; // يسمح باختيار نفس الملفات مرة أخرى
  };

  const toggleBlurFaces = () => {
    const next = !cropBlurFaces;
    setCropBlurFaces(next);
    // تحميل نموذج الكشف مسبقاً فور التفعيل — يكون جاهزاً غالباً عند بدء
    // التصدير فعلياً بدل انتظار المستخدم أمام رسالة "جارٍ تحميل النموذج".
    if (next) import('../core/faceBlur.js').then((m) => m.warmUpFaceModel());
  };

  return (
    <>
      <div>
        <h3>1. القالب (PNG)</h3>
        <UploadBox
          icon={<Icon name="image" size={26} />}
          hint="اسحب قالب الإطار هنا أو اضغط للاختيار — PNG بخلفية شفافة يُفضَّل"
          accept="image/png,image/*"
          fileName={cropTemplate ? `${cropTemplate.name} — ${cropTemplate.width}×${cropTemplate.height}px` : undefined}
          onFile={setCropTemplate}
        />
      </div>

      <div>
        <h3>
          2. الصور ({cropImages.length} / {CROP_MAX_IMAGES})
        </h3>
        <div
          className="upload-box"
          onClick={() => photosInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) addCropImages(e.dataTransfer.files);
          }}
        >
          <div className="upload-icon">
            <Icon name="camera" size={26} />
          </div>
          <div>اسحب الصور هنا أو اضغط للاختيار (يمكن تحديد عدة صور معاً)</div>
          <input
            ref={photosInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={onPhotosPicked}
          />
        </div>

        {cropImages.length > 0 && (
          <>
            <div className="crop-thumb-grid">
              {cropImages.map((img) => (
                <div key={img.id} className="crop-thumb">
                  <img src={img.url} alt={img.name} />
                  <button
                    className="crop-thumb-remove"
                    title="إزالة"
                    onClick={() => removeCropImage(img.id)}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
            </div>
            <button className="link-btn" style={{ marginTop: 8 }} onClick={clearCropImages}>
              إزالة كل الصور
            </button>
          </>
        )}
      </div>

      <div>
        <h3>3. الخصوصية (اختياري)</h3>
        <label className="checkbox-label">
          <input type="checkbox" checked={cropBlurFaces} onChange={toggleBlurFaces} />
          تغبيش الوجوه تلقائياً قبل التصدير
        </label>

        {cropBlurFaces && (
          <div className="align-group" style={{ marginTop: 8 }}>
            <div
              className={`checkbox-btn${cropBlurStyle === 'blur' ? ' active' : ''}`}
              onClick={() => setCropBlurStyle('blur')}
            >
              ضبابي (Blur)
            </div>
            <div
              className={`checkbox-btn${cropBlurStyle === 'pixelate' ? ' active' : ''}`}
              onClick={() => setCropBlurStyle('pixelate')}
            >
              تربيعي (Pixelate)
            </div>
          </div>
        )}

        <label className="hint-text" style={{ marginTop: 8, display: 'block' }}>
          كشف الوجوه يعمل بالكامل داخل متصفحك (TensorFlow.js) — لا تُرفع أي صورة
          لأي خادم. يُحمَّل نموذج الكشف (~1-2MB) مرة واحدة فقط عند أول استخدام،
          ويحتاج اتصالاً بالإنترنت في تلك المرة فقط. في المعاينة المجاورة يمكنك
          سحب كل دائرة لتحريكها أو سحب مقبضها لتكبيرها/تصغيرها، وإضافة دائرة
          يدوياً لوجه فاته الكشف، أو حذف أي دائرة لا تريدها — تحكّم كامل قبل التصدير.
        </label>
      </div>

      {cropTemplate && (
        <div className="empty-hint">
          سيُقصّ كل صورة لتطابق أبعاد القالب ({cropTemplate.width}×{cropTemplate.height}px)
          تلقائياً بلا تمديد، ثم يُطبَّق القالب فوقها
          {cropBlurFaces ? '، بعد تغبيش أي وجوه مكتشَفة فيها.' : '.'}
        </div>
      )}
    </>
  );
}

/* ============================ وضع نصوص المنشورات ============================
 *  توجيهات المستخدم + مفتاح Groq API الخاص به (محفوظ في متصفحه فقط) →
 *  توليد نص منشور جاهز، بتاريخ اليوم الحقيقي محقونٌ تلقائياً في الطلب
 *  حتى لا يخترع النموذج تاريخاً خاطئاً.
 * ========================================================================= */
function PostsSection() {
  const postsApiKey = useStore((s) => s.postsApiKey);
  const postsModel = useStore((s) => s.postsModel);
  const postsInstructions = useStore((s) => s.postsInstructions);
  const setPostsApiKey = useStore((s) => s.setPostsApiKey);
  const setPostsModel = useStore((s) => s.setPostsModel);
  const setPostsInstructions = useStore((s) => s.setPostsInstructions);
  const [showKey, setShowKey] = useState(false);

  const today = getTodayInfo();
  const insertPlaceholder = (token) => setPostsInstructions(`${postsInstructions}${token}`);

  return (
    <>
      <div>
        <h3>1. إعدادات Groq API</h3>
        <div className="settings-card">
          <div className="settings-col">
            <label className="field-label">مفتاح API الخاص بك:</label>
            <div className="api-key-row">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="gsk_..."
                value={postsApiKey}
                onChange={(e) => setPostsApiKey(e.target.value)}
                autoComplete="off"
              />
              <button className="btn-icon" onClick={() => setShowKey((v) => !v)} title={showKey ? 'إخفاء' : 'إظهار'}>
                <Icon name={showKey ? 'eyeOff' : 'eye'} size={14} />
              </button>
            </div>
            <label className="hint-text">
              يُحفَظ المفتاح في متصفحك فقط ولا يُرسَل إلا مباشرة إلى Groq — احصل على
              مفتاح مجاني من console.groq.com
            </label>
          </div>

          <div className="settings-col">
            <label className="field-label">النموذج:</label>
            <input
              list="groq-models"
              value={postsModel}
              onChange={(e) => setPostsModel(e.target.value)}
            />
            <datalist id="groq-models">
              {SUGGESTED_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <div>
        <h3>2. توجيهاتك للمنشور</h3>
        <div className="settings-col">
          <div className="date-badge">
            <Icon name="calendar" size={14} />
            اليوم: {today.dayName}، {today.dateLong}
          </div>
          <textarea
            className="text-content-area"
            rows={7}
            placeholder="مثال: اكتب منشوراً تحفيزياً قصيراً لبداية الأسبوع، مع ذكر اليوم والتاريخ في البداية..."
            value={postsInstructions}
            onChange={(e) => setPostsInstructions(e.target.value)}
          />
          <div className="align-group">
            <div className="checkbox-btn" onClick={() => insertPlaceholder('{{التاريخ}}')}>
              + إدراج التاريخ
            </div>
            <div className="checkbox-btn" onClick={() => insertPlaceholder('{{اليوم}}')}>
              + إدراج اسم اليوم
            </div>
          </div>
          <label className="hint-text">
            استخدم {'{{التاريخ}}'} أو {'{{اليوم}}'} في أي مكان بتوجيهاتك — يُستبدلان تلقائياً
            بتاريخ اليوم الحقيقي في كل مرة تولّد فيها منشوراً جديداً.
          </label>
        </div>
      </div>
    </>
  );
}

/* ============================== الشريط ============================== */
export default function Sidebar({ isOpen, onClose }) {
  const mode = useStore((s) => s.mode);
  const templateImage = useStore((s) => s.templateImage);
  const excelData = useStore((s) => s.excelData);
  const activeFields = useStore((s) => s.activeFields);
  const exportOptions = useStore((s) => s.exportOptions);
  const cropTemplate = useStore((s) => s.cropTemplate);
  const cropImages = useStore((s) => s.cropImages);
  const postsApiKey = useStore((s) => s.postsApiKey);
  const postsInstructions = useStore((s) => s.postsInstructions);
  const postsGenerating = useStore((s) => s.postsGenerating);
  const isExporting = useStore((s) => s.exportProgress.running);
  const goHome = useStore((s) => s.goHome);
  const buildExportConfig = useStore((s) => s.buildExportConfig);

  const isManual = mode === 'manual';
  const isCrop = mode === 'crop';
  const isPosts = mode === 'posts';

  const handleExport = async () => {
    if (isPosts) {
      if (!postsApiKey.trim()) {
        alert('يرجى إدخال مفتاح Groq API أولاً (في إعدادات القسم).');
        return;
      }
      if (!postsInstructions.trim()) {
        alert('يرجى كتابة توجيهاتك لنص المنشور أولاً.');
        return;
      }
      await generatePost();
      return;
    }

    if (isCrop) {
      if (!cropTemplate) {
        alert('يرجى رفع قالب الإطار (PNG) أولاً!');
        return;
      }
      if (cropImages.length === 0) {
        alert('يرجى إضافة صورة واحدة على الأقل للقص.');
        return;
      }
      try {
        const { runCropExport } = await loadCropExporter();
        await runCropExport();
      } catch (err) {
        console.error(err);
        alert('تعذّر تحميل محرك القص. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.');
      }
      return;
    }

    if (!templateImage) {
      alert(isManual ? 'يرجى رفع الصورة أولاً!' : 'يرجى رفع قالب الشهادة أولاً!');
      return;
    }
    if (!isManual && (!excelData || excelData.rows.length === 0)) {
      alert('يرجى رفع ملف الإكسل الذي يحتوي على بيانات المستفيدين.');
      return;
    }
    if (Object.keys(activeFields).length === 0) {
      alert(
        isManual
          ? 'يرجى إضافة نص واحد على الأقل إلى الصورة.'
          : 'يرجى تفعيل حقل واحد على الأقل من قائمة الحقول لطباعته على الشهادة.'
      );
      return;
    }
    if (!exportOptions.pdf && !exportOptions.png) {
      alert('يرجى اختيار صيغة تصدير واحدة على الأقل (PDF أو PNG).');
      return;
    }

    // بدون ضغط ZIP سيحاول المتصفح تنزيل كل ملف على حدة (وضع الأتمتة فقط)
    if (!isManual) {
      const filesCount =
        excelData.rows.length *
        ((exportOptions.png ? 1 : 0) + (exportOptions.pdf && !exportOptions.mergePdf ? 1 : 0));
      if (!exportOptions.zip && filesCount > 15) {
        const ok = confirm(
          `سيتم تنزيل ${filesCount} ملفاً منفصلاً، وقد يحجب المتصفح بعضها.\nالأفضل تفعيل خيار الضغط (ZIP). هل تريد المتابعة؟`
        );
        if (!ok) return;
      }
    }

    // مربع "أين تريد الحفظ؟" يحتاج بادرة مستخدم مباشرة (transient activation)
    // لا تنجو من انتظار جلب الخطوط وتهيئة العمّال لاحقاً — لذا يُطلَب هنا أولاً،
    // قبل أي await آخر، ثم يُمرَّر المقبض جاهزاً إلى المحرك.
    let fileHandle = null;
    if (!isManual && exportOptions.zip && exportOptions.directDisk && 'showSaveFilePicker' in window) {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: `شهادات_${new Date().toISOString().slice(0, 10)}.zip`,
          types: [{ description: 'ملف مضغوط', accept: { 'application/zip': ['.zip'] } }],
        });
      } catch {
        return; // المستخدم ألغى مربع الحفظ — لا نبدأ التوليد أصلاً
      }
    }

    console.log('حزمة البيانات المُرسلة للمحرك:', buildExportConfig());
    try {
      const { runExport } = await loadExporter();
      await runExport({ fileHandle });
    } catch (err) {
      console.error(err);
      alert('تعذّر تحميل محرك التوليد. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.');
    }
  };

  const exportLabel = isPosts
    ? { icon: 'bot', text: 'توليد نص المنشور' }
    : isCrop
      ? { icon: 'scissors', text: 'قص وتطبيق القالب على الكل' }
      : isManual
        ? { icon: 'zap', text: 'تصدير الصورة' }
        : { icon: 'zap', text: 'بدء توليد الشهادات' };
  const busy = isPosts ? postsGenerating : isExporting;

  return (
    <div className={`sidebar glass-panel${isOpen ? ' open' : ''}`}>
      <div className="sidebar-mobile-header">
        <h2>
          <span className="brand-mark" />
          نظام <span>اعتياد</span>
        </h2>
        <button className="btn-icon sidebar-close" onClick={onClose} title="إغلاق">
          <Icon name="x" size={15} />
        </button>
      </div>

      <div className="workspace-nav">
        <button className="btn-icon" onClick={goHome} title="العودة للشاشة الرئيسية">
          <Icon name="home" size={15} />
        </button>
        <div className="workspace-nav-current">
          <Icon name={MODE_META[mode].icon} size={15} />
          {MODE_META[mode].label}
        </div>
      </div>

      {isPosts ? (
        <PostsSection />
      ) : isCrop ? (
        <CropSection />
      ) : isManual ? (
        <ManualSection />
      ) : (
        <AutoSection />
      )}

      <button className="btn-export" onClick={handleExport} disabled={busy}>
        <Icon name={busy ? 'refresh' : exportLabel.icon} size={17} className={busy ? 'spin' : ''} />
        {busy ? 'جارٍ العمل...' : exportLabel.text}
      </button>
    </div>
  );
}
