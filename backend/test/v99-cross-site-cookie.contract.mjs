import assert from 'node:assert/strict';
import { sessionCookieOptions } from '../src/auth/auth.controller.ts';

let tests=0;
const eq=(a,b,m)=>{tests++;assert.equal(a,b,m)};
const ok=(v,m)=>{tests++;assert.ok(v,m)};

const prevSecure=process.env.COOKIE_SECURE;
const prevSameSite=process.env.COOKIE_SAME_SITE;
try{
  process.env.COOKIE_SECURE='true';
  delete process.env.COOKIE_SAME_SITE;
  let o=sessionCookieOptions(new Date('2026-10-01T18:00:00.000Z'));
  eq(o.secure,true,'produção usa Secure');
  eq(o.sameSite,'none','produção cross-origin usa SameSite=None por padrão');
  eq(o.httpOnly,true,'cookie continua HttpOnly');
  eq(o.path,'/','cookie mantém path raiz');
  ok(o.expires instanceof Date,'expiração preservada');

  process.env.COOKIE_SECURE='false';
  delete process.env.COOKIE_SAME_SITE;
  o=sessionCookieOptions();
  eq(o.secure,false,'ambiente local pode desabilitar Secure');
  eq(o.sameSite,'lax','ambiente local HTTP usa Lax');

  process.env.COOKIE_SECURE='false';
  process.env.COOKIE_SAME_SITE='none';
  o=sessionCookieOptions();
  eq(o.sameSite,'lax','SameSite=None sem Secure é rebaixado para Lax');

  process.env.COOKIE_SECURE='true';
  process.env.COOKIE_SAME_SITE='strict';
  o=sessionCookieOptions();
  eq(o.sameSite,'strict','override explícito válido é respeitado');

  process.env.COOKIE_SECURE='true';
  process.env.COOKIE_SAME_SITE='invalido';
  o=sessionCookieOptions();
  eq(o.sameSite,'none','valor inválido usa default seguro de produção');

  console.log(JSON.stringify({ok:true,tests,feature:'cross_site_session_cookie'}));
}finally{
  if(prevSecure===undefined)delete process.env.COOKIE_SECURE;else process.env.COOKIE_SECURE=prevSecure;
  if(prevSameSite===undefined)delete process.env.COOKIE_SAME_SITE;else process.env.COOKIE_SAME_SITE=prevSameSite;
}
