import React, { useEffect, useRef, useState } from 'react';
import {
  useStore,
  fieldTextStyle,
  fieldImageStyle,
  previewText,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
} from '../core/store.js';
import { getTodayInfo } from '../core/postsApi.js';
import Icon from './Icon.jsx';

/* =========================================================================
 *  مساحة العمل: عرض القالب + سحب الطبقات وتغيير حجمها + التكبير + الاختصارات
 *
 *  السحب مبني على Pointer Events الأصلية (بدون أي مكتبة خارجية):
 *  نلتقط فرق حركة المؤشر بالبكسل، نقسمه على معامل التكبير الحالي،
 *  فنحصل على الإزاحة بإحداثيات الصورة الأصلية مباشرة.
 * ========================================================================= */

const SNAP_SCREEN_PX = 6; // مدى الالتقاط لخطوط المنتصف (بكسل شاشة)

/** مُشغّل سحب عام: يستدعي onMove بفرق الحركة (بإحداثيات الصورة). */
function startPointerDrag(e, onMove, onEnd) {
  e.preventDefault();
  e.stopPropagation();

  const startX = e.clientX;
  const startY = e.clientY;

  const handleMove = (ev) => {
    const zoom = useStore.getState().zoom || 1;
    onMove((ev.clientX - startX) / zoom, (ev.clientY - startY) / zoom);
  };
  const handleUp = () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleUp);
    onEnd?.();
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleUp);
}

function DraggableField({ field, onGuides }) {
  const moveField = useStore((s) => s.moveField);
  const resizeField = useStore((s) => s.resizeField);
  const resizeImageField = useStore((s) => s.resizeImageField);
  const selectField = useStore((s) => s.selectField);
  const beginInteraction = useStore((s) => s.beginInteraction);
  const endInteraction = useStore((s) => s.endInteraction);
  const isSelected = useStore((s) => s.selectedFieldId === field.id);
  const boxRef = useRef(null);
  const isImage = field.type === 'image';

  const handleDrag = (e) => {
    selectField(field.id);
    beginInteraction();

    const originX = field.x;
    const originY = field.y;
    const box = boxRef.current;

    startPointerDrag(
      e,
      (dx, dy) => {
        const { templateImage, zoom } = useStore.getState();
        let x = originX + dx;
        let y = originY + dy;
        const guides = { v: false, h: false };

        if (templateImage && box) {
          const threshold = SNAP_SCREEN_PX / (zoom || 1);
          const w = box.offsetWidth;
          const h = box.offsetHeight;
          // الصور تُرسى دائماً من حافتها العلوية اليسرى (x = boxLeft)، بينما
          // النصوص تتبع محاذاتها (يمين/وسط/يسار) — كما في ctx.textAlign عند التصدير.
          const boxLeft = isImage
            ? x
            : field.align === 'center'
              ? x - w / 2
              : field.align === 'right'
                ? x - w
                : x;

          // التقاط على منتصف الصورة أفقياً وعمودياً
          const dxToCenter = templateImage.width / 2 - (boxLeft + w / 2);
          if (Math.abs(dxToCenter) < threshold) {
            x += dxToCenter;
            guides.v = true;
          }
          const dyToCenter = templateImage.height / 2 - (y + h / 2);
          if (Math.abs(dyToCenter) < threshold) {
            y += dyToCenter;
            guides.h = true;
          }
        }

        onGuides(guides);
        moveField(field.id, x, y);
      },
      () => {
        onGuides({ v: false, h: false });
        endInteraction();
      }
    );
  };

  const handleResize = (e) => {
    selectField(field.id);
    beginInteraction();

    if (isImage) {
      const startW = field.w;
      const startH = field.h;
      startPointerDrag(e, (dx, dy) => resizeImageField(field.id, startW + dx, startH + dy), endInteraction);
      return;
    }

    const startSize = field.size;
    startPointerDrag(
      e,
      (_dx, dy) =>
        resizeField(field.id, Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, startSize + dy))),
      endInteraction
    );
  };

  // نقطة الإرساء (x) تتبع المحاذاة للنصوص: يسار = حافة الصندوق اليسرى، وسط = مركزه،
  // يمين = حافته اليمنى (يطابق ctx.textAlign عند التصدير). الصور دائماً بلا إزاحة.
  const anchorShift = isImage
    ? 'none'
    : field.align === 'center'
      ? 'translateX(-50%)'
      : field.align === 'right'
        ? 'translateX(-100%)'
        : 'none';

  return (
    <div
      className={`draggable-field${isSelected ? ' selected' : ''}${isImage ? ' is-image' : ''}`}
      style={{
        left: `${field.x}px`,
        top: `${field.y}px`,
        transform: anchorShift,
        zIndex: 10 + (field.z ?? 0),
      }}
    >
      <div className="field-badge">{field.column}</div>
      {isImage ? (
        <img
          ref={boxRef}
          className="preview-image"
          src={field.src}
          alt=""
          draggable={false}
          style={fieldImageStyle(field)}
          onPointerDown={handleDrag}
        />
      ) : (
        <div
          ref={boxRef}
          className="preview-text"
          style={fieldTextStyle(field)}
          onPointerDown={handleDrag}
        >
          {previewText(field)}
        </div>
      )}
      <div
        className="resize-handle"
        title={isImage ? 'اسحب لتغيير أبعاد الصورة' : 'اسحب لتغيير الحجم'}
        onPointerDown={handleResize}
      >
        <Icon name="resize" size={10} />
      </div>
    </div>
  );
}

