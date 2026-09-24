// Text heuristics are suggestions only; never invent a missing calendar month.
export function normalizeSlip(text) {
  return String(text).normalize('NFKC').replace(/\u200b|\ufeff/g, '').replace(/\u0e4d\u0e32/g, 'ำ').replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 3664));
}

export function extractDate(raw) {
  const text = normalizeSlip(raw);
  const thaiContext = /[ก-๙]/.test(text);
  function date(d, m, y, thai = false) {
    y = Number(y);
    if (y < 100) y += thai && y >= 40 ? 2500 : 2000;
    if (y >= 2400) y -= 543;
    const value = `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
    const parsed = new Date(value);
    return y >= 1900 && y <= 2200 && !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value ? value : '';
  }
  const thaiMonths = ['มค','กพ','มีค','เมย','พค','มิย','กค','สค','กย','ตค','พย','ธค'];
  const fullMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const english = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const candidates = [];
  // Allow OCR spaces within dotted Thai month abbreviations and around separators.
  for (const match of text.matchAll(/(\d{1,2})\s*([ก-๙a-zA-Z][ก-๙a-zA-Z.\s]{0,18}?)\s*(\d{4}|\d{2})(?!\d)/g)) {
    const month = match[2].replace(/[.\s]/g, '').toLowerCase();
    let index = thaiMonths.indexOf(month);
    if (index < 0) index = fullMonths.indexOf(month);
    const isThai = index >= 0;
    if (index < 0) index = english.indexOf(month.slice(0, 3));
    if (index >= 0) candidates.push(date(match[1], index + 1, match[3], isThai));
  }
  for (const m of text.matchAll(/(?<!\d)(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})(?!\d)/g)) candidates.push(date(m[3], m[2], m[1]));
  for (const m of text.matchAll(/(?<![\d.])(\d{1,2})\s*([/.-])\s*(\d{1,2})\s*\2\s*(\d{4}|\d{2})(?![\d.])/g)) candidates.push(date(m[1], m[3], m[4], thaiContext));
  const valid = [...new Set(candidates.filter(Boolean))];
  return valid.length === 1 ? valid[0] : '';
}

export function extractRecipient(raw) {
  const text = normalizeSlip(raw);
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const bank = /(?:ธ\.|ธนาคาร|กสิกรไทย|ไทยพาณิชย์|กรุงไทย|กรุงเทพ|กรุงศรี|ออมสิน|\bbank\b|\bkbank\b|\bscb\b)/i;
  const account = /[xX*•]{2,}.*\d|\d.*[xX*•]{2,}/;
  const metadata = /^(?:เลขที่|หมายเลข|รายการ|จำนวน|ค่าธรรมเนียม|วันที่|เวลา|reference|transaction|amount|fee|date|time|account)\b|^(?:เลขที่|จำนวน|ค่าธรรมเนียม|วันที่|เวลา)/i;
  const name = /^(?:นาย\s*|นางสาว\s*|นาง\s*|น\s*\.\s*ส\s*\.\s*|ด\s*\.\s*[ชญ]\s*\.\s*|(?:mr|mrs|ms|miss)\.?\s+)/i;
  const cleaned = s => s.replace(/^[|:：\s]+|[|\s]+$/g, '').slice(0, 160);
  const plausible = s => /[ก-๙a-z]/i.test(s) && !bank.test(s) && !account.test(s) && !metadata.test(s) && !/สำเร็จ|successful|สแกน|scan|บาท|THB|^\d/i.test(s);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:ชื่อผู้รับ(?:เงิน)?|ผู้รับ(?:เงิน)?|ชื่อบัญชีผู้รับ|โอนไปยัง|ไปยัง|ถึง|ปลายทาง|recipient(?:\s+name)?\b|payee\b|to\b)\s*[:：]?\s*(.*)$/i);
    if (!m) continue;
    const inline = cleaned(m[1]);
    if (inline && plausible(inline)) return inline;
    for (const line of lines.slice(i + 1, i + 5)) {
      const candidate = cleaned(line);
      if (metadata.test(candidate)) break;
      if (plausible(candidate)) return candidate;
    }
  }
  // K+ transfer slips: sender name + bank/account, then recipient name + bank/account.
  // Require exactly two account blocks so a single sender cannot become a recipient.
  const names = lines.map((s, index) => ({value: cleaned(s), index})).filter(x => name.test(x.value));
  if (/โอนเงิน|โอนสำเร็จ|transfer/i.test(text) && names.length === 2) {
    const blocks = names.map((n, i) => lines.slice(n.index + 1, i === 0 ? names[1].index : n.index + 5));
    if (blocks.every(block => block.some(s => bank.test(s)) && block.some(s => account.test(s)))) return names[1].value;
  }
  return '';
}

export function suggestCategory(recipient, history = []) {
  const key = s => normalizeSlip(s).toLowerCase().replace(/[\s.,]/g, '');
  const identity = key(recipient);
  if (!identity) return {category: 'Other', reason: 'Choose a category after checking the recipient.'};
  const previous = history.filter(e => key(e.recipient) === identity).reverse().sort((a,b) => b.date.localeCompare(a.date));
  if (previous.length) return {category: previous[0].category, reason: 'Suggested from your most recent expense for this recipient.'};
  const rules = [
    ['Food & drinks', /starbucks|café|cafe|coffee|restaurant|mcdonald|\bkfc\b|ร้านอาหาร|ร้านกาแฟ|คาเฟ่|ชานม|ก๋วยเตี๋ยว|หมูกระทะ|คอฟฟี่|สตาร์บัคส์/i],
    ['Shopping', /shopee|lazada|central|lotus|big\s*c|7\s*eleven|เซเว่น|โลตัส|บิ๊กซี|ช้อปปี้|ลาซาด้า/i],
    ['Transport', /grab\s*(?:taxi|car)|taxi|\bbts\b|\bmrt\b|ทางด่วน|แท็กซี่|รถไฟฟ้า|การรถไฟ/i],
    ['Bills & utilities', /การไฟฟ้า|การประปา|electricity|water authority|true\s*(?:online|move)|ais\b|dtac/i],
    ['Health', /hospital|clinic|pharmacy|โรงพยาบาล|คลินิก|ร้านยา/i],
    ['Entertainment', /netflix|spotify|cinema|โรงภาพยนตร์/i],
    ['Travel', /hotel|airways|airlines|airasia|โรงแรม|สายการบิน/i],
  ];
  const matches = rules.filter(([,pattern]) => pattern.test(recipient));
  if (matches.length === 1) return {category: matches[0][0], reason: 'Suggested from the recipient name. Change it if needed.'};
  return {category: 'Other', reason: 'This slip does not identify what you bought. Choose a category; future slips to the same recipient will reuse it.'};
}
