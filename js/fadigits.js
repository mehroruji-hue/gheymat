// تشخیص ارقام فارسی، بدون کتابخانه‌ی بیرونی
// روش: جدا کردن هر رقم از تصویر، یکسان‌سازی اندازه، و مقایسه با الگوهایی که
// از روی فونت‌های موجود همان لحظه ساخته می‌شوند.

const DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const FONTS = [
  '700 120px Vazirmatn',
  '400 120px Vazirmatn',
  'bold 120px Tahoma',
  '120px Tahoma',
  'bold 120px "Segoe UI"',
  '120px "Noto Sans Arabic"',
];
const GW = 20; // عرض شبکه‌ی یکسان‌سازی
const GH = 28; // ارتفاع شبکه

let templates = null;

// ---------- ابزارهای تصویر ----------

function toBinary(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < img.length; i += 4, p++) {
    const g = (0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]) | 0;
    gray[p] = g;
    hist[g]++;
  }
  // آستانه‌ی اوتسو
  const total = w * h;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  // فرض: متن تیره روی زمینه‌ی روشن؛ اگر برعکس بود، معکوس می‌کنیم
  const bin = new Uint8Array(w * h);
  let dark = 0;
  for (let p = 0; p < gray.length; p++) {
    bin[p] = gray[p] < thr ? 1 : 0;
    dark += bin[p];
  }
  if (dark > total * 0.55) for (let p = 0; p < bin.length; p++) bin[p] ^= 1;
  return bin;
}

// اجزای به‌هم‌پیوسته: هر رقم یک جزء است
function components(bin, w, h) {
  const seen = new Uint8Array(w * h);
  const boxes = [];
  const stack = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!bin[i] || seen[i]) continue;
      let minX = x, maxX = x, minY = y, maxY = y, n = 0;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const p = stack.pop();
        const px = p % w;
        const py = (p / w) | 0;
        n++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const q = ny * w + nx;
            if (bin[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
          }
        }
      }
      boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, n });
    }
  }
  return boxes;
}

// هر جزء به شبکه‌ی ثابت GW×GH تبدیل می‌شود تا با الگوها قابل مقایسه باشد
function normalize(bin, w, box) {
  const grid = new Float32Array(GW * GH);
  const sx = box.w / GW;
  const sy = box.h / GH;
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const x0 = box.x + Math.floor(gx * sx);
      const x1 = box.x + Math.max(Math.floor((gx + 1) * sx), Math.floor(gx * sx) + 1);
      const y0 = box.y + Math.floor(gy * sy);
      const y1 = box.y + Math.max(Math.floor((gy + 1) * sy), Math.floor(gy * sy) + 1);
      let on = 0, tot = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) { on += bin[y * w + x]; tot++; }
      }
      grid[gy * GW + gx] = tot ? on / tot : 0;
    }
  }
  return grid;
}

const similarity = (a, b) => {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    inter += Math.min(a[i], b[i]);
    union += Math.max(a[i], b[i]);
  }
  return union ? inter / union : 0;
};

// ---------- ساخت الگوها ----------

export async function buildTemplates() {
  if (templates) return templates;
  try { await document.fonts?.ready; } catch {}
  const size = 200;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  templates = [];
  for (const font of FONTS) {
    for (let d = 0; d < 10; d++) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(DIGITS[d], size / 2, size / 2);
      const bin = toBinary(ctx, size, size);
      const boxes = components(bin, size, size).sort((a, b) => b.n - a.n);
      if (!boxes.length || boxes[0].n < 12) continue;
      const box = boxes[0];
      templates.push({
        digit: d,
        grid: normalize(bin, size, box),
        aspect: box.w / box.h,
        fill: box.n / (box.w * box.h),
      });
    }
  }
  return templates;
}

// ---------- تشخیص ----------

/**
 * عدد فارسی را از یک canvas می‌خواند.
 * خروجی: { digits: '450000', confidence: 0..100 } یا null
 */
export async function readPersian(canvas) {
  const tpl = await buildTemplates();
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const bin = toBinary(ctx, w, h);
  const boxes = components(bin, w, h);
  if (!boxes.length) return null;

  const maxH = Math.max(...boxes.map((b) => b.h));
  const candidates = boxes
    .filter((b) => b.h >= maxH * 0.25 && b.h <= maxH * 1.1 && b.w <= b.h * 1.8 && b.n >= 8)
    .sort((a, b) => a.x - b.x);
  if (candidates.length < 2) return null;

  // جداکننده‌ی هزارگان («٬» یا «,») روی خط کرسی می‌نشیند و کوتاه است؛
  // صفر فارسی هم کوتاه است ولی وسط ارتفاع قرار می‌گیرد. با همین فرقشان را می‌فهمیم.
  const tall = candidates.filter((b) => b.h >= maxH * 0.6);
  const baseline = tall.length
    ? tall.reduce((s, b) => s + b.y + b.h, 0) / tall.length
    : Math.max(...candidates.map((b) => b.y + b.h));
  const glyphs = candidates.filter((b) => {
    if (b.h >= maxH * 0.5) return true; // رقم بلند
    const centerY = b.y + b.h / 2;
    return centerY < baseline - maxH * 0.18; // بالاتر از کرسی، پس رقم است نه جداکننده
  });
  if (glyphs.length < 2) return null;

  const out = [];
  let scoreSum = 0;
  for (const g of glyphs) {
    const grid = normalize(bin, w, g);
    const aspect = g.w / g.h;
    let best = null;
    for (const t of tpl) {
      let s = similarity(grid, t.grid);
      // شکل کلی رقم هم باید بخواند، نه فقط پیکسل‌ها
      s -= Math.min(0.25, Math.abs(aspect - t.aspect) * 0.35);
      if (!best || s > best.s) best = { s, digit: t.digit };
    }
    if (!best || best.s < 0.42) return null; // یک رقم مشکوک، کل عدد را باطل می‌کند
    out.push(best.digit);
    scoreSum += best.s;
  }
  const confidence = Math.round((scoreSum / out.length) * 100);
  return { digits: out.join(''), confidence };
}

export const hasPersianDigits = (s) => /[۰-۹٠-٩]/.test(String(s || ''));