/**
 * معاينة وضع النصوص — بلا صورة ولا تكبير، فقط نص قابل للتحرير + نسخ/تنزيل.
 * مكوّن مستقل تماماً عن آلية الكانفاس/التكبير المستخدمة في بقية الأوضاع.
 */
function PostsPreview() {
  const postsGeneratedText = useStore((s) => s.postsGeneratedText);
  const postsGenerating = useStore((s) => s.postsGenerating);
  const postsError = useStore((s) => s.postsError);
  const setPostsGeneratedText = useStore((s) => s.setPostsGeneratedText);
  const [copied, setCopied] = useState(false);
  const today = getTodayInfo();

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(postsGeneratedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert('تعذّر النسخ التلقائي — حدّد النص وانسخه يدوياً.');
    }
  };

  const downloadText = () => {
    const blob = new Blob([postsGeneratedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `منشور_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="posts-preview">
      <div className="date-badge">
        <Icon name="calendar" size={14} />
        {today.dayName}، {today.dateLong}
      </div>

      {postsGenerating ? (
        <div className="posts-preview-loading">
          <div className="progress-fill indeterminate" style={{ width: '60%', height: 8, borderRadius: 50 }} />
          <span>جارٍ توليد النص عبر Groq...</span>
        </div>
      ) : postsError ? (
        <div className="modal-errors" style={{ width: '100%', maxWidth: 520, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Icon name="alert" size={14} />
          {postsError}
        </div>
      ) : postsGeneratedText ? (
        <>
          <textarea
            className="posts-output"
            value={postsGeneratedText}
            onChange={(e) => setPostsGeneratedText(e.target.value)}
          />
          <div className="posts-actions">
            <button className="btn-modal" onClick={copyText}>
              <Icon name={copied ? 'check' : 'copy'} size={16} />
              {copied ? 'تم النسخ' : 'نسخ النص'}
            </button>
            <button className="btn-modal primary" onClick={downloadText}>
              <Icon name="download" size={16} />
              تنزيل كملف نصي
            </button>
          </div>
        </>
      ) : (
        <span className="placeholder-text">
          اكتب توجيهاتك في اللوحة الجانبية واضغط «توليد نص المنشور» لتظهر النتيجة هنا
        </span>
      )}
    </div>
  );
}

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذّر تحميل الصورة.'));
    img.src = url;
  });
}

/** نفس منطق "cover" المستخدم في محرك التصدير (cropExporter.js) — مكرَّر هنا
 *  عمداً بدل الاستيراد منه، حتى لا يُسحَب محرك التصدير الثقيل نسبياً (ZIP...)
 *  إلى حزمة Workspace.jsx المُحمَّلة دائماً مع التطبيق. */
function computeCoverRect(srcW, srcH, dstW, dstH) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sh = srcH;
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh };
  }
  const sw = srcW;
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw, sh };
}

/**
 * معاينة صورة القص الجماعي: صورة عادية عند تعطيل تغبيش الوجوه (بلا أي معالجة)،
 * أو Canvas يُعيد رسم نفس خط أنابيب التصدير (قص + تغبيش المناطق) عند تفعيله —
 * فما يراه المستخدم هنا هو ما سيخرج فعلياً، بلا مفاجآت بعد التصدير الكامل.
 *
 * أول معاينة لصورة (بلا مناطق محفوظة بعد) تُشغِّل الكشف التلقائي وتخزّن
 * نتيجته في المخزن المركزي كمناطق قابلة للتعديل؛ من تلك اللحظة regions تصبح
 * "الحقيقة" الوحيدة، تُرسَم كما هي بلا إعادة كشف — فتعديلات المستخدم اليدوية
 * (سحب/تحجيم/حذف/إضافة عبر CropMaskRegion) تنعكس هنا فوراً وتُصدَّر كما هي.
 */
function CropPreview({ template, photo, blurFaces, blurStyle, regions, onSeedRegions }) {
  const canvasRef = useRef(null);
  const imgCacheRef = useRef({ url: null, img: null, cover: null });
  const [status, setStatus] = useState('idle'); // idle | loading | analyzing | error

  const regionsKey = regions
    ? regions.map((r) => `${r.id}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`).join('|')
    : null;

  useEffect(() => {
    if (!blurFaces || !photo || !template) return undefined;
    let cancelled = false;

    (async () => {
      try {
        let cache = imgCacheRef.current;
        if (cache.url !== photo.url || cache.templateW !== template.width || cache.templateH !== template.height) {
          setStatus('loading');
          const img = cache.url === photo.url ? cache.img : await loadImageEl(photo.url);
          if (cancelled) return;
          cache = {
            url: photo.url,
            img,
            templateW: template.width,
            templateH: template.height,
            cover: computeCoverRect(img.naturalWidth, img.naturalHeight, template.width, template.height),
          };
          imgCacheRef.current = cache;
        }

        const canvas = canvasRef.current;
        canvas.width = template.width;
        canvas.height = template.height;
        const ctx = canvas.getContext('2d');
        const { sx, sy, sw, sh } = cache.cover;
        ctx.clearRect(0, 0, template.width, template.height);
        ctx.drawImage(cache.img, sx, sy, sw, sh, 0, 0, template.width, template.height);

        if (!regions) {
          // لا مناطق محفوظة لهذه الصورة بعد — كشف أولي مرة واحدة، يُبذَر في
          // المخزن؛ تغيّره سيُعيد تشغيل هذا الأثر فيرسم فعلياً بعد قليل.
          setStatus('analyzing');
          const mod = await import('../core/faceBlur.js');
          const scale = template.width / sw;
          const faces = await mod.detectFaces(cache.img);
          if (cancelled) return;
          onSeedRegions(
            photo.id,
            faces.map((r) => ({
              id: `mask_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              x: (r.x - sx) * scale,
              y: (r.y - sy) * scale,
              w: r.w * scale,
              h: r.h * scale,
            }))
          );
          return;
        }

        if (regions.length) {
          const mod = await import('../core/faceBlur.js');
          mod.applyRegionsEffect(ctx, regions, blurStyle);
        }
        setStatus('idle');
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blurFaces, photo?.id, photo?.url, template?.width, template?.height, blurStyle, regionsKey]);

  if (!photo) return <span className="placeholder-text">أضف صوراً لمعاينة النتيجة</span>;
  if (!blurFaces) return <img className="crop-preview-photo" src={photo.url} alt="" draggable={false} />;

  return (
    <>
      <canvas ref={canvasRef} className="crop-preview-photo" />
      {status === 'loading' && <div className="crop-preview-status">جارٍ تحميل الصورة...</div>}
      {status === 'analyzing' && <div className="crop-preview-status">جارٍ تحليل الوجوه...</div>}
      {status === 'error' && (
        <div className="crop-preview-status error">تعذّر تحليل هذه الصورة — ستُصدَّر بلا تغبيش</div>
      )}
    </>
  );
}

