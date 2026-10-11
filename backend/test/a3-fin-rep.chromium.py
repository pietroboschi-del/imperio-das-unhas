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
UI=f"http://ui.imperio.localhost:{FRONT_PORT}"
API=f"http://api.imperio.localhost:{API_PORT}"
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
    page.route("**/*", lambda route:route.continue_() if urlsplit(route.request.url).hostname in ("ui.imperio.localhost","api.imperio.localhost") else route.abort())
    page.goto(UI+"/index.html",wait_until="domcontentloaded",timeout=30000)
    page.get_by_role("button",name="Área da equipe").click()
    page.locator("#loginUser").fill(os.environ["ADMIN_USERNAME"])
    page.locator("#loginPass").fill(os.environ["ADMIN_PASSWORD"])
    page.get_by_role("button",name="Entrar",exact=True).click()
    page.wait_for_function("sessionStorage.getItem('imperio-v99-central-authenticated')==='1'",timeout=15000)
    page.wait_for_function("!!window.__a3Finance",timeout=15000)
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
        browser=pw.chromium.launch(headless=True,args=["--no-proxy-server","--host-resolver-rules=MAP ui.imperio.localhost 127.0.0.1, MAP api.imperio.localhost 127.0.0.1"])
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
