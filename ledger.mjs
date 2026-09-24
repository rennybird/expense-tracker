import {normalizeSlip,extractDate,extractRecipient} from './slip-fields.mjs';
export const CATEGORIES=['Other','Food & drinks','Shopping','Transport','Bills & utilities','Health','Entertainment','Travel','Transfers'];
export function validDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&+v.slice(0,4)>=1900&&+v.slice(0,4)<=2200;}
export function validateExpense(e){if(!e||typeof e.id!=='string'||!e.id||e.id.length>100||typeof e.recipient!=='string'||!e.recipient.trim()||e.recipient.length>160||!Number.isSafeInteger(e.cents)||e.cents<=0||e.cents>99999999999||!validDate(e.date)||!CATEGORIES.includes(e.category)||typeof e.note!=='string'||e.note.length>300)throw Error('Check the description, amount and date.');return {id:e.id,recipient:e.recipient.trim(),cents:e.cents,date:e.date,category:e.category,note:e.note,slipHash:typeof e.slipHash==='string'&&/^[a-f0-9]{64}$/.test(e.slipHash)?e.slipHash:''};}
export function parseSlip(raw){
 const text=normalizeSlip(raw),lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),candidates=[];
 lines.forEach((line,i)=>{if(/fee|ค่าธรรมเนียม|balance|ยอดคงเหลือ/i.test(line))return;const context=[lines[i-1]||'',line].join(' ');for(const match of line.matchAll(/(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d)/g)){const amount=Number(match[0].replaceAll(',',''));if(amount>0&&amount<=999999999.99)candidates.push({amount,score:/amount|จำนวนเงิน|ยอดโอน|ยอดชำระ/i.test(context)?3:/บาท|THB|฿/i.test(line)?2:1});}});
 if(!candidates.length)for(const line of lines){if(/fee|ค่าธรรมเนียม|balance|ยอดคงเหลือ/i.test(line))continue;const m=line.match(/(?:amount|จำนวนเงิน|ยอดโอน|฿)\s*[:：]?\s*([\d,]+)(?:\s*(?:THB|บาท))?\s*$/i)||line.match(/^([\d,]+)\s*(?:THB|บาท)$/i);if(m){const amount=Number(m[1].replaceAll(',',''));if(amount>0)candidates.push({amount,score:3});}}
 candidates.sort((a,b)=>b.score-a.score);let amount='';if(candidates.length){const best=candidates.filter(c=>c.score===candidates[0].score);if(new Set(best.map(c=>c.amount)).size===1)amount=best[0].amount.toFixed(2);}
 const date=extractDate(text),recipient=extractRecipient(text);return {amount,date,recipient};
}
export function csvExport(rows){const quote=v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';return '\uFEFF'+[['Date','Recipient','Category','Amount (THB)','Note'],...rows.map(e=>[e.date,e.recipient,e.category,(e.cents/100).toFixed(2),e.note])].map(r=>r.map(quote).join(',')).join('\r\n');}