/**
 * دائرة/بيضاوية تغبيش قابلة للسحب والتحجيم فوق المعاينة — تحكّم يدوي كامل
 * لكل منطقة (موضع + حجم)، بنفس آلية startPointerDrag المستخدمة في DraggableField.
 * أثناء السحب تتحرك محلياً فقط (بلا كتابة للمخزن) تفادياً لإعادة رسم الكانفاس
 * (تغبيش كامل) في كل إطار؛ القيمة النهائية تُحفَظ في المخزن عند رفع الإصبع/الفأرة فقط.
 */
function CropMaskRegion({ region, onCommit, onRemove }) {
  const [live, setLive] = useState(region);
  const liveRef = useRef(region);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) {
      liveRef.current = region;
      setLive(region);
    }
  }, [region]);

  const setLiveBoth = (next) => {
    liveRef.current = next;
    setLive(next);
  };

  const handleMove = (e) => {
    draggingRef.current = true;
    const originX = region.x;
    const originY = region.y;
    startPointerDrag(
      e,
      (dx, dy) => setLiveBoth({ ...region, x: originX + dx, y: originY + dy }),
      () => {
        draggingRef.current = false;
        onCommit(liveRef.current);
      }
    );
  };

  const handleResize = (e) => {
    draggingRef.current = true;
    const cx = region.x + region.w / 2;
    const cy = region.y + region.h / 2;
    const startW = region.w;
    const startH = region.h;
    startPointerDrag(
      e,
      (dx, dy) => {
        // تحجيم موحّد من المركز — يكبّر/يصغّر الدائرة بتناسق بدل تمديدها.
        const factor = Math.max(0.25, 1 + (dx + dy) / 140);
        const w = Math.max(24, startW * factor);
        const h = Math.max(24, startH * factor);
        setLiveBoth({ ...region, x: cx - w / 2, y: cy - h / 2, w, h });
      },
      () => {
        draggingRef.current = false;
        onCommit(liveRef.current);
      }
    );
  };

  return (
    <div className="mask-region" style={{ left: `${live.x}px`, top: `${live.y}px`, width: `${live.w}px`, height: `${live.h}px` }}>
      <div className="mask-region-ellipse" onPointerDown={handleMove} title="اسحب لتحريك منطقة التغبيش" />
      <div className="mask-region-resize" onPointerDown={handleResize} title="اسحب لتكبير/تصغير الدائرة">
        <Icon name="resize" size={10} />
      </div>
      <button
        type="button"
        className="mask-region-remove"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        title="إزالة هذه المنطقة"
      >
        <Icon name="x" size={11} />
      </button>
    </div>
  );
}

