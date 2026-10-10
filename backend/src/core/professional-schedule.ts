/** Single professional-shift rule used by public and administrative booking writes. */
function object(value:unknown):Record<string,any>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{}}
function minute(value:string){const m=String(value||'').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);if(!m)return Number.NaN;const h=Number(m[1]),n=Number(m[2]),s=Number(m[3]||0);return h<=23&&n<=59&&s<=59?h*60+n+s/60:Number.NaN}
export function insideProfessionalSchedule(proLegacy:unknown,unitId:string,localStart:string,durationMin:number):boolean{
 const dayText=localStart.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(dayText))return false;
 const date=new Date(dayText+'T12:00:00.000Z');if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==dayText)return false;
 const shift=object(object(object(proLegacy).schedule)[unitId+'-'+date.getUTCDay()]);
 const from=minute(String(shift.start||'')),to=minute(String(shift.end||'')),start=minute(localStart.slice(11));
 return shift.work===true&&Number.isFinite(from)&&Number.isFinite(to)&&Number.isFinite(start)&&Number.isFinite(durationMin)&&durationMin>0&&to>from&&start>=from&&start+durationMin<=to;
}
/** Interpret absolute ISO timestamps against the unit's own timezone. */
export function professionalLocalStart(startAt:Date,timeZone:string):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(startAt);
 const part=(type:string)=>parts.find(p=>p.type===type)?.value||'';
 return part('year')+'-'+part('month')+'-'+part('day')+'T'+part('hour')+':'+part('minute')+':'+part('second');
}
