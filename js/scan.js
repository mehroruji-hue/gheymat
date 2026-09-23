// خواندن عدد از تصویر زنده‌ی دوربین — بدون عکس گرفتن و بدون ارسال هیچ تصویری

import { readPersian, buildTemplates } from './fadigits.js';

const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('کتابخانه‌ی تشخیص متن بارگذاری نشد'));
    document.head.appendChild(s);
  });
}

// موتور تشخیص فقط وقتی دوربین باز می‌شود بارگذاری می‌شود، نه در شروع برنامه
async function getWorker(onProgress) {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    await loadScript(TESSERACT_SRC);
    const worker = await window.Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata') {
          onProgress?.(m.progress || 0);
        }
      },
    });
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789,.٬٫ ',
      tessedit_pageseg_mode: '7', // یک خط متن
    });
    return worker;
  })();
  return workerPromise;
}

export class Scanner {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.running = false;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  // فقط نوار وسط تصویر (جایی که کاربر روی قیمت می‌گیرد) بریده و پردازش می‌شود
  grabStrip() {
    const v = this.video;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return null;
    const w = Math.round(vw * 0.8);
    const h = Math.round(vh * 0.2);
    const x = Math.round((vw - w) / 2);
    const y = Math.round((vh - h) / 2);
    const scale = 2; // بزرگ‌نمایی برای خوانایی بهتر
    this.canvas.width = w * scale;
    this.canvas.height = h * scale;
    this.ctx.drawImage(v, x, y, w, h, 0, 0, this.canvas.width, this.canvas.height);
    this.enhance();
    return this.canvas;
  }

  // خاکستری و کنتراست بالا: کمک می‌کند عدد از پس‌زمینه‌ی شلوغ جدا شود
  enhance() {
    const img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const d = img.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = g;
      sum += g;
    }
    const mean = sum / (d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] < mean - 8 ? 0 : d[i] > mean + 8 ? 255 : (d[i] - mean + 8) * (255 / 16);
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
    }
    this.ctx.putImageData(img, 0, 0);
  }

  /**
   * حلقه‌ی خواندن. اول ارقام فارسی را با تشخیص‌دهنده‌ی داخلی امتحان می‌کند
   * (سریع، آفلاین و بدون دانلود)؛ اگر چند بار پشت‌سرهم چیزی پیدا نشد،
   * یعنی احتمالاً برچسب با ارقام لاتین است و موتور بیرونی بارگذاری می‌شود.
   */
  async loop(onResult, onProgress) {
    this.running = true;
    await buildTemplates();
    let misses = 0;
    let workerPromise = null;

    while (this.running) {
      const canvas = this.grabStrip();
      if (canvas) {
        let hit = null;

        try {
          const fa = await readPersian(canvas);
          if (fa && fa.confidence >= 68 && fa.digits.length >= 3 && fa.digits.length <= 12) {
            hit = { value: Number(fa.digits), raw: fa.digits, confidence: fa.confidence, script: 'fa' };
          }
        } catch {
          /* فریم خراب */
        }

        if (hit) {
          misses = 0;
        } else if (++misses >= 5) {
          try {
            workerPromise = workerPromise || getWorker(onProgress);
            const worker = await workerPromise;
            const { data } = await worker.recognize(canvas);
            const b = bestNumber(data.text, data.confidence);
            // عدد اشتباه از نخواندن بدتر است: زیر این حد اطمینان چیزی پیشنهاد نمی‌کنیم
            if (b && data.confidence >= 70) hit = { ...b, script: 'en' };
          } catch {
            /* موتور لاتین در دسترس نیست؛ فارسی همچنان کار می‌کند */
          }
        }

        if (hit) onResult(hit);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/**
 * ارقام فارسی با تشخیص‌دهنده‌ی داخلی (js/fadigits.js) خوانده می‌شوند و
 * ارقام لاتین با موتور بیرونی. هر دو نتیجه قبل از استفاده باید تأیید کاربر بگیرند.
 */
// از متن خوانده‌شده، محتمل‌ترین «مبلغ» را درمی‌آورد
export function bestNumber(text, confidence = 0) {
  const cleaned = String(text || '').replace(/[٬٫]/g, ',');
  const candidates = cleaned.match(/\d[\d,. ]*/g) || [];
  let best = null;
  for (const c of candidates) {
    const digits = c.replace(/[^\d]/g, '');
    if (digits.length < 3 || digits.length > 12) continue; // مبلغ‌های خیلی کوتاه یا خیلی بلند را رد کن
    const value = Number(digits);
    if (!best || value > best.value) best = { value, raw: c.trim(), confidence };
  }
  return best;
}

export const cameraError = (e) => {
  const map = {
    NotAllowedError: 'اجازه‌ی دوربین داده نشد. از تنظیمات مرورگر اجازه بده.',
    NotFoundError: 'دوربینی پیدا نشد.',
    NotReadableError: 'دوربین دست برنامه‌ی دیگری است.',
  };
  if (!window.isSecureContext) return 'دوربین فقط روی آدرس امن (https) کار می‌کند.';
  return map[e?.name] || `دوربین باز نشد (${e?.message || e})`;
};
