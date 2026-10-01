import assert from 'node:assert/strict';
import { sessionCookieOptions } from '../dist/src/auth/auth.controller.js';

let tests=0;
const eq=(a,b,m)=>{tests++;assert.equal(a,b,m)};
const ok=(v,m)=>{tests++;assert.ok(v,m)};

const originalSecure=process.env.COOKIE_SECURE;
const originalSameSite=process.env.COOKIE_SAME_SITE;
try{
  process.env.COOKIE_SECURE='true';
  delete process.env.COOKIE_SAME_SITE;
  let options=sessionCookieOptions(new Date('2026-10-01T18:00:00.000Z'));
  eq(options.secure,true,'secure production cookie');
  eq(options.sameSite,'none','cross-site production cookie');
  eq(options.httpOnly,true,'httpOnly retained');
  eq(options.path,'/','root path retained');
  ok(options.expires instanceof Date,'expiry retained');

  process.env.COOKIE_SECURE='false';
  delete process.env.COOKIE_SAME_SITE;
  options=sessionCookieOptions();
  eq(options.secure,false,'local secure off');
  eq(options.sameSite,'lax','local http fallback');

  process.env.COOKIE_SECURE='false';
  process.env.COOKIE_SAME_SITE='none';
  options=sessionCookieOptions();
  eq(options.sameSite,'lax','none without secure downgraded');

  process.env.COOKIE_SECURE='true';
  process.env.COOKIE_SAME_SITE='strict';
  options=sessionCookieOptions();
  eq(options.sameSite,'strict','valid explicit override');

  process.env.COOKIE_SECURE='true';
  process.env.COOKIE_SAME_SITE='invalid';
  options=sessionCookieOptions();
  eq(options.sameSite,'none','invalid override falls back safely');

  console.log(JSON.stringify({ok:true,tests,feature:'cross_site_session_cookie'}));
}finally{
  if(originalSecure===undefined) delete process.env.COOKIE_SECURE; else process.env.COOKIE_SECURE=originalSecure;
  if(originalSameSite===undefined) delete process.env.COOKIE_SAME_SITE; else process.env.COOKIE_SAME_SITE=originalSameSite;
}
