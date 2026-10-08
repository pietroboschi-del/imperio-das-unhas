#!/usr/bin/env python3
"""Real Chromium smoke harness. Starts isolated CI backend and serves the actual root index.html.
It never injects session cookies, mocks API responses, or connects to live infrastructure.
"""
import json, os, subprocess, sys, time, urllib.request
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
BACKEND=ROOT/"backend"
FRONTEND_PORT=3101
UI_ORIGIN=f"http://ui.imperio.test:{FRONTEND_PORT}"
BACKEND_PORT=int(os.environ.get("PORT","3100"))
API_ORIGIN=f"http://api.imperio.test:{BACKEND_PORT}"
ALLOWED="imperio_ci"
def check_isolated():
    url=os.environ.get("DATABASE_URL","")
    if not any(term in url for term in ("localhost","127.0.0.1")) or ALLOWED not in url:
        raise RuntimeError("Refusing browser E2E outside isolated loopback imperio_ci database")
    if not (BACKEND/"dist/src/main.js").exists():
        raise RuntimeError("Compiled backend missing; run npm run build")

def wait_http(url,timeout=45):
    stop=time.monotonic()+timeout
    while time.monotonic()<stop:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status==200: return
        except Exception: time.sleep(.25)
    raise RuntimeError("Isolated local service did not become ready: "+url)

def main():
    check_isolated()
    env={**os.environ, "PORT":str(BACKEND_PORT), "OPERATIONAL_WRITES_ENABLED":"false",
         "WHATSAPP_AUTOMATION_ENABLED":"false","EVOLUTION_WEBHOOK_ENABLED":"false",
         "WHATSAPP_AGENT_API_ENABLED":"false","CORS_ORIGINS":UI_ORIGIN}
    processes=[]
    try:
        processes.append(subprocess.Popen([sys.executable,"-m","http.server",str(FRONTEND_PORT),"--bind","127.0.0.1"],
                                          cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE))
        processes.append(subprocess.Popen(["node","dist/src/main.js"],cwd=BACKEND,env=env,
                                          stdout=subprocess.DEVNULL,stderr=subprocess.PIPE))
        wait_http(f"http://127.0.0.1:{FRONTEND_PORT}/index.html")
        wait_http(f"http://127.0.0.1:{BACKEND_PORT}/api/v1/health")
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True,args=["--no-proxy-server","--host-resolver-rules=MAP ui.imperio.test 127.0.0.1, MAP api.imperio.test 127.0.0.1"])
            try:
                page=browser.new_page(viewport={"width":1280,"height":800})
                page.add_init_script(f"window.IMPERIO_API_BASE={json.dumps(API_ORIGIN)};")
                page.route("**/*",lambda route: route.continue_() if urlsplit(route.request.url).hostname in ("ui.imperio.test","api.imperio.test") else route.abort())
                page.goto(f"{UI_ORIGIN}/index.html",wait_until="domcontentloaded",timeout=30000)
                page.wait_for_timeout(1500)
                title=page.title()
                print(json.dumps({"scenario":"3A-real-browser-bootstrap","url":page.url,
                                  "title":title,"buttons":page.locator("button:visible").all_text_contents()[:35],
                                  "inputs":[{"id":e.get_attribute("id"),"type":e.get_attribute("type"),"placeholder":e.get_attribute("placeholder")} for e in page.locator("input:visible").all()[:20]],
                                  "body":page.locator("body").inner_text()[:1300]},ensure_ascii=False))
                assert page.locator("body").is_visible(),"Real frontend body did not render"
                assert page.url.startswith(UI_ORIGIN),"Browser failed to use production-mode local hostname"
                assert page.locator("button:visible").count()>0,"Frontend contains no working buttons"
                page.get_by_role("button",name="Área da equipe").click()
                page.wait_for_timeout(800)
                auth_snapshot={"scenario":"3B-auth-form-discovery","url":page.url,
                   "buttons":page.locator("button:visible").all_text_contents()[:40],
                   "inputs":[{"id":e.get_attribute("id"),"type":e.get_attribute("type"),"placeholder":e.get_attribute("placeholder")} for e in page.locator("input:visible").all()[:20]],
                   "body":page.locator("body").inner_text()[:1400]}
                print(json.dumps(auth_snapshot,ensure_ascii=False))
                assert any(i["type"]=="password" for i in auth_snapshot["inputs"]), "Team login did not render a visible password input"
                requests=[]
                page.on("request",lambda request: requests.append(request.url.split("?")[0]))
                routing=page.evaluate("""() => ({
                  officialProductionMode:typeof officialProductionMode==='function'?String(officialProductionMode).slice(0,1300):'not accessible',
                  officialProductionModeValue:typeof officialProductionMode==='function'?officialProductionMode():null,
                  centralEnabled:typeof centralEnabled==='function'?String(centralEnabled).slice(0,650):'not accessible',
                  host:location.hostname,
                  snippets:(()=>{const src=[...document.scripts].map(s=>s.textContent||"").join("\\n");return ["function officialProductionMode","function centralEnabled","PRODUCTION_API","loginUser","function login"].map(term=>{const i=src.indexOf(term);return {term,found:i>=0,excerpt:i>=0?src.slice(Math.max(0,i-80),i+560):""}})})()
                })""")
                print(json.dumps({"scenario":"3B-auth-routing-diagnostic","routing":routing},ensure_ascii=False))
                page.locator("#loginUser").fill(os.environ["ADMIN_USERNAME"])
                page.locator("#loginPass").fill(os.environ["ADMIN_PASSWORD"])
                page.get_by_role("button",name="Entrar",exact=True).click()
                page.wait_for_timeout(1800)
                after={"scenario":"3B-real-admin-authentication","url":page.url,
                       "loginVisible":page.locator("#loginPass").is_visible(),
                       "requests":requests[-15:],
                       "buttons":page.locator("button:visible").all_text_contents()[:35],
                       "body":page.locator("body").inner_text()[:1500]}
                print(json.dumps(after,ensure_ascii=False))
                assert not after["loginVisible"], "CI admin login did not leave authentication screen; potential central/legacy bridge failure"
                print(json.dumps({"ok":True,"scenario":"3A-real-browser-bootstrap"}))
            except Exception:
                page.screenshot(path="/tmp/imperio-e2e-bootstrap-failure.png",full_page=True)
                raise
            finally:
                browser.close()
    finally:
        for p in reversed(processes):
            p.terminate()
            try: p.wait(timeout=5)
            except subprocess.TimeoutExpired: p.kill()

if __name__=="__main__":
    main()
