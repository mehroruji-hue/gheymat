import { fa, parseAmount, group, words, convert, afterDiscount, speakable, UNITS } from './money.js';
import { Scanner, cameraError } from './scan.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const P = {
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.3-2h5l1.3 2h1.7A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z"/><circle cx="12" cy="13" r="3.6"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5M18 7a7.5 7.5 0 0 1 0 10"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
  x: '<path d="M6 6 18 18M18 6 6 18"/>',
  del: '<path d="M9 5h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L3 12z"/><path d="M12 9.5 16.5 14M16.5 9.5 12 14"/>',
};
const icon = (n) =>
  `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

const state = {
  digits: '',
  unit: 'toman',
  discounts: [],
};

const amount = () => parseAmount(state.digits);

// اندازه‌ی عدد با طولش تنظیم می‌شود تا هیچ‌وقت نشکند
const fit = (text, max = 52) => {
  const n = text.length;
  return Math.round(n <= 7 ? max : n <= 10 ? max * 0.82 : n <= 13 ? max * 0.66 : max * 0.54);
};
const bigNumber = (v, unit, max) => {
  const t = group(v);
  return `<span class="val" style="font-size:${fit(t, max)}px">${t}</span><span class="unit">${UNITS[unit].fa}</span>`;
};
const other = () => (state.unit === 'toman' ? 'rial' : 'toman');

function toast(msg) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- صفحه ----------

function render() {
  const app = $('#app');
  const v = amount();
  const { final, saved } = afterDiscount(v, state.discounts);
  const hasDiscount = state.discounts.length > 0 && v > 0;

  app.innerHTML = `
    <header class="top">
      <div class="brand">
        <h1>قیمت</h1>
        <span>قیمت رو بخون، تخفیف رو حساب کن</span>
      </div>
    </header>

    <section class="amount-card">
      <div class="amount" id="amount">${bigNumber(v, state.unit, 52)}</div>
      <div class="in-words" id="inWords">${v ? words(v) + ' ' + UNITS[state.unit].fa : 'مبلغ را وارد کن یا با دوربین بخوان'}</div>
      <div class="alt-unit num">${v ? `${group(convert(v, state.unit, other()))} ${UNITS[other()].fa}` : '&nbsp;'}</div>
      <div class="row">
        <button class="btn btn-ghost grow" id="speak" ${v ? '' : 'disabled'}>${icon('speaker')} بخوان</button>
        <button class="btn btn-primary grow" id="scan">${icon('camera')} دوربین</button>
      </div>
    </section>

    <div class="unit-switch" role="group" aria-label="واحد پول">
      <button data-unit="toman" class="${state.unit === 'toman' ? 'on' : ''}">تومان</button>
      <button data-unit="rial" class="${state.unit === 'rial' ? 'on' : ''}">ریال</button>
    </div>

    <section class="pad-box">
      <div class="pad-label">مبلغ را اینجا وارد کن</div>
      <div class="pad" id="pad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-d="${d}">${fa(d)}</button>`).join('')}
      <button data-d="000" class="wide">۰۰۰</button>
      <button data-d="0">۰</button>
      <button id="del" class="del" aria-label="پاک کردن">${icon('del')}</button>
      </div>
    </section>

    <section class="panel">
      <h3>تخفیف</h3>
      <div class="chips" id="chips">
        ${[10, 20, 30, 40, 50, 70].map((p) =>
          `<button data-p="${p}" class="${state.discounts.includes(p) ? 'on' : ''}">${fa(p)}٪</button>`).join('')}
      </div>
      <p class="hint">می‌تونی دو تخفیف را با هم بزنی؛ پشت‌سرهم حساب می‌شود.</p>
      ${hasDiscount
        ? `<div class="result">
             <div class="hint">${state.discounts.map((p) => fa(p) + '٪').join(' + ')} تخفیف</div>
             <div class="final">${bigNumber(final, state.unit, 32)}</div>
             <div class="final-words">${words(final)} ${UNITS[state.unit].fa}</div>
             <div class="saved num">${group(saved)} ${UNITS[state.unit].fa} کمتر می‌دهی</div>
             <button class="btn btn-ghost" id="speakFinal">${icon('speaker')} خواندن قیمت نهایی</button>
           </div>`
        : ''}
    </section>

    <div id="err"></div>
    <p class="hint">تصویر دوربین هیچ‌جا ذخیره یا فرستاده نمی‌شود. همه‌چیز روی همین گوشی پردازش می‌شود.</p>`;

  $$('#pad button[data-d]').forEach((b) => {
    b.onclick = () => {
      if (state.digits.length > 12) return;
      state.digits = (state.digits + b.dataset.d).replace(/^0+(?=\d)/, '');
      render();
    };
  });
  $('#del').onclick = () => {
    state.digits = state.digits.slice(0, -1);
    render();
  };
  $('#del').oncontextmenu = (e) => {
    e.preventDefault();
    state.digits = '';
    render();
  };
  $$('[data-unit]').forEach((b) => {
    b.onclick = () => {
      state.unit = b.dataset.unit;
      render();
    };
  });
  $$('#chips button').forEach((b) => {
    b.onclick = () => {
      const p = Number(b.dataset.p);
      const i = state.discounts.indexOf(p);
      if (i >= 0) state.discounts.splice(i, 1);
      else if (state.discounts.length < 2) state.discounts.push(p);
      else state.discounts = [p];
      render();
    };
  });
  $('#speak').onclick = () => speak(speakable(v, state.unit));
  $('#speakFinal')?.addEventListener('click', () => speak(`${words(final)} ${UNITS[state.unit].fa}`));
  $('#scan').onclick = openCamera;
}

// ---------- خواندن با صدا ----------

function speak(text) {
  if (!('speechSynthesis' in window)) return toast('این دستگاه صدا ندارد');
  const voices = speechSynthesis.getVoices();
  const fv = voices.find((v) => /^fa/i.test(v.lang));
  const u = new SpeechSynthesisUtterance(text);
  if (fv) u.voice = fv;
  u.lang = fv ? fv.lang : 'fa-IR';
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  if (!fv) toast('صدای فارسی روی این دستگاه نصب نیست');
}

// ---------- دوربین ----------

let scanner = null;

async function openCamera() {
  const cam = document.createElement('div');
  cam.className = 'cam';
  cam.innerHTML = `
    <video playsinline muted></video>
    <div class="cam-hint">قیمت را داخل کادر بگیر<br><small style="font-weight:600;opacity:.85">ارقام فارسی و لاتین، هر دو</small></div>
    <div class="cam-frame"></div>
    <div class="cam-read"><b id="live">…</b><div id="camStatus" class="hint" style="color:#fff">در حال آماده‌سازی</div></div>
    <div class="cam-bar">
      <button class="btn btn-ghost grow" id="camClose">${icon('x')} بستن</button>
      <button class="btn btn-primary grow" id="camOk" disabled>${icon('check')} تأیید عدد</button>
    </div>`;
  document.body.appendChild(cam);
  const canvas = document.createElement('canvas');

  let candidate = null;
  const close = () => {
    scanner?.stop();
    scanner = null;
    cam.remove();
  };
  $('#camClose', cam).onclick = close;
  $('#camOk', cam).onclick = () => {
    if (!candidate) return;
    state.digits = String(candidate.value);
    close();
    render();
    toast('عدد وارد شد؛ اگر اشتباه است اصلاحش کن');
  };

  scanner = new Scanner($('video', cam), canvas);
  try {
    await scanner.start();
  } catch (e) {
    close();
    $('#err').innerHTML = `<div class="alert">${cameraError(e)}</div>`;
    return;
  }

  scanner
    .loop(
      (hit) => {
        candidate = hit;
        $('#live', cam).textContent = group(hit.value);
        $('#camStatus', cam).textContent = `${UNITS[state.unit].fa} · ${hit.script === 'fa' ? 'ارقام فارسی' : 'ارقام لاتین'} — اگر درست است تأیید کن`;
        $('#camOk', cam).classList.add('btn-primary');
        $('#camOk', cam).disabled = false;
      },
      (p) => {
        const el = $('#camStatus', cam);
        if (el) el.textContent = `بارگذاری موتور تشخیص… ${fa(Math.round(p * 100))}٪`;
      }
    )
    .catch((e) => {
      const el = $('#camStatus', cam);
      if (el) el.textContent = e.message || 'تشخیص متن در دسترس نیست؛ دستی وارد کن';
    });
}

// ---------- راه‌اندازی ----------

if ('speechSynthesis' in window) speechSynthesis.getVoices();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
