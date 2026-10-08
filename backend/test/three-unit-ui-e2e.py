#!/usr/bin/env python3
"""Real Chromium smoke harness. Starts isolated CI backend and serves the actual root index.html.
It never injects session cookies, mocks API responses, or connects to live infrastructure.
"""
import json, os, subprocess, sys, time, urllib.request
from pathlib import Path
from datetime import date,timedelta
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
BACKEND=ROOT/"backend"
FRONTEND_PORT=3101
UI_ORIGIN=f"http://ui.imperio.localhost:{FRONTEND_PORT}"
BACKEND_PORT=int(os.environ.get("PORT","3100"))
API_ORIGIN=f"http://api.imperio.localhost:{BACKEND_PORT}"
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
            browser=pw.chromium.launch(headless=True,args=["--no-proxy-server","--host-resolver-rules=MAP ui.imperio.localhost 127.0.0.1, MAP api.imperio.localhost 127.0.0.1"])
            try:
                page=browser.new_page(viewport={"width":1280,"height":800})
                page.add_init_script(f"window.IMPERIO_API_BASE={json.dumps(API_ORIGIN)};")
                page.route("**/*",lambda route: route.continue_() if urlsplit(route.request.url).hostname in ("ui.imperio.localhost","api.imperio.localhost") else route.abort())
                page.goto(f"{UI_ORIGIN}/index.html",wait_until="domcontentloaded",timeout=30000)
                page.wait_for_timeout(1500)
                title=page.title()
                print(json.dumps({"scenario":"3A-real-browser-bootstrap","url":page.url,
                                  "title":title,"buttons":page.locator("button:visible").all_text_contents()[:35],
                                  "inputs":[{"id":e.get_attribute("id"),"type":e.get_attribute("type"),"placeholder":e.get_attribute("placeholder")} for e in page.locator("input:visible").all()[:20]],
                                  "body":page.locator("body").inner_text()[:1300]},ensure_ascii=False))
                assert page.locator("body").is_visible(),"Real frontend body did not render"
                assert page.url.startswith(UI_ORIGIN),"Browser failed to use production-mode local hostname"
                secure_boot=page.evaluate("() => ({secure:window.isSecureContext,subtle:!!window.crypto?.subtle})")
                print(json.dumps({"scenario":"3A-localhost-secure-browser-context","security":secure_boot},ensure_ascii=False))
                assert secure_boot["secure"] and secure_boot["subtle"],"Chromium .localhost E2E origin must provide WebCrypto"
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
                # 3C: use the visible client form and centrally backed client list; no API/SQL fixture.
                client_name="Cliente E2E Rede "+suffix
                client_phone="319"+suffix[-8:]
                page.locator("#unitPicker").select_option(value="u1")
                page.get_by_role("button",name="Clientes",exact=True).click()
                page.wait_for_timeout(800)
                # Empty commercial database has no acquisition sources. Configure one through the UI.
                page.get_by_role("button",name="Como conheceu?").click()
                page.locator("#v71NewOption").fill("Origem E2E "+suffix)
                page.get_by_role("button",name="Adicionar",exact=True).click()
                page.get_by_role("button",name="Fechar",exact=True).click()
                page.get_by_role("button",name="Clientes",exact=True).click()
                page.wait_for_timeout(650)
                page.get_by_role("button",name="+ Nova cliente").click()
                page.locator("#cfName").fill(client_name)
                page.locator("#cfPhone").fill(client_phone)
                sources=page.locator("#cfSource option").evaluate_all("(els)=>els.map(e=>({value:e.value,text:e.textContent}))")
                selectable=[x for x in sources if x["value"]]
                assert selectable, "Client registration source is unavailable in visible UI"
                page.locator("#cfSource").select_option(value=selectable[0]["value"])
                page.get_by_role("button",name="Salvar cliente").click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=client_name,timeout=15000)
                page.locator("#clientSearch").fill(client_name)
                assert page.locator("#clientRows tr",has_text=client_name).count()==1,"Client registration did not yield exactly one visible global client"
                identity=page.evaluate("""(name)=>db.clients.filter(c=>c.name===name).map(c=>({id:c.id,registrationUnit:c.registrationUnit,central:c.central}))""",client_name)
                assert len(identity)==1 and identity[0]["central"],"Client was not persisted as a central global Client"
                for unit in ("u3","u2","u1"):
                    page.locator("#unitPicker").select_option(value=unit)
                    page.wait_for_timeout(600)
                    page.locator("#clientSearch").fill(client_name)
                    assert page.locator("#clientRows tr",has_text=client_name).count()==1,f"Global client not visible in {unit}"
                    current=page.evaluate("""(name)=>db.clients.filter(c=>c.name===name).map(c=>c.id)""",client_name)
                    assert current==[identity[0]["id"]],f"Client identity changed or duplicated in {unit}"
                print(json.dumps({"ok":True,"scenario":"3C-client-global-cross-unit-visible","name":client_name,"identity":identity[0],"units":["big","centro","shopping-contagem"]},ensure_ascii=False))
                page.locator("#unitPicker").select_option(value="u3")
                page.get_by_role("button",name="Agenda",exact=True).click()
                page.wait_for_timeout(800)
                page.get_by_role("button",name="+ Novo agendamento").click()
                page.wait_for_timeout(450)
                print(json.dumps({"scenario":"3C-booking-form-browser-discovery",
                    "modal":page.locator("#modalHost").inner_text()[:2400],
                    "inputs":[{"id":el.get_attribute("id"),"type":el.get_attribute("type"),"placeholder":el.get_attribute("placeholder")} for el in page.locator("#modalHost input:visible").all()[:35]],
                    "selects":[{"id":el.get_attribute("id"),"options":el.locator("option").all_text_contents()[:8]} for el in page.locator("#modalHost select:visible").all()[:18]],
                    "buttons":page.locator("#modalHost button:visible").all_text_contents()[:35]},ensure_ascii=False))
                page.locator("#rClientSearch").fill(client_name)
                page.wait_for_timeout(250)
                assert page.locator("#rClientResults").get_by_text(client_name).is_visible(),"Global client absent in cross-unit booking search"
                page.locator("#rClientResults").get_by_role("button",name="Selecionar").click()
                assert client_name in page.locator("#modalHost").inner_text(),"Selected existing global client not retained"
                choices=page.locator(".res-line .res-pro option").evaluate_all("(els)=>els.map(e=>({value:e.value,name:e.textContent}))")
                config=page.evaluate("""(serviceName)=>({
                  pros:db.pros.map(p=>({id:p.id,name:p.name,units:p.units,services:p.services,active:p.active,online:p.online})),
                  services:db.services.filter(s=>s.name===serviceName).map(s=>({id:s.id,name:s.name,proRules:s.proRules}))
                })""",service_name)
                print(json.dumps({"scenario":"3C-cross-unit-booking-professional-choices","choices":choices,"config":config},ensure_ascii=False))
                assert choices,"No eligible professional shown in Centro booking form despite 3B configured professional"
                monday=date.today()+timedelta(days=(7-date.today().weekday())%7 or 7)
                booking_ids=[]
                for index,unit in enumerate(("u3","u1","u2")):
                    if index:
                        page.locator("#unitPicker").select_option(value=unit)
                        page.get_by_role("button",name="Agenda",exact=True).click()
                        page.wait_for_timeout(800)
                        page.get_by_role("button",name="+ Novo agendamento").click()
                        page.locator("#rClientSearch").fill(client_name)
                        page.locator("#rClientResults").get_by_role("button",name="Selecionar").click()
                    booked_date=(monday+timedelta(days=7*index)).isoformat()
                    # Select the actual newly configured service/professional; default seed
                    # selections may have no Monday schedule in a freshly isolated CI DB.
                    row=page.locator(".res-line").first
                    row.locator(".res-service").select_option(label=service_name)
                    row.locator(".res-pro").select_option(label=pro_edited)
                    expected_pro=row.locator(".res-pro").input_value()
                    assert expected_pro, f"Configured E2E professional missing at {unit}"
                    page.locator("#rDate").fill(booked_date)
                    row.locator(".res-time").fill("11:00")
                    page.locator("#modalHost").get_by_role("button",name="Salvar",exact=True).click()
                    page.wait_for_timeout(1450)
                    booked=page.evaluate("""(args)=>db.bookings.filter(b=>b.clientId===args.client&&b.unit===args.unit&&b.date===args.date).map(b=>({id:b.id,items:b.items.map(i=>({pro:i.pro,serviceId:i.serviceId})),status:b.status}))""",
                        {"client":identity[0]["id"],"unit":unit,"date":booked_date})
                    print(json.dumps({"scenario":"3C-booking-saved-by-browser","unit":unit,"date":booked_date,"bookings":booked,"visibleToast":page.locator("body").inner_text()[:230]},ensure_ascii=False))
                    assert len(booked)==1 and len(booked[0]["items"])==1, f"Real booking not persisted for {unit}"
                    assert booked[0]["items"][0]["pro"]==expected_pro, f"Configured professional mismatch in {unit}"
                    booking_ids.append(booked[0]["id"])
                assert len(set(booking_ids))==3,"Cross-unit bookings were not distinct"
                print(json.dumps({"ok":True,"scenario":"3C-three-unit-cross-booking-persisted","bookings":booking_ids,"clientId":identity[0]["id"]},ensure_ascii=False))
                page.get_by_role("button",name="Clientes",exact=True).click()
                page.wait_for_timeout(650)
                page.locator("#clientSearch").fill(client_name)
                assert page.locator("#clientRows tr",has_text=client_name).count()==1
                page.locator("#clientRows tr",has_text=client_name).get_by_role("button",name="Abrir").click()
                page.locator('[data-client-tab="historico"]').click()
                page.wait_for_function("() => document.querySelector('#clientTabContent')?.innerText.includes('Atendimentos das três unidades')",timeout=15000)
                history=page.locator("#clientTabContent").inner_text()
                print(json.dumps({"scenario":"3C-global-history-rendered-diagnostic","history":history[:3400]},ensure_ascii=False))
                assert "Histórico central indisponível" not in history, "Central global client history API failed"
                for unit_name in ("Centro de Contagem","Big Shopping","Shopping Contagem"):
                    assert unit_name in history, f"Missing {unit_name} in visible global history"
                assert service_name in history and "Pro E2E Editada" in history and "Agendado" in history,"History lacks service professional or status"
                assert page.locator("#clientTabContent table tbody tr").count()>=3,"Global history omitted one of three bookings"
                print(json.dumps({"ok":True,"scenario":"3C-global-history-real-browser","rows":page.locator("#clientTabContent table tbody tr").all_text_contents()[:6]},ensure_ascii=False))
                # Create the second service/professional via the existing UI, then one booking with two BookingItems.
                page.locator("#modalHost button.x").click()
                second_service="Serviço B E2E UI "+suffix
                second_pro="Profissional B E2E UI "+suffix
                second_public="Pro B E2E "+suffix
                page.get_by_role("button",name="Serviços",exact=True).click()
                page.wait_for_timeout(850)
                page.get_by_role("button",name="+ Novo serviço").click()
                page.locator("#sfName").fill(second_service)
                page.locator("#sfCat").select_option(label=category_name)
                page.locator("#sfPrice").fill("65")
                page.locator("#sfDur").fill("35")
                page.get_by_role("button",name="Site").click()
                page.locator("#sfPublicName").fill(second_service)
                page.get_by_role("button",name="Salvar serviço").click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=second_service,timeout=15000)
                page.get_by_role("button",name="Profissionais",exact=True).click()
                page.wait_for_timeout(900)
                page.get_by_role("button",name="+ Nova profissional").click()
                page.locator("#pfName").fill(second_pro)
                page.locator("#pfPublicName").fill(second_public)
                page.locator("#pfSpec").fill("Nail E2E B")
                page.locator(".pfUnit[value='u3']").check()
                page.get_by_role("button",name="Horários").click()
                monday_row=page.locator(".schedule-row[data-unit='u3'][data-day='1']")
                monday_row.locator(".pfs-work").check()
                monday_row.locator(".pfs-start").fill("09:00")
                monday_row.locator(".pfs-end").fill("18:00")
                page.locator("#modalHost").get_by_role("button",name="Serviços").click()
                second_row=page.locator(".pro-service-row",has_text=second_service)
                assert second_row.count()==1,"Second service missing from second professional configuration"
                second_row.locator(".pfr-enabled").check()
                page.get_by_role("button",name="Salvar profissional").click()
                page.wait_for_function("(name)=>document.body.innerText.includes(name)",arg=second_pro,timeout=15000)

                page.locator("#unitPicker").select_option(value="u3")
                page.get_by_role("button",name="Agenda",exact=True).click()
                page.wait_for_timeout(900)
                page.get_by_role("button",name="+ Novo agendamento").click()
                page.locator("#rClientSearch").fill(client_name)
                page.locator("#rClientResults").get_by_role("button",name="Selecionar").click()
                page.get_by_role("button",name="+ Adicionar serviço").click()
                assert page.locator(".res-line").count()==2,"Multi-service booking form did not add second BookingItem"
                page.locator(".res-line").nth(0).locator(".res-service").select_option(label=service_name)
                page.locator(".res-line").nth(1).locator(".res-service").select_option(label=second_service)
                options_one=page.locator(".res-line").nth(0).locator(".res-pro option").all_text_contents()
                options_two=page.locator(".res-line").nth(1).locator(".res-pro option").all_text_contents()
                print(json.dumps({"scenario":"3C-two-professionals-choices","A":options_one,"B":options_two},ensure_ascii=False))
                assert pro_edited in options_one and second_pro in options_two,"Expected different eligible professionals for each service"
                page.locator(".res-line").nth(0).locator(".res-pro").select_option(label=pro_edited)
                page.locator(".res-line").nth(1).locator(".res-pro").select_option(label=second_pro)
                page.locator(".res-line").nth(0).locator(".res-time").fill("11:00")
                page.locator(".res-line").nth(1).locator(".res-time").fill("12:00")
                two_date=(monday+timedelta(days=21)).isoformat()
                page.locator("#rDate").fill(two_date)
                page.locator("#modalHost").get_by_role("button",name="Salvar",exact=True).click()
                page.wait_for_timeout(1350)
                multi=page.evaluate("""(args)=>db.bookings.filter(b=>b.clientId===args.client&&b.unit==='u3'&&b.date===args.day).map(b=>({id:b.id,items:b.items.map(i=>({serviceId:i.serviceId,pro:i.pro}))}))""",{"client":identity[0]["id"],"day":two_date})
                print(json.dumps({"scenario":"3C-multi-service-booking-saved","rows":multi},ensure_ascii=False))
                assert len(multi)==1 and len(multi[0]["items"])==2,"Multi-service booking not saved with two items"
                assert multi[0]["items"][0]["pro"]!=multi[0]["items"][1]["pro"],"BookingItems incorrectly share one professional"

                page.get_by_role("button",name="Clientes",exact=True).click()
                page.wait_for_timeout(700)
                page.locator("#clientSearch").fill(client_name)
                page.locator("#clientRows tr",has_text=client_name).get_by_role("button",name="Abrir").click()
                page.locator('[data-client-tab="historico"]').click()
                page.wait_for_function("(name)=>document.querySelector('#clientTabContent')?.innerText.includes(name)",arg=second_service,timeout=15000)
                visible=page.locator("#clientTabContent table tbody tr").all_text_contents()
                assert any(second_service in row and second_public in row for row in visible),"Service B mapped to wrong professional in visual global history"
                assert any(service_name in row and "Pro E2E Editada" in row for row in visible),"Service A mapped to wrong professional in visual global history"
                assert len(visible)>=5,"Global history has fewer than five service rows"
                print(json.dumps({"ok":True,"scenario":"3C-two-professionals-global-history","rows":visible[:8]},ensure_ascii=False))


                # 3D — genuine public booking from public unit cards, with no SQL/API fixture.
                # Retain the synthetic catalogue/professional built by 3B, but start from
                # the actual public landing page as an unaided browser visitor.
                page.goto(f"{UI_ORIGIN}/index.html",wait_until="domcontentloaded",timeout=30000)
                page.wait_for_function("() => document.querySelectorAll('#publicUnits .v99-public-unit-card').length === 3",timeout=20000)
                cards=page.locator("#publicUnits .v99-public-unit-card")
                visible_units=cards.evaluate_all("(els)=>els.map(x=>({unit:x.dataset.unit,booking:!!x.querySelector('.v99-public-unit-booking')}))")
                print(json.dumps({"scenario":"3D-public-units-visible","cards":visible_units},ensure_ascii=False))
                assert set(x["unit"] for x in visible_units)=={"centro","big","shopping-contagem"},"Public page omitted a canonical unit"
                assert all(x["booking"] for x in visible_units),"A public unit has booking disabled despite configured online service/professional"

                # Empty availability must be displayed, without inventing times. The
                # synthetic E2E professional works Mondays only, never on Tuesday.
                page.locator("#publicUnits .v99-public-unit-card[data-unit='centro'] .v99-public-unit-booking").click()
                page.locator("#bkPublicServices .v56-public-service",has_text=service_name).locator("input").check()
                page.locator("#bk2").get_by_role("button",name="Continuar").click()
                page.locator("#bkPublicDate").fill((monday+timedelta(days=1)).isoformat())
                page.wait_for_function("() => !!document.querySelector('#bkPublicSlots') && !document.querySelector('#bkPublicSlots').innerText.includes('Consultando disponibilidade') && !document.querySelector('#bkPublicSlots').innerText.includes('Procurando opções')",timeout=25000)
                empty_text=page.locator("#bkPublicSlots").inner_text()
                print(json.dumps({"scenario":"3D-public-empty-state","text":empty_text[:600]},ensure_ascii=False))
                assert page.locator("#bkPublicSlots .slot-btn").count()==0,"Tuesday unexpectedly presents selectable slots for Monday-only E2E professional"
                assert any(x in empty_text for x in ("Não encontramos horário","Nenhum horário","Não há escala","Nenhuma alternativa","Não há profissional")),"Public empty state lacks an understandable explanation"
                page.locator("#modalHost").get_by_role("button",name="Cancelar").click()

                public_records=[]
                for index,unit in enumerate(("centro","big","shopping-contagem")):
                    booking_day=(monday+timedelta(days=28+7*index)).isoformat()
                    public_client="Cliente Público E2E "+unit+" "+suffix
                    public_phone="319"+suffix[-7:]+str(index)
                    page.locator(f"#publicUnits .v99-public-unit-card[data-unit='{unit}'] .v99-public-unit-booking").click()
                    page.wait_for_function("() => document.querySelector('#bk2.booking-step.active') !== null",timeout=15000)
                    service_option=page.locator("#bkPublicServices .v56-public-service",has_text=service_name)
                    assert service_option.count()==1, f"Configured service missing in public {unit} catalog"
                    service_option.locator("input").check()
                    page.locator("#bk2").get_by_role("button",name="Continuar").click()
                    page.locator("#bkPublicDate").fill(booking_day)
                    page.wait_for_function("() => document.querySelector('#bkPublicPro')?.options.length > 1",timeout=15000)
                    page.locator("#bkPublicPro").select_option(label="Pro E2E Editada")
                    page.wait_for_function("() => document.querySelectorAll('#bkPublicSlots .slot-btn').length > 0",timeout=25000)
                    slots=page.locator("#bkPublicSlots .slot-btn")
                    first_slot=slots.first.inner_text()
                    print(json.dumps({"scenario":"3D-public-availability","unit":unit,"date":booking_day,"professional":"Pro E2E Editada","slot":first_slot[:250]},ensure_ascii=False))
                    assert service_name in first_slot,"Public slot does not display selected service"
                    assert "Pro E2E Editada" in first_slot,"Public slot does not display selected professional"
                    slots.first.click()
                    assert page.locator("#bk4.booking-step.active").is_visible(),"Public slot did not advance to visitor details"
                    page.locator("#bkName").fill(public_client)
                    page.locator("#bkPhone").fill(public_phone)
                    page.locator("#bkBirth").fill("1996-05-15")
                    page.locator("#bkContinue").click()
                    assert page.locator("#bk5.booking-step.active").is_visible(),"Public identification failed to reach final step"
                    source=page.locator("#bkSource")
                    if source.count():
                        opts=source.locator("option").evaluate_all("(els)=>els.map(e=>e.value).filter(Boolean)")
                        assert opts, f"Public new-client source options missing at {unit}"
                        source.select_option(value=opts[0])
                    confirmation=page.locator("#bkFinalContent").inner_text()
                    assert service_name in confirmation and "Pro E2E Editada" in confirmation,"Public confirmation lost service/professional assignment"
                    page.locator("#bkFinish").click()
                    page.wait_for_function("() => !document.querySelector('#bk5.booking-step.active')",timeout=20000)
                    page.wait_for_timeout(500)
                    public_records.append({"unit":unit,"date":booking_day,"client":public_client,"phone":public_phone})
                    print(json.dumps({"scenario":"3D-public-booking-submitted","record":public_records[-1],"toast":page.locator("body").inner_text()[:200]},ensure_ascii=False))

                # Read the resulting bookings back from the authenticated real admin UI
                # after navigating from the public page. No direct backend or SQL reads.
                page.get_by_role("button",name="Área da equipe").click()
                page.wait_for_timeout(700)
                if page.locator("#loginPass").is_visible():
                    page.locator("#loginUser").fill(os.environ["ADMIN_USERNAME"])
                    page.locator("#loginPass").fill(os.environ["ADMIN_PASSWORD"])
                    page.get_by_role("button",name="Entrar",exact=True).click()
                    page.wait_for_timeout(1500)
                page.get_by_role("button",name="Clientes",exact=True).click()
                page.wait_for_timeout(700)
                for record in public_records:
                    page.locator("#clientSearch").fill(record["client"])
                    page.wait_for_function("(name) => [...document.querySelectorAll('#clientRows tr')].some(x=>x.innerText.includes(name))",arg=record["client"],timeout=15000)
                    found=page.locator("#clientRows tr",has_text=record["client"])
                    assert found.count()==1,f"Public {record['unit']} client not centrally persisted"
                    found.get_by_role("button",name="Abrir").click()
                    page.locator('[data-client-tab="historico"]').click()
                    page.wait_for_function("(name) => document.querySelector('#clientTabContent')?.innerText.includes(name)",arg=service_name,timeout=15000)
                    history=page.locator("#clientTabContent").inner_text()
                    assert record["unit"] in ("centro","big","shopping-contagem") and "Pro E2E Editada" in history, f"Missing public booking detail for {record['unit']}"
                    assert page.locator("#clientTabContent table tbody tr").count()>=1,f"No persisted public booking history for {record['unit']}"
                    print(json.dumps({"scenario":"3D-public-booking-persisted-admin-ui","unit":record["unit"],"client":record["client"],"history":history[:580]},ensure_ascii=False))
                    page.locator("#modalHost button.x").click()
                print(json.dumps({"ok":True,"scenario":"3D-three-unit-public-booking-and-empty-state","count":len(public_records)},ensure_ascii=False))

                # 3E — real operational UI, isolated PostgreSQL. No raw API or SQL writes.
                page.locator("#unitPicker").select_option(value="u3")
                page.get_by_role("button",name="Estoque",exact=True).click()
                page.wait_for_function("() => !!document.querySelector('.stock-nav')",timeout=15000)
                page.locator(".stock-nav").get_by_role("button",name="Produtos",exact=True).click()
                page.wait_for_function("() => !!document.querySelector('#adminPage button[onclick=\"openStockProduct()\"]')",timeout=15000)
                product_name="Produto E2E Caixa Estoque "+suffix
                page.get_by_role("button",name="+ Novo produto").click()
                page.locator("#spName").fill(product_name)
                page.locator("#spSku").fill("UI"+suffix[-9:])
                page.locator("#spType").select_option(value="RESALE")
                page.locator("#spCost").fill("10")
                page.locator("#spSale").fill("25")
                page.locator("#spMin").fill("1")
                page.locator("#spSupplier").fill("Fornecedor E2E")
                page.get_by_role("button",name="Salvar produto").click()
                page.wait_for_function("(name)=>document.querySelector('#adminPage')?.innerText.includes(name)",arg=product_name,timeout=15000)
                product=page.evaluate("""name => db.stockProducts.filter(p=>p.name===name).map(p=>({id:p.id,central:p.central}))""",product_name)
                assert len(product)==1 and product[0]["central"],"Stock product was not projected as PostgreSQL central"
                print(json.dumps({"scenario":"3E-stock-product-saved-via-browser","product":product},ensure_ascii=False))

                page.locator(".stock-nav").get_by_role("button",name="Compras",exact=True).click()
                page.get_by_role("button",name="+ Nova compra").click()
                supplier="Fornecedor Compra UI "+suffix
                page.locator("#stockBuySupplier").fill(supplier)
                page.locator("#stockBuyDest").select_option(value="u3")
                page.locator("#stockBuyFreight").fill("5")
                page.locator("#stockPurchaseLines .stk-buy-prod").first.select_option(value=product[0]["id"])
                page.locator("#stockPurchaseLines .stk-buy-qty").first.fill("4")
                page.locator("#stockPurchaseLines .stk-buy-cost").first.fill("10")
                page.get_by_role("button",name="Receber compra").click()
                page.wait_for_function("(name)=>document.querySelector('#adminPage')?.innerText.includes(name)",arg=supplier,timeout=15000)
                balances=page.evaluate("""pid=>db.stockBalances.filter(b=>b.productId===pid).map(x=>({loc:x.locationId,qty:x.qty,avgCost:x.avgCost,central:x.central}))""",product[0]["id"])
                print(json.dumps({"scenario":"3E-stock-purchase-central-balance","balances":balances},ensure_ascii=False))
                assert any(b["loc"]=="u3" and abs(b["qty"]-4)<0.001 and abs(b["avgCost"]-11.25)<0.02 and b["central"] for b in balances),"Stock purchase/freight average cost not centrally projected"

                # A fresh browser reload must reread PostgreSQL rather than browser-local state.
                page.reload(wait_until="domcontentloaded",timeout=30000)
                page.wait_for_timeout(1600)
                if page.get_by_role("button",name="Área da equipe").is_visible():
                    page.get_by_role("button",name="Área da equipe").click()
                    page.wait_for_timeout(600)
                if page.locator("#loginPass").is_visible():
                    page.locator("#loginUser").fill(os.environ["ADMIN_USERNAME"])
                    page.locator("#loginPass").fill(os.environ["ADMIN_PASSWORD"])
                    page.get_by_role("button",name="Entrar",exact=True).click()
                    page.wait_for_timeout(1500)
                page.locator("#unitPicker").select_option(value="u3")
                page.get_by_role("button",name="Estoque",exact=True).click()
                page.wait_for_function("() => !!document.querySelector('.stock-nav')",timeout=15000)
                page.locator(".stock-nav").get_by_role("button",name="Produtos",exact=True).click()
                page.wait_for_function("(name)=>document.querySelector('#adminPage')?.innerText.includes(name)",arg=product_name,timeout=15000)
                persisted_stock=page.evaluate("""pid=>db.stockBalances.filter(b=>b.productId===pid).map(x=>({loc:x.locationId,qty:x.qty,avgCost:x.avgCost}))""",product[0]["id"])
                assert any(b["loc"]=="u3" and abs(b["qty"]-4)<0.001 for b in persisted_stock),"Central stock balance did not survive browser reload"
                print(json.dumps({"scenario":"3E-stock-central-persisted-after-reload","balances":persisted_stock},ensure_ascii=False))

                # Cash session must persist in backend and remain visible after revisiting.
                page.get_by_role("button",name="Caixa",exact=True).click()
                page.wait_for_function("() => document.querySelector('#adminPage')?.innerText.includes('Caixa do dia')",timeout=15000)
                open_cash=page.get_by_role("button",name="Abrir caixa",exact=True)
                assert open_cash.is_visible(),"Empty Centro cash session cannot be opened from UI"
                open_cash.click()
                page.locator("#cashOpeningAmount").fill("100")
                page.locator("#modalHost").get_by_role("button",name="Abrir caixa",exact=True).click()
                page.wait_for_function("() => document.querySelector('#adminPage')?.innerText.includes('Caixa aberto')",timeout=15000)
                cash_check=page.evaluate("""() => db.cashSessions.filter(x=>x.unitId==='u3'&&x.status==='open').map(x=>({id:x.id,opening:x.openingAmount,central:x.central}))""")
                assert len(cash_check)==1 and abs(cash_check[0]["opening"]-100)<.001,"Cash opening missing from central projection"
                print(json.dumps({"scenario":"3E-cash-open-browser","cash":cash_check},ensure_ascii=False))
                page.get_by_role("button",name="Estoque",exact=True).click()
                page.get_by_role("button",name="Caixa",exact=True).click()
                page.wait_for_function("() => document.querySelector('#adminPage')?.innerText.includes('Caixa aberto')",timeout=15000)

                # Multi-service command is opened from an actual existing Agenda booking.
                page.get_by_role("button",name="Agenda",exact=True).click()
                page.locator("#v92DateQuick").fill(two_date)
                page.wait_for_function("(name)=>[...document.querySelectorAll('.agenda-wrap .booking')].some(x=>x.innerText.includes(name))",arg=client_name,timeout=15000)
                page.locator(".agenda-wrap .booking",has_text=client_name).first.click()
                page.get_by_role("button",name="Abrir comanda").click()
                page.wait_for_timeout(1200)
                command_state=page.evaluate("""() => ({modal:document.querySelector('#modalHost')?.innerText.slice(0,900),toast:document.querySelector('#toast')?.innerText||document.querySelector('.toast')?.innerText||'',commands:db.clientCommands.map(c=>({id:c.id,unit:c.unitId,central:c.central,status:c.status,lines:c.lines?.length})).slice(-5),page:window.page||null})""")
                print(json.dumps({"scenario":"3E-command-open-diagnostic","state":command_state},ensure_ascii=False))
                page.wait_for_function("() => document.querySelector('#modalHost')?.innerText.includes('Comanda aberta')",timeout=8000)
                command_lines=page.locator("#modalHost [data-command-line]").count()
                assert command_lines>=2,"Multi-service Agenda booking did not produce multi-item command"
                command=page.evaluate("""() => db.clientCommands.filter(c=>c.clientName?.includes('Cliente E2E Rede')&&c.unitId==='u3').map(c=>({id:c.id,central:c.central,lines:c.lines.length,status:c.status}))""")
                print(json.dumps({"scenario":"3E-command-open-real-browser","lines":command_lines,"commands":command},ensure_ascii=False))
                assert any(c["central"] and c["lines"]>=2 for c in command),"Command did not reach central PostgreSQL"

                # Command-field policy can require observations; complete them in the UI.
                page.locator("#cmdNotes").fill("Atendimento operacional sintético 3E "+suffix)
                trigger=page.get_by_role("button",name="Finalizar pagamento")
                pre_payment=page.evaluate("""() => {let c=db.clientCommands.at(-1);return {permission:window.__imperioV72?.validateCommand?.(c?.id),paymentMethods:(db.paymentMethods||[]).map(x=>x.id),hasCommand:!!c,onclick:document.querySelector('#modalHost .modal-foot button.btn-primary')?.getAttribute('onclick')}}""")
                print(json.dumps({"scenario":"3E-pre-payment-validation","state":pre_payment},ensure_ascii=False))
                page.on("pageerror",lambda error: print(json.dumps({"scenario":"3E-browser-pageerror","message":str(error)},ensure_ascii=False)))
                trigger.click()
                page.wait_for_timeout(400)
                payment_dialog=page.locator("#modalHost").inner_text()[:650]
                payment_toast=page.evaluate("""() => document.querySelector('#toast')?.innerText||document.querySelector('.toast')?.innerText||''""")
                print(json.dumps({"scenario":"3E-payment-dialog-diagnostic","dialog":payment_dialog,"toast":payment_toast},ensure_ascii=False))
                page.wait_for_function("() => document.querySelectorAll('#paymentLines .pay-method option').length > 0",timeout=10000)
                methods=page.locator("#paymentLines .pay-method").first.locator("option").evaluate_all("(els)=>els.map(e=>({v:e.value,t:e.textContent}))")
                print(json.dumps({"scenario":"3E-payment-methods","methods":methods},ensure_ascii=False))
                assert any(m["v"]=="pm_direct" for m in methods),"Direct-professional payment method missing"
                page.locator("#paymentLines .pay-method").first.select_option(value="pm_direct")
                assert page.locator("#paymentLines .pay-account").first.is_disabled(),"DIRECT_PROFESSIONAL incorrectly requires company account"
                amount=float(page.locator("#paymentLines .pay-amount").first.input_value())
                assert amount>0,"Command due must be positive for payment test"
                payment_http=[]
                payment_console=[]
                page.on("response",lambda response: payment_http.append({"method":response.request.method,"status":response.status,"path":urlsplit(response.url).path}) if "/api/v1/" in response.url and ("command" in response.url or "cash" in response.url) else None)
                page.on("console",lambda msg: payment_console.append(msg.text[:300]) if msg.type=="error" else None)
                secure_state=page.evaluate("""() => ({secure:window.isSecureContext,crypto:!!window.crypto,subtle:!!window.crypto?.subtle,draft:db.clientCommands.at(-1)?.paymentDraft?.map(p=>({id:p.id,method:p.methodId,amount:p.amount,account:p.accountId}))})""")
                print(json.dumps({"scenario":"3E-before-payment-confirm","security":secure_state},ensure_ascii=False))
                assert secure_state["secure"] and secure_state["subtle"],"Isolated Chromium must provide WebCrypto for financial reconciliation"
                # No professional is chosen yet. The UI must reject before POST,
                # not leave a centrally paid command with unfinished local effects.
                page.get_by_role("button",name="Confirmar pagamento").click()
                page.wait_for_timeout(500)
                rejected=page.evaluate("""() => ({toast:document.querySelector('#toast')?.innerText||'',modal:!!document.querySelector('#modalHost .payment-shell')})""")
                print(json.dumps({"scenario":"3E-direct-recipient-preflight-rejected","state":rejected,"network":payment_http[-8:]},ensure_ascii=False))
                assert rejected["modal"] and "Selecione a profissional" in rejected["toast"],"Direct recipient missing was not rejected visibly"
                assert not any(r["method"]=="POST" and r["path"].endswith("/payments") for r in payment_http),"Central payment was posted before recipient validation"
                # Two services have distinct professionals; the recipient is explicit.
                recipient=page.locator("#paymentLines .pay-professional").first
                assert recipient.count()==1,"Direct payment recipient selector missing"
                recipient.select_option(label=pro_edited)
                selected_recipient=recipient.input_value()
                assert selected_recipient,"Recipient must be attached to the actual service professional"
                page.get_by_role("button",name="Confirmar pagamento").click()
                page.wait_for_timeout(3000)
                pay_after=page.evaluate("""() => ({modal:document.querySelector('#modalHost')?.innerText?.slice(-450),paymentVisible:!!document.querySelector('#modalHost .payment-shell'),toast:document.querySelector('#toast')?.innerText||document.querySelector('.toast')?.innerText||'',commands:db.clientCommands.filter(c=>c.central).slice(-2).map(c=>({id:c.id,status:c.status,paymentDraft:c.paymentDraft?.map(p=>({id:p.id,method:p.methodId,amount:p.amount}))})),cash:db.cashSessions.filter(c=>c.unitId==='u3').map(c=>({id:c.id,status:c.status}))})""")
                print(json.dumps({"scenario":"3E-after-payment-confirm-diagnostic","state":pay_after,"network":payment_http[-20:],"console":payment_console[-10:]},ensure_ascii=False))
                page.wait_for_function("() => !document.querySelector('#modalHost .payment-shell')",timeout=20000)
                paid=page.evaluate("""() => db.clientCommands.filter(c=>c.clientName?.includes('Cliente E2E Rede')&&c.unitId==='u3').map(c=>({id:c.id,status:c.status,central:c.central,payments:c.paymentDraft?.map(x=>x.methodId)}))""")
                print(json.dumps({"scenario":"3E-direct-payment-central-ui","commands":paid},ensure_ascii=False))
                assert any(c["central"] and c["status"]=="Pago" for c in paid),"Payment finalization did not close the central command"
                command_id=command[-1]["id"]
                remote=page.evaluate("""async id => {
                  let c=await window.__imperioCentralApi.command(id);
                  return {status:c.status,payments:c.payments?.map(p=>({id:p.id,method:p.method,amount:Number(p.amount),cashSessionId:p.cashSessionId,status:p.status})),
                    items:c.items?.map(i=>({serviceId:i.serviceId,professionalId:i.professionalId})),
                    draft:c.legacyPayload?.operationalSnapshot?.paymentDraft?.map(p=>({methodId:p.methodId,professionalId:p.professionalId}))}
                }""",command_id)
                local_finance=page.evaluate("""id => ({companyPayments:db.demoCashMovements.filter(m=>m.commandId===id).map(m=>m.id),
                  directAdjustments:db.demoFinancialEntries.filter(e=>e.nature==='Compensação com profissional'&&String(e.origin||'').includes(id.replace(/\D/g,''))).map(e=>({professionalId:e.professionalId,cashImpact:e.cashImpact,treasuryImpact:e.treasuryImpact}))})""",command_id)
                print(json.dumps({"scenario":"3E-direct-central-payment-posted-once","command":remote,"companyFinance":local_finance},ensure_ascii=False))
                assert remote["status"]=="CLOSED" and len(remote["payments"] or [])==1,"Payment was not exactly once or command did not close"
                assert remote["payments"][0]["method"]=="DIRECT_PROFESSIONAL" and remote["payments"][0]["cashSessionId"] is None,"Direct receipt contaminated company cash"
                assert remote["payments"][0]["status"]=="CONFIRMED" and abs(remote["payments"][0]["amount"]-amount)<.01,"Confirmed amount differs from UI"
                assert any(d["methodId"]=="pm_direct" and d["professionalId"]==selected_recipient for d in remote["draft"] or []),"Direct recipient not preserved in central snapshot"
                assert len(local_finance["companyPayments"])==0,"Direct receipt generated company cash movement"

                # Inventory is a central-backed technical location, not a commercial unit.
                page.get_by_role("button",name="Estoque",exact=True).click()
                page.locator(".stock-nav").get_by_role("button",name="Inventário",exact=True).click()
                page.wait_for_function("() => !!document.querySelector('#stockInvLocation')",timeout=15000)
                page.locator("#stockInvLocation").select_option(value="u3")
                inventory_line=page.locator(f"#stockInventoryBody tbody tr[data-pid='{product[0]['id']}']")
                assert inventory_line.count()==1,"Synthetic product absent from real inventory"
                inventory_line.locator(".stock-inventory-input").fill("3")
                # V73 turned the former free-text inventory reason into a controlled select.
                reason=page.locator("#stockInvReason")
                assert reason.evaluate("(el)=>el.tagName")==="SELECT","Inventory reason must use the configured taxonomy"
                assert reason.input_value(),"Select a nonempty existing inventory reason, never invent one"
                page.get_by_role("button",name="Aplicar contagem",exact=True).click()
                page.wait_for_function("""pid => (db.stockBalances||[]).some(b=>b.productId===pid&&b.locationId==='u3'&&Math.abs(b.qty-3)<.001)""",arg=product[0]["id"],timeout=20000)
                print(json.dumps({"scenario":"3E-inventory-applied-real-ui","stock":page.evaluate("""pid => db.stockBalances.filter(b=>b.productId===pid).map(b=>({loc:b.locationId,qty:b.qty,central:b.central}))""",product[0]["id"])},ensure_ascii=False))

                # No company cash was received; physical opening must remain unchanged.
                page.get_by_role("button",name="Caixa",exact=True).click()
                page.wait_for_function("() => document.querySelector('#adminPage')?.innerText.includes('Caixa aberto')",timeout=15000)
                cash_open=page.evaluate("""() => db.cashSessions.filter(c=>c.unitId==='u3'&&c.status==='open').map(c=>({id:c.id,opening:c.openingAmount}))""")
                assert len(cash_open)==1 and abs(cash_open[0]["opening"]-100)<.01
                page.get_by_role("button",name="Fechar caixa",exact=True).click()
                page.locator("#cashCounted").fill("100")
                page.get_by_role("button",name="Confirmar fechamento",exact=True).click()
                page.wait_for_function("() => db.cashSessions.some(c=>c.unitId==='u3'&&c.status==='closed')",timeout=15000)
                print(json.dumps({"scenario":"3E-cash-closed-with-no-direct-revenue","sessions":page.evaluate("""() => db.cashSessions.filter(c=>c.unitId==='u3').map(c=>({id:c.id,status:c.status,opening:c.openingAmount,counted:c.countedAmount}))""")},ensure_ascii=False))

                # Reload proves cash and stock survive client restarts (central PostgreSQL).
                page.reload(wait_until="domcontentloaded",timeout=30000)
                page.wait_for_timeout(1550)
                if page.get_by_role("button",name="Área da equipe").is_visible():
                    page.get_by_role("button",name="Área da equipe").click()
                if page.locator("#loginPass").is_visible():
                    page.locator("#loginUser").fill(os.environ["ADMIN_USERNAME"])
                    page.locator("#loginPass").fill(os.environ["ADMIN_PASSWORD"])
                    page.get_by_role("button",name="Entrar",exact=True).click()
                    page.wait_for_timeout(1500)
                page.locator("#unitPicker").select_option(value="u3")
                page.get_by_role("button",name="Estoque",exact=True).click()
                page.locator(".stock-nav").get_by_role("button",name="Produtos",exact=True).click()
                page.wait_for_function("(name)=>document.querySelector('#adminPage')?.innerText.includes(name)",arg=product_name,timeout=15000)
                persisted_after_inventory=page.evaluate("""pid => db.stockBalances.filter(b=>b.productId===pid&&b.locationId==='u3').map(b=>({qty:b.qty,central:b.central}))""",product[0]["id"])
                assert any(abs(b["qty"]-3)<.001 and b["central"] for b in persisted_after_inventory),"Physical inventory did not persist after reload"
                page.get_by_role("button",name="Caixa",exact=True).click()
                page.wait_for_function("() => db.cashSessions.some(c=>c.unitId==='u3'&&c.status==='closed')",timeout=15000)
                reopened_remote=page.evaluate("""async id => {
                  let c=await window.__imperioCentralApi.command(id);
                  return {status:c.status,payments:c.payments?.map(p=>({id:p.id,method:p.method,cashSessionId:p.cashSessionId}))}
                }""",command_id)
                assert reopened_remote["status"]=="CLOSED" and len(reopened_remote["payments"] or [])==1,"Payment was duplicated/lost after reload"
                print(json.dumps({"scenario":"3E-reload-finance-stock-confirmed","inventory":persisted_after_inventory,"payment":reopened_remote},ensure_ascii=False))

                page.get_by_role("button",name="Relatórios",exact=True).click()
                page.wait_for_function("() => document.querySelector('#adminPage')?.innerText.includes('Relatórios') && !!document.querySelector('.report-nav')",timeout=15000)
                report=page.locator("#adminPage").inner_text()
                assert "Relatórios" in report and len(report)>120,"Essential reports do not render from operational dashboard"
                print(json.dumps({"scenario":"3E-reports-visible-after-operations","summary":report[:950]},ensure_ascii=False))
                print(json.dumps({"ok":True,"scenario":"3E-command-payment-cash-stock-reports-browser"},ensure_ascii=False))








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
