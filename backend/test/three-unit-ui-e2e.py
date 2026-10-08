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
    env={**os.environ, "PORT":str(BACKEND_PORT), "OPERATIONAL_WRITES_ENABLED":"true",
         "OPERATIONAL_WRITES_UNITS":"centro,big,shopping-contagem",
         "MIGRATION_IMPORT_ENABLED":"false",
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
                  snippets:(()=>{const src=[...document.scripts].map(s=>s.textContent||"").join("\\n");return ["function officialProductionMode","function centralEnabled","PRODUCTION_API","loginUser","function login","Usuário central não está vinculado ao cadastro local migrado"].map(term=>{const i=src.indexOf(term);return {term,found:i>=0,excerpt:i>=0?src.slice(Math.max(0,i-700),i+1450):""}})})()
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
                picker=page.locator("#unitPicker")
                labels=picker.locator("option").all_text_contents()
                print(json.dumps({"scenario":"3B-unit-picker","options":labels,"selected":picker.input_value()},ensure_ascii=False))
                assert len(labels)==3, "Expected exactly three authorized canonical units in real admin picker"
                for local in ("u1","u2","u3"):
                    before_value=picker.input_value()
                    picker.select_option(value=local)
                    page.wait_for_timeout(500)
                    actual=picker.input_value()
                    state=page.evaluate("""() => {let principal=null;try{principal=JSON.parse(sessionStorage.getItem("imperio-v99-central-principal")||"null")}catch(e){}return {authenticated:sessionStorage.getItem("imperio-v99-central-authenticated"),networkAdmin:principal?.networkAdmin,writeUnits:sessionStorage.getItem("imperio-v99-central-write-units")}}""")
                    print(json.dumps({"scenario":"3B-unit-switch","before":before_value,"requested":local,"after":actual,"options":picker.locator("option").evaluate_all("(els)=>els.map(e=>({value:e.value,text:e.textContent}))"),"session":state},ensure_ascii=False))
                    assert actual==local,"Unit switch did not persist in selector"
                picker.select_option(value="u3")
                page.get_by_role("button",name="Profissionais",exact=True).click()
                page.wait_for_timeout(900)
                assert page.get_by_role("button",name="+ Nova profissional").is_visible(),"Professionals configuration is not navigable"
                page.get_by_role("button",name="+ Nova profissional").click()
                page.wait_for_timeout(600)
                print(json.dumps({"scenario":"3B-professional-form","buttons":page.locator("#modalHost button:visible").all_text_contents()[:25],
                    "inputs":[{"id":e.get_attribute("id"),"type":e.get_attribute("type")} for e in page.locator("#modalHost input:visible").all()[:45]],
                    "body":page.locator("#modalHost").inner_text()[:1400]},ensure_ascii=False))
                assert page.locator("#pfName").is_visible(),"Professional modal did not expose editable name field"
                page.get_by_role("button",name="Cancelar").click()
                page.wait_for_timeout(250)

                suffix=str(int(time.time()*1000))
                category_name="Categoria E2E UI "+suffix
                service_name="Serviço E2E UI "+suffix
                pro_name="Profissional E2E UI "+suffix
                pro_edited=pro_name+" Editada"
                station_name="Estação E2E UI "+suffix
                day_key="1"

                page.get_by_role("button",name="Serviços",exact=True).click()
                page.wait_for_timeout(900)
                assert page.get_by_role("button",name="+ Novo serviço").is_visible(),"Services configuration is not navigable"
                page.get_by_role("button",name="Categorias",exact=True).click()
                page.wait_for_timeout(1200)
                page.get_by_role("button",name="+ Nova categoria").click()
                page.wait_for_timeout(350)
                page.locator("#v89CatName").fill(category_name)
                page.locator("#v89CatArea").select_option(value="hands")
                page.locator("#v89CatLead").select_option(value="0")
                page.get_by_role("button",name="Salvar").click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=category_name,timeout=15000)
                print(json.dumps({"scenario":"3B-category-created","name":category_name},ensure_ascii=False))

                page.get_by_role("button",name="Serviços",exact=True).click()
                page.wait_for_timeout(900)
                page.get_by_role("button",name="+ Novo serviço").click()
                page.wait_for_timeout(500)
                page.locator("#sfName").fill(service_name)
                page.locator("#sfCat").select_option(label=category_name)
                page.locator("#sfPrice").fill("79.90")
                page.locator("#sfDur").fill("45")
                page.get_by_role("button",name="Site").click()
                page.locator("#sfPublicName").fill(service_name+" Online")
                if not page.locator("#sfShow").is_checked(): page.locator("#sfShow").check()
                if not page.locator("#sfOnline").is_checked(): page.locator("#sfOnline").check()
                page.get_by_role("button",name="Salvar serviço").click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=service_name,timeout=15000)
                print(json.dumps({"scenario":"3B-service-created","name":service_name,"category":category_name},ensure_ascii=False))

                page.get_by_role("button",name="Profissionais",exact=True).click()
                page.wait_for_timeout(900)
                page.get_by_role("button",name="+ Nova profissional").click()
                page.wait_for_timeout(800)
                page.locator("#pfName").fill(pro_name)
                page.locator("#pfPublicName").fill("Pro E2E")
                page.locator("#pfSpec").fill("Nail designer E2E")
                for local in ("u1","u2","u3"):
                    box=page.locator(f".pfUnit[value='{local}']")
                    assert box.count()==1, f"Professional unit checkbox missing for {local}"
                    if not box.is_checked(): box.check()
                page.get_by_role("button",name="Horários").click()
                for local,start,end in (("u1","09:00","18:00"),("u2","10:00","19:00"),("u3","08:30","17:30")):
                    row=page.locator(f".schedule-row[data-unit='{local}'][data-day='{day_key}']")
                    row.locator(".pfs-work").check()
                    row.locator(".pfs-start").fill(start)
                    row.locator(".pfs-end").fill(end)
                page.locator("#modalHost").get_by_role("button",name="Serviços").click()
                service_row=page.locator(".pro-service-row",has_text=service_name)
                assert service_row.count()==1,"Created service is not available for professional eligibility"
                service_row.locator(".pfr-enabled").check()
                service_row.locator(".pfr-duration").fill("40")
                service_row.locator(".pfr-commission").fill("50")
                service_row.locator(".pfr-price").fill("85")
                page.get_by_role("button",name="Salvar profissional").click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=pro_name,timeout=15000)
                print(json.dumps({"scenario":"3B-professional-created","name":pro_name,"units":["u1","u2","u3"],"service":service_name},ensure_ascii=False))

                page.locator("tr",has_text=pro_name).get_by_role("button",name="Editar").click()
                page.wait_for_timeout(700)
                page.locator("#pfSpec").fill("Nail designer E2E editada")
                page.locator("#pfPublicName").fill("Pro E2E Editada")
                page.locator("#pfName").fill(pro_edited)
                page.get_by_role("button",name="Salvar alterações").click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=pro_edited,timeout=15000)
                page.reload(wait_until="domcontentloaded",timeout=30000)
                page.wait_for_timeout(1500)
                if page.get_by_role("button",name="Área da equipe").is_visible():
                    page.get_by_role("button",name="Área da equipe").click()
                    page.wait_for_timeout(800)
                if page.locator("#loginPass").is_visible():
                    page.locator("#loginUser").fill(os.environ["ADMIN_USERNAME"])
                    page.locator("#loginPass").fill(os.environ["ADMIN_PASSWORD"])
                    page.get_by_role("button",name="Entrar",exact=True).click()
                    page.wait_for_timeout(1800)
                page.get_by_role("button",name="Profissionais",exact=True).click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=pro_edited,timeout=15000)
                page.locator("tr",has_text=pro_edited).get_by_role("button",name="Editar").click()
                page.wait_for_timeout(700)
                persisted=page.evaluate("""(serviceName) => ({
                  checked:[...document.querySelectorAll('.pfUnit:checked')].map(x=>x.value).sort(),
                  monday:[...document.querySelectorAll('.schedule-row[data-day="1"]')].map(r=>({unit:r.dataset.unit,work:r.querySelector('.pfs-work')?.checked,start:r.querySelector('.pfs-start')?.value,end:r.querySelector('.pfs-end')?.value})).filter(x=>x.work),
                  serviceEnabled:[...document.querySelectorAll('.pro-service-row')].filter(r=>r.innerText.includes(serviceName)).map(r=>({duration:r.querySelector('.pfr-duration')?.value,commission:r.querySelector('.pfr-commission')?.value,price:r.querySelector('.pfr-price')?.value,enabled:r.querySelector('.pfr-enabled')?.checked}))
                })""",service_name)
                assert persisted["checked"]==["u1","u2","u3"],"Professional multi-unit links did not persist after reload"
                assert len(persisted["monday"])==3,"Professional schedule did not persist across all three units"
                assert persisted["serviceEnabled"] and persisted["serviceEnabled"][0]["enabled"],"Professional service eligibility did not persist"
                page.get_by_role("button",name="Cancelar").click()

                page.get_by_role("button",name="Serviços",exact=True).click()
                page.wait_for_timeout(900)
                page.get_by_role("button",name="Estações",exact=True).click()
                page.wait_for_timeout(1200)
                page.get_by_role("button",name="+ Nova estação").click()
                page.wait_for_timeout(500)
                page.locator("#v77WsName").fill(station_name)
                page.locator("#v77WsUnit").select_option(value="u3")
                ws_cat=page.get_by_label(category_name)
                if ws_cat.count()==0:
                    ws_cat=page.locator(".v77-ws-category").first()
                if not ws_cat.is_checked(): ws_cat.check()
                page.get_by_role("button",name="Salvar").click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=station_name,timeout=15000)
                page.reload(wait_until="domcontentloaded",timeout=30000)
                page.wait_for_timeout(1500)
                if page.get_by_role("button",name="Área da equipe").is_visible():
                    page.get_by_role("button",name="Área da equipe").click()
                    page.wait_for_timeout(800)
                if page.locator("#loginPass").is_visible():
                    page.locator("#loginUser").fill(os.environ["ADMIN_USERNAME"])
                    page.locator("#loginPass").fill(os.environ["ADMIN_PASSWORD"])
                    page.get_by_role("button",name="Entrar",exact=True).click()
                    page.wait_for_timeout(1800)
                page.get_by_role("button",name="Serviços",exact=True).click()
                page.wait_for_timeout(800)
                page.get_by_role("button",name="Estações",exact=True).click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=station_name,timeout=15000)
                inventory=page.evaluate("""() => ({
                  categories:(db.categories||[]).filter(x=>String(x.name||'').includes('Categoria E2E UI')).map(x=>({id:x.id,name:x.name,active:x.active})),
                  services:(db.services||[]).filter(x=>String(x.name||'').includes('Serviço E2E UI')).map(x=>({id:x.id,name:x.name,category:x.category,price:x.price,duration:x.duration,active:x.active,show:x.show,online:x.online})),
                  professionals:(db.pros||[]).filter(x=>String(x.name||'').includes('Profissional E2E UI')).map(x=>({id:x.id,name:x.name,units:x.units,services:x.services,schedule:x.schedule,active:x.active,show:x.show,online:x.online})),
                  workstations:(db.workstations||[]).filter(x=>String(x.name||'').includes('Estação E2E UI')).map(x=>({id:x.id,name:x.name,unitId:x.unitId,allowedCategoryIds:x.allowedCategoryIds,active:x.active}))
                })""")
                print(json.dumps({"scenario":"3B-admin-config-persisted","inventory":inventory},ensure_ascii=False))
                assert len(inventory["professionals"])>=1 and len(inventory["services"])>=1 and len(inventory["workstations"])>=1, "Admin config records were not visible after reload"
                assert any(x["online"] and x["show"] and x["active"] for x in inventory["services"]), "Created service is not active and published online"
                assert any(x["name"]==pro_edited for x in inventory["professionals"]), "Created professional was not visible after final reload"
                assert any(x["unitId"]=="u3" and x["active"] for x in inventory["workstations"]), "Created workstation did not persist for Centro"

                print(json.dumps({"ok":True,"scenario":"3B-admin-configuration-browser-closure"}))
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
