// V98a — aritmética decimal mínima para migração. Não usa float em contas monetárias.
// O modo legacyRound replica a regra histórica Math.round((n + EPSILON) * 100) / 100:
// empate positivo arredonda para cima; empate negativo arredonda em direção a zero.
function expandExponent(text){
  const m=String(text).trim().match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if(!m)return String(text).trim();
  const sign=m[1]||'',whole=m[2],frac=m[3]||'',exp=Number(m[4]),digits=whole+frac,point=whole.length+exp;
  if(point<=0)return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if(point>=digits.length)return `${sign}${digits}${'0'.repeat(point-digits.length)}`;
  return `${sign}${digits.slice(0,point)}.${digits.slice(point)}`;
}
export function dec(value){
  let text=expandExponent(value==null||value===''?'0':String(value));
  const m=text.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);if(!m)throw new Error(`Decimal inválido: ${text}`);
  const scale=(m[3]||'').length,coeff=BigInt((m[1]==='-'?'-':'')+(m[2]||'0')+(m[3]||''));return {coeff,scale};
}
function pow10(n){return 10n**BigInt(n)}
function align(a,b){const s=Math.max(a.scale,b.scale);return [{coeff:a.coeff*pow10(s-a.scale),scale:s},{coeff:b.coeff*pow10(s-b.scale),scale:s}]}
export function add(a,b){a=typeof a==='object'&&a?.coeff!==undefined?a:dec(a);b=typeof b==='object'&&b?.coeff!==undefined?b:dec(b);const [x,y]=align(a,b);return {coeff:x.coeff+y.coeff,scale:x.scale}}
export function sub(a,b){b=typeof b==='object'&&b?.coeff!==undefined?b:dec(b);return add(a,{coeff:-b.coeff,scale:b.scale})}
export function mul(a,b){a=typeof a==='object'&&a?.coeff!==undefined?a:dec(a);b=typeof b==='object'&&b?.coeff!==undefined?b:dec(b);return {coeff:a.coeff*b.coeff,scale:a.scale+b.scale}}
export function cmp(a,b){const [x,y]=align(typeof a==='object'&&a?.coeff!==undefined?a:dec(a),typeof b==='object'&&b?.coeff!==undefined?b:dec(b));return x.coeff<y.coeff?-1:x.coeff>y.coeff?1:0}
export function legacyRound(value,scale=2){
  const a=typeof value==='object'&&value?.coeff!==undefined?value:dec(value);if(a.scale<=scale)return {coeff:a.coeff*pow10(scale-a.scale),scale};
  const factor=pow10(a.scale-scale),q=a.coeff/factor,r=a.coeff%factor,absR=r<0n?-r:r,twice=absR*2n;let out=q;
  if(a.coeff>=0n){if(twice>=factor)out=q+1n}else{if(twice>factor)out=q-1n}
  return {coeff:out,scale};
}
export function fixed(value,scale=2,round=true){const a=round?legacyRound(value,scale):(typeof value==='object'&&value?.coeff!==undefined?value:dec(value));let coeff=a.coeff,s=a.scale;if(s<scale){coeff*=pow10(scale-s);s=scale}if(s>scale)throw new Error('fixed sem round não pode reduzir escala');const neg=coeff<0n,abs=neg?-coeff:coeff,text=abs.toString().padStart(scale+1,'0');return `${neg?'-':''}${scale?text.slice(0,-scale)+'.'+text.slice(-scale):text}`}
export function money(value){return fixed(value,2,true)}
export function sum(values){return (values||[]).reduce((acc,v)=>add(acc,v),dec(0))}
export function sumMoney(values){return money(sum(values))}
export function maxDec(...values){return values.map(v=>typeof v==='object'&&v?.coeff!==undefined?v:dec(v)).reduce((a,b)=>cmp(a,b)>=0?a:b)}
export function minDec(...values){return values.map(v=>typeof v==='object'&&v?.coeff!==undefined?v:dec(v)).reduce((a,b)=>cmp(a,b)<=0?a:b)}
