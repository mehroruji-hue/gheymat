// خواندن و نوشتن مبلغ به فارسی

const FA = '۰۱۲۳۴۵۶۷۸۹';
export const fa = (v) => String(v).replace(/\d/g, (d) => FA[d]);

// ارقام فارسی و عربی و جداکننده‌ها را به عدد ساده تبدیل می‌کند
export function parseAmount(str) {
  const s = String(str ?? '')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[^\d]/g, '');
  return s ? Number(s) : 0;
}

export const group = (v) => fa(Math.round(v).toLocaleString('en-US')).replace(/,/g, '٬');

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', ' هزار', ' میلیون', ' میلیارد', ' هزار میلیارد'];

function under1000(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]);
  else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) parts.push(TENS[t]);
    if (o) parts.push(ONES[o]);
  }
  return parts.join(' و ');
}

/** عدد را به حروف فارسی می‌نویسد: ۴۵۰۰۰۰ ← «چهارصد و پنجاه هزار» */
export function words(n) {
  n = Math.round(Math.abs(n));
  if (n === 0) return 'صفر';
  const chunks = [];
  let i = 0;
  while (n > 0 && i < SCALES.length) {
    const c = n % 1000;
    if (c) chunks.unshift(under1000(c) + SCALES[i]);
    n = Math.floor(n / 1000);
    i++;
  }
  return chunks.join(' و ');
}

export const UNITS = {
  toman: { id: 'toman', fa: 'تومان', toRial: 10 },
  rial: { id: 'rial', fa: 'ریال', toRial: 1 },
};

/** تبدیل مبلغ بین ریال و تومان */
export const convert = (amount, from, to) =>
  (amount * UNITS[from].toRial) / UNITS[to].toRial;

/** قیمت بعد از یک یا دو تخفیف پشت‌سرهم */
export function afterDiscount(amount, percents) {
  const list = (Array.isArray(percents) ? percents : [percents]).filter((p) => p > 0);
  const final = list.reduce((v, p) => v * (1 - p / 100), amount);
  return { final: Math.round(final), saved: Math.round(amount - final) };
}

/** متنی که برای خواندن با صدا استفاده می‌شود */
export const speakable = (amount, unit) => `${words(amount)} ${UNITS[unit].fa}`;
