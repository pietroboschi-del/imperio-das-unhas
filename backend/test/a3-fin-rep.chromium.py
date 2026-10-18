#!/usr/bin/env python3
"""A3-REA: real headless Chromium with two independent authenticated contexts, isolated CI PostgreSQL only."""
import json, os, subprocess, sys, time, urllib.request
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
BACKEND=ROOT/"backend"
FRONT_PORT=3281
API_PORT=3282
UI=f"http://127.0.0.1:{FRONT_PORT}"
API=f"http://127.0.0.1:{API_PORT}"
db=os.environ.get("DATABASE_URL","")
if not ("imperio_ci" in db and ("localhost" in db or "127.0.0.1" in db)):
    raise RuntimeError("Refusing A3 Chromium outside isolated imperio_ci")

def ready(url):
    for _ in range(100):
        try:
            with urllib.request.urlopen(url,timeout=1) as r:
                if r.status==200:return
        except Exception:time.sleep(.25)
    raise RuntimeError("Backend/UI synthetic timeout "+url)

def attach(context):
    page=context.new_page()
    page.add_init_script(f"window.IMPERIO_API_BASE={json.dumps(API)};")
    page.route("**/*", lambda route:route.continue_() if urlsplit(route.request.url).hostname in ("127.0.0.1",) else route.abort())
    page.goto(UI+"/index.html",wait_until="domcontentloaded",timeout=30000)
    # The local loopback host deliberately uses the legacy UI login path.
    # Authenticate through the real backend, verify /auth/me and establish
    # the same browser session keys that the verified central UI login sets.
    result=page.evaluate("""async ({api,username,password})=>{
      const login=await fetch(api+'/api/v1/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
      const data=await login.json();
      if(!login.ok||!data.user)throw new Error('Central login failed: '+login.status);
      const me=await fetch(api+'/api/v1/auth/me',{credentials:'include'});
      const verified=await me.json();
      if(!me.ok||verified?.user?.userId!==data.user.userId)throw new Error('Backend session verification failed');
      const health=await fetch(api+'/api/v1/health',{credentials:'include'}).then(r=>r.json());
      sessionStorage.setItem('imperio-v99-central-authenticated','1');
      sessionStorage.setItem('imperio-v99-central-principal',JSON.stringify(verified.user));
      sessionStorage.setItem('imperio-v96-shadow-csrf',data.csrfToken);
      sessionStorage.setItem('imperio-v99-central-write-units',JSON.stringify(health.operationalWriteUnits||[]));
      return {verified:true,writeUnits:health.operationalWriteUnits||[]};
    }""",{"api":API,"username":os.environ["ADMIN_USERNAME"],"password":os.environ["ADMIN_PASSWORD"]})
    assert result["verified"] and "centro" in result["writeUnits"],result
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function("!!window.__a3Finance&&window.__imperioCentralApi.status().enabled",timeout=15000)
    return page

JS_CALL="""async ({method,path,body,key})=>{
 const csrf=sessionStorage.getItem('imperio-v96-shadow-csrf');
 const headers={'Content-Type':'application/json','X-Unit-Id':'centro','X-CSRF-Token':csrf};
 if(key)headers['Idempotency-Key']=key;
 const r=await fetch(window.__imperioCentralApi.status().endpoint+'/api/v1'+path,{
  credentials:'include',cache:'no-store',method,headers,body:body?JSON.stringify(body):undefined
 });
 return {status:r.status,data:await r.json().catch(()=>null)};
}"""
def invoke(page,method,path,body=None,key=None):
    return page.evaluate(JS_CALL,{"method":method,"path":path,"body":body,"key":key})

env={**os.environ,"PORT":str(API_PORT),"OPERATIONAL_WRITES_ENABLED":"true","OPERATIONAL_WRITES_UNITS":"centro,big,shopping-contagem","CORS_ORIGINS":UI}
processes=[]
try:
    processes.append(subprocess.Popen([sys.executable,"-m","http.server",str(FRONT_PORT),"--bind","127.0.0.1"],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE))
    processes.append(subprocess.Popen(["node","dist/src/main.js"],cwd=BACKEND,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE))
    ready(f"http://127.0.0.1:{FRONT_PORT}/index.html")
    ready(f"http://127.0.0.1:{API_PORT}/api/v1/health")
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=["--no-proxy-server"])
        try:
            c1=browser.new_context(viewport={"width":1280,"height":800})
            c2=browser.new_context(viewport={"width":1280,"height":800})
            one=attach(c1);two=attach(c2)
            # Credentials are used only in isolated browser sessions, not displayed or persisted by this test.
            aid="a3_chromium_account"
            account={"id":aid,"name":"Conta sintética A3 Chromium","type":"BANK","unitId":"centro"}
            a=invoke(one,"POST","/finance/accounts",account)
            assert a["status"]==201, a
            payload={"direction":"income","amount":23.45,"status":"Efetivado","date":"2026-10-09","competenceDate":"2026-10-09","accountId":aid,"category":"Outros","description":"E2E Chromium A3"}
            w=invoke(one,"POST","/finance/entries",payload,"a3-chromium-idempotent")
            assert w["status"]==201,w
            eid=w["data"]["id"]
            again=invoke(one,"POST","/finance/entries",payload,"a3-chromium-idempotent")
            assert again["status"]==201 and again["data"]["id"]==eid,again
            other=invoke(two,"GET","/finance/entries?from=2026-10-09&to=2026-10-09")
            assert other["status"]==200 and sum(e["id"]==eid for e in other["data"])==1,other
            def frontend_read(page):
                return page.evaluate("""async (id)=>{
                  await window.__a3Finance.receipts('2026-10-09','2026-10-09',['centro']);
                  const groups=window.__a3Finance.centralClosedRows();
                  const found=await window.__a3Finance.paged('/api/v1/finance/entries?from=2026-10-09&to=2026-10-09','centro');
                  return {seen:found.filter(x=>x.id===id).length,duplicatedInClosure:groups.some(c=>c.movements.some(m=>m.id==='finance:'+id))};
                }""",eid)
            for pg in (one,two):
                result=frontend_read(pg)
                assert result=={"seen":1,"duplicatedInClosure":False},result
            summary=invoke(two,"GET","/finance/reports/receipt-summary?from=2026-10-09&to=2026-10-09")
            assert summary["status"]==200 and sum(x["id"]==eid for x in summary["data"]["receipts"])==1,summary
            print(json.dumps({"ok":True,"scenario":"A3 Chromium two independent sessions, PostgreSQL authority, idempotency, manual-income nonduplication","shaRecordId":eid}))
        finally:browser.close()
finally:
    for p in reversed(processes):
        p.terminate()
        try:p.wait(timeout=5)
        except subprocess.TimeoutExpired:p.kill()