export default function Workspace() {
  const mode = useStore((s) => s.mode);
  const templateImage = useStore((s) => s.templateImage);
  const activeFields = useStore((s) => s.activeFields);
  const cropTemplate = useStore((s) => s.cropTemplate);
  const cropImages = useStore((s) => s.cropImages);
  const cropBlurFaces = useStore((s) => s.cropBlurFaces);
  const cropBlurStyle = useStore((s) => s.cropBlurStyle);
  const cropManualMasks = useStore((s) => s.cropManualMasks);
  const setCropMaskRegions = useStore((s) => s.setCropMaskRegions);
  const addCropMaskRegion = useStore((s) => s.addCropMaskRegion);
  const updateCropMaskRegion = useStore((s) => s.updateCropMaskRegion);
  const removeCropMaskRegion = useStore((s) => s.removeCropMaskRegion);
  const resetCropMaskRegions = useStore((s) => s.resetCropMaskRegions);
  const zoom = useStore((s) => s.zoom);
  const changeZoom = useStore((s) => s.changeZoom);
  const setZoom = useStore((s) => s.setZoom);
  const resetZoom = useStore((s) => s.resetZoom);
  const selectField = useStore((s) => s.selectField);

  const wrapperRef = useRef(null);
  const [guides, setGuides] = useState({ v: false, h: false });
  const [previewIndex, setPreviewIndex] = useState(0);

  const isCrop = mode === 'crop';
  const isPosts = mode === 'posts';
  // في وضع القص القالب هو إطار PNG منفصل تماماً عن قالب الشهادة؛ وضع النصوص
  // لا يستخدم صورة/تكبير إطلاقاً؛ الوضعان الآخران يتشاركان templateImage.
  const effectiveTemplate = isCrop ? cropTemplate : isPosts ? null : templateImage;

  // ملاءمة القالب لحجم الشاشة عند رفع صورة جديدة
  useEffect(() => {
    if (!effectiveTemplate || !wrapperRef.current) return;
    const { clientWidth, clientHeight } = wrapperRef.current;
    const fit = Math.min(
      (clientWidth - 80) / effectiveTemplate.width,
      (clientHeight - 80) / effectiveTemplate.height,
      1
    );
    setZoom(Number(fit.toFixed(2)));
  }, [effectiveTemplate, setZoom]);

  // تصحيح مؤشر معاينة صور القص عند حذف صور أو تجاوز الحد
  useEffect(() => {
    if (previewIndex >= cropImages.length) setPreviewIndex(Math.max(0, cropImages.length - 1));
  }, [cropImages.length, previewIndex]);

  // Ctrl + عجلة الفأرة للتكبير (listener غير passive حتى يعمل preventDefault)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      changeZoom(e.deltaY < 0 ? 0.05 : -0.05);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [changeZoom]);

  // اختصارات المحرر — تُتجاهل أثناء الكتابة في أي حقل إدخال
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      const s = useStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }

      const id = s.selectedFieldId;
      if (!id || !s.activeFields[id]) return;
      const field = s.activeFields[id];

      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicateField(id);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.removeField(id);
        return;
      }
      if (e.key === 'Escape') {
        s.selectField(null);
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[
        e.key
      ];
      if (nudge) {
        e.preventDefault();
        s.moveField(id, field.x + nudge[0], field.y + nudge[1]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const workspaceStyle = {
    transform: `scale(${zoom})`,
    ...(effectiveTemplate
      ? { width: `${effectiveTemplate.width}px`, height: `${effectiveTemplate.height}px` }
      : null),
  };

  const visibleFields = Object.values(activeFields)
    .filter((f) => f.visible !== false)
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  const currentPhoto = cropImages[previewIndex] ?? null;
  const currentRegions = currentPhoto ? cropManualMasks[currentPhoto.id] : undefined;

  // وضع النصوص لا يستخدم مساحة العمل القابلة للتكبير إطلاقاً — معاينة مستقلة
  if (isPosts) {
    return (
      <div className="workspace-wrapper glass-panel">
        <PostsPreview />
      </div>
    );
  }

  return (
    <div className="workspace-wrapper glass-panel" ref={wrapperRef}>
      {/* منطقة التمرير منفصلة عن الغلاف حتى لا يتحرك شريط التكبير مع المحتوى */}
      <div className="workspace-scroll">
        <div
          id="workspace"
          className={effectiveTemplate ? 'has-image' : ''}
          style={workspaceStyle}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || e.target.id === 'certificate-img') selectField(null);
          }}
        >
          {isCrop ? (
            cropTemplate ? (
              <div className="crop-preview-stack">
                <CropPreview
                  template={cropTemplate}
                  photo={currentPhoto}
                  blurFaces={cropBlurFaces}
                  blurStyle={cropBlurStyle}
                  regions={currentRegions}
                  onSeedRegions={setCropMaskRegions}
                />
                <img className="crop-preview-frame" src={cropTemplate.url} alt="" draggable={false} />
                {cropBlurFaces &&
                  currentPhoto &&
                  currentRegions?.map((region) => (
                    <CropMaskRegion
                      key={region.id}
                      region={region}
                      onCommit={(next) => updateCropMaskRegion(currentPhoto.id, region.id, next)}
                      onRemove={() => removeCropMaskRegion(currentPhoto.id, region.id)}
                    />
                  ))}
              </div>
            ) : (
              <span className="placeholder-text">يرجى رفع قالب الإطار (PNG) للبدء</span>
            )
          ) : effectiveTemplate ? (
            <img id="certificate-img" src={effectiveTemplate.url} alt="قالب الشهادة" draggable={false} />
          ) : (
            <span className="placeholder-text">يرجى رفع قالب الشهادة للبدء</span>
          )}

          {!isCrop &&
            effectiveTemplate &&
            visibleFields.map((field) => (
              <DraggableField key={field.id} field={field} onGuides={setGuides} />
            ))}

          {/* خطوط الالتقاط على منتصف الصورة */}
          {guides.v && <div className="snap-guide vertical" />}
          {guides.h && <div className="snap-guide horizontal" />}
        </div>
      </div>

      {isCrop && cropTemplate && cropBlurFaces && currentPhoto && (
        <div className="crop-mask-toolbar">
          <button
            className="zoom-btn"
            onClick={() => addCropMaskRegion(currentPhoto.id, cropTemplate)}
            title="إضافة منطقة تغبيش يدوياً (لوجه فاته الكشف التلقائي مثلاً)"
          >
            <Icon name="plus" size={14} />
          </button>
          {currentRegions?.length > 0 && (
            <button
              className="zoom-btn"
              onClick={() => resetCropMaskRegions(currentPhoto.id)}
              title="إعادة الكشف التلقائي لهذه الصورة (يتجاهل كل تعديل يدوي عليها)"
            >
              <Icon name="refresh" size={14} />
            </button>
          )}
        </div>
      )}

      {isCrop && cropTemplate && cropImages.length > 1 && (
        <div className="crop-preview-nav">
          <button
            className="zoom-btn"
            onClick={() => setPreviewIndex((i) => (i - 1 + cropImages.length) % cropImages.length)}
            title="الصورة السابقة"
          >
            <Icon name="chevronRight" size={16} />
          </button>
          <span>
            معاينة {previewIndex + 1} / {cropImages.length}
          </span>
          <button
            className="zoom-btn"
            onClick={() => setPreviewIndex((i) => (i + 1) % cropImages.length)}
            title="الصورة التالية"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
        </div>
      )}

      {effectiveTemplate && (
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => changeZoom(0.1)} title="تكبير">
            <Icon name="plus" size={15} />
          </button>
          <span id="zoom-level-text">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => changeZoom(-0.1)} title="تصغير">
            <Icon name="minus" size={15} />
          </button>
          <button className="zoom-btn" onClick={resetZoom} title="إعادة ضبط (100%)">
            <Icon name="refresh" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
