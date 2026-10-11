#!/usr/bin/env python3
"""A3 form-level operational acceptance. Real Chromium clicks/forms, two browser contexts, synthetic PostgreSQL only.
Application code is exactly 4dc03ea; this test runs from a separate verification-only child commit.
No real backup, external URL, production services or credentials.
"""
import json,os,subprocess,sys,time,urllib.request
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,TimeoutError as WaitTimeout
ROOT=Path(__file__).resolve().parents[2]
BACKEND=ROOT/"backend"
OUT=BACKEND/"test-evidence"/"a3-forms"
OUT.mkdir(parents=True,exist_ok=True)
APP_SHA="4dc03ea2544fb2eb606f3f224a70de651915981e"
assert subprocess.check_output(["git","merge-base",APP_SHA,"HEAD"],cwd=ROOT,text=True).strip()==APP_SHA,"Wrong approved application ancestor SHA"
changed=set(subprocess.check_output(["git","diff","--name-only",APP_SHA,"HEAD"],cwd=ROOT,text=True).splitlines())
assert changed<=set(["backend/test/a3-fin-forms.operational.chromium.py",".github/workflows/backend-ci.yml"]),"Application files changed"
url=os.environ.get("DATABASE_URL","")
assert "imperio_ci" in url and ("localhost" in url or "127.0.0.1" in url),"Isolated imperio_ci is mandatory"
assert os.environ.get("ADMIN_USERNAME")=="ci_owner","Only synthetic CI user allowed"
FRONT_PORT=3285
API_PORT=3286
UI=f"http://ui.imperio.localhost:{FRONT_PORT}"
API=f"http://api.imperio.localhost:{API_PORT}"
suffix="a3ops"
logs=[]
def record(stage,**e):
    item={"stage":stage,"result":"PASS",**e}
    logs.append(item)
    print(json.dumps(item,ensure_ascii=False,sort_keys=True),flush=True)
def ready(address):
    for _ in range(100):
        try:
            with urllib.request.urlopen(address,timeout=1) as r:
                if r.status==200:return
        except Exception:time.sleep(.25)
    raise RuntimeError("Isolated test service unavailable")
def attach(browser):
    ctx=browser.new_context(viewport={"width":1330,"height":840})
    page=ctx.new_page()
    page.on("dialog",lambda dialog:dialog.accept())
    page.add_init_script(f"window.IMPERIO_API_BASE={json.dumps(API)};")
    page.route("**/*",lambda rt:rt.continue_() if urlsplit(rt.request.url).hostname in ("ui.imperio.localhost","api.imperio.localhost") else rt.abort())
    page.goto(UI+"/index.html",wait_until="domcontentloaded",timeout=30000)
    page.get_by_role("button",name="Área da equipe").click()
    page.locator("#loginUser").fill(os.environ["ADMIN_USERNAME"])
    page.locator("#loginPass").fill(os.environ["ADMIN_PASSWORD"])
    page.get_by_role("button",name="Entrar",exact=True).click()
    page.wait_for_function("sessionStorage.getItem('imperio-v99-central-authenticated')==='1'&&!!window.__a3Finance",timeout=20000)
    return ctx,page
def go_fin(page,unit="u3",tab=None):
    page.locator("#unitPicker").select_option(unit)
    page.get_by_role("button",name="Financeiro",exact=True).click()
    page.wait_for_timeout(900)
    pending=page.get_by_role("button",name="Revisar contas existentes")
    if pending.count():
        pending.click()
        page.wait_for_timeout(900)
        # After the reconciliation, navigate back through the real Financeiro tab.
        page.get_by_role("button",name="Financeiro",exact=True).click()
        page.wait_for_timeout(900)
    if page.get_by_role("button",name="Revisar contas existentes").count():
        raise AssertionError("Central account reconciliation did not complete")
    if tab:
        page.get_by_role("button",name=tab,exact=True).click()
        page.wait_for_timeout(450)
    return page
def read(page,unit,path):
    return page.evaluate("""async ({unit,path})=>{
      const base=window.__imperioCentralApi.status().endpoint;
      const resp=await fetch(base+'/api/v1'+path,{credentials:'include',headers:{'X-Unit-Id':unit},cache:'no-store'});
      return {status:resp.status,data:await resp.json().catch(()=>null)};
    }""",{"unit":unit,"path":path})
def ensure_payment_catalog(page):
    go_fin(page,"u3","Formas de pagamento")
    ids=page.evaluate("db.paymentMethods.filter(x=>x.kind==='pix'||x.id==='pm_pix').map(x=>x.id)")
    if "pm_pix" in ids:
        record("payment_catalog",mode="existing_canonical_pix")
        return "pm_pix"
    # Only synthetic setup: use the actual configuration form rather than injecting browser storage.
    page.get_by_role("button",name="+ Nova forma").click()
    page.locator("#finPmName").fill("Pix sintético A3")
    page.locator("#finPmKind").select_option("pix")
    page.locator("#finPmActive").check()
    page.locator("#modalHost").get_by_role("button",name="Salvar").click()
    result=page.evaluate("db.paymentMethods.find(x=>x.name==='Pix sintético A3')?.id")
    assert result,"Synthetic PIX configuration not created through the UI"
    record("payment_catalog",mode="created_by_real_UI",backendPaymentMapping="OTHER_for_custom_method")
    return result
def account(page,unit,name,method_id,edit_name=None):
    go_fin(page,unit,"Contas")
    if edit_name:
        page.locator(".finance-account-card").filter(has_text=name).get_by_role("button",name="Configurar").click()
    else:
        page.get_by_role("button",name="+ Nova conta").click()
    page.locator("#finAccName").fill(edit_name or name)
    page.locator("#finAccType").select_option("BANK")
    page.locator("#finAccUnit").select_option(unit)
    page.locator("#finAccInstitution").fill("Instituição sintética")
    page.locator("#finAccInternal").fill("E2E-ONLY")
    page.locator("#finAccActive").check()
    page.locator('input.fin-acc-method[value="'+method_id+'"]').check()
    fee=page.locator('input.fin-rule-percent[data-mid="'+method_id+'"]')
    fee.fill("1.25")
    page.locator("#modalHost").get_by_role("button",name="Salvar conta").click()
    page.wait_for_function("(n)=>db.financialAccounts.some(x=>x.name===n&&x.central===true)",arg=edit_name or name,timeout=15000)
    assert page.locator("#modalHost").is_hidden() or not page.locator("#finAccName").count(),"Form must close after central confirmation"
    return page.evaluate("(n)=>db.financialAccounts.find(x=>x.name===n)?.id",edit_name or name)
def manual(page,unit,account_id,desc,amount):
    go_fin(page,unit,"Lançamentos")
    page.get_by_role("button",name="+ Novo lançamento").click()
    page.locator("#finEntryDirection").select_option("income")
    page.locator("#finEntryStatus").select_option("Efetivado")
    page.locator("#finEntryDate").fill("2026-10-09")
    page.locator("#finEntryUnit").select_option(unit)
    page.locator("#finEntryAccount").select_option(account_id)
    page.locator("#finEntryDesc").fill(desc)
    page.locator("#finEntryAmount").fill(str(amount))
    page.locator("#modalHost").get_by_role("button",name="Salvar lançamento").click()
    page.wait_for_function("(d)=>db.demoFinancialEntries.some(e=>e.origin===d&&e.central===true)",arg=desc,timeout=15000)
    assert page.locator("#modalHost").is_hidden() or not page.locator("#finEntryAmount").count(),"Manual form did not confirm backend save"
    return page.evaluate("(d)=>db.demoFinancialEntries.find(x=>x.origin===d&&x.central)?.id",desc)
def seed_receivables(client_id):
    script="""import {PrismaClient} from '@prisma/client';
      const p=new PrismaClient();const clientId=process.argv[1];
      try {
        const exists=await p.client.findUnique({where:{id:clientId},select:{id:true}});
        if(!exists)throw Error('Synthetic client not in central database');
        await p.receivableOpening.createMany({data:[
          {id:'a3_forms_centro_receivable',clientId,unitId:'centro',sourceDate:new Date('2026-10-07T00:00:00Z'),originalAmount:80,balance:80,status:'OPEN'},
          {id:'a3_forms_big_receivable',clientId,unitId:'big',sourceDate:new Date('2026-10-07T00:00:00Z'),originalAmount:200,balance:200,status:'OPEN'}
        ]});
        console.log(JSON.stringify({ok:true,syntheticReceivables:2}));
      }finally{await p.$disconnect()}"""
    v=subprocess.run(["node","--input-type=module","-e",script,client_id],cwd=BACKEND,env=os.environ.copy(),capture_output=True,text=True)
    if v.returncode:raise RuntimeError("Synthetic fixture failed: "+v.stderr[-500:])
def dbcheck(account_id,manual_ids,client_id):
    script="""import {PrismaClient} from '@prisma/client';
      const p=new PrismaClient();
      try {
        const [acc,entries,receivables,alloc]=await Promise.all([
          p.centralFinanceAccount.findUnique({where:{id:process.argv[1]}}),
          p.centralFinanceEntry.findMany({where:{id:{in:JSON.parse(process.argv[2])}},select:{id:true,unitId:true,amount:true,description:true}}),
          p.receivableOpening.findMany({where:{id:{in:['a3_forms_centro_receivable','a3_forms_big_receivable']}},select:{id:true,unitId:true,balance:true}}),
          p.centralFinanceEntry.findMany({where:{kind:'MONTHLY_RECEIPT',clientId:process.argv[3]},select:{unitId:true,amount:true,metadata:true}})
        ]);
        console.log(JSON.stringify({account:{name:acc?.name,metadata:acc?.metadata},entries,receivables,alloc}));
      }finally{await p.$disconnect()}"""
    v=subprocess.run(["node","--input-type=module","-e",script,account_id,json.dumps(manual_ids),client_id],cwd=BACKEND,env=os.environ.copy(),capture_output=True,text=True)
    if v.returncode:raise RuntimeError("Synthetic DB verification failed: "+v.stderr[-500:])
    return json.loads(v.stdout.strip())
env={**os.environ,"PORT":str(API_PORT),"OPERATIONAL_WRITES_ENABLED":"true","OPERATIONAL_WRITES_UNITS":"centro,big,shopping-contagem","CORS_ORIGINS":UI}
processes=[]
try:
    processes.append(subprocess.Popen([sys.executable,"-m","http.server",str(FRONT_PORT),"--bind","127.0.0.1"],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
    processes.append(subprocess.Popen(["node","dist/src/main.js"],cwd=BACKEND,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
    ready(f"http://127.0.0.1:{FRONT_PORT}/index.html")
    ready(f"http://127.0.0.1:{API_PORT}/api/v1/health")
    record("synthetic_environment",applicationSha=APP_SHA,db="imperio_ci",threeUnits=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=["--no-proxy-server","--host-resolver-rules=MAP ui.imperio.localhost 127.0.0.1, MAP api.imperio.localhost 127.0.0.1"])
        one=two=None
        try:
            c1,one=attach(browser);c2,two=attach(browser)
            record("two_independent_real_logins",sessionCookiesIndependent=c1!=c2)
            go_fin(one,"u3","Contas")
            record("legacy_accounts_reconciled_through_browser",serverRows=len(read(one,"centro","/finance/accounts")["data"]))
            pix_id=ensure_payment_catalog(one)
            name="Banco A3 E2E Sintético"
            acc_id=account(one,"u3",name,pix_id)
            edited=name+" Editado"
            account(one,"u3",name,pix_id,edited)
            info=read(one,"centro","/finance/accounts")
            remote=next((x for x in info["data"] if x["id"]==acc_id),None)
            assert remote and remote["name"]==edited and remote["metadata"]["feeRules"][pix_id]["percent"]==1.25
            record("account_creation_and_edit_real_form",backendConfirmed=True)
            go_fin(two,"u3","Contas")
            assert two.get_by_text(edited,exact=True).count()>0,"New account not visible from independent session"
            two.reload(wait_until="domcontentloaded")
            if two.locator("#adminApp").evaluate("(e)=>e.classList.contains('hidden')"):
                two.get_by_role("button",name="Área da equipe").click()
            two.wait_for_function("!!window.__a3Finance&&sessionStorage.getItem('imperio-v99-central-authenticated')==='1'",timeout=20000)
            go_fin(two,"u3","Contas")
            assert two.get_by_text(edited,exact=True).count()>0,"Edited account missing after reload"
            record("account_persists_across_sessions_and_reload",verified=True)
            big_id=account(one,"u1","Banco A3 Sintético Big",pix_id)
            shop_id=account(one,"u2","Banco A3 Sintético Shopping",pix_id)
            e_centro=manual(one,"u3",acc_id,"a3_forms_manual_centro",19.75)
            e_big=manual(one,"u1",big_id,"a3_forms_manual_big",7.5)
            e_shop=manual(one,"u2",shop_id,"a3_forms_manual_shopping",9.25)
            ids=[e_centro,e_big,e_shop]
            assert all(ids),"Manual forms did not yield central identifiers"
            for unit,which in [("centro",e_centro),("big",e_big),("shopping-contagem",e_shop)]:
                response=read(two,unit,"/finance/entries?from=2026-10-09&to=2026-10-09")
                assert response["status"]==200 and sum(x["id"]==which for x in response["data"])==1
                assert all(x["unitId"]==unit for x in response["data"])
            go_fin(two,"u3","Lançamentos")
            assert two.get_by_text("a3_forms_manual_centro").count()>0
            assert two.get_by_text("a3_forms_manual_big").count()==0
            record("manual_income_three_units_real_forms_and_second_session",entries=3,crossUnitLeak=False)
            # Client fixture is CREATED through the real registration UI; SQL inserts only synthetic open obligations.
            one.locator("#unitPicker").select_option("u3")
            one.get_by_role("button",name="Clientes",exact=True).click()
            one.get_by_role("button",name="Como conheceu?").click()
            one.locator("#v71NewOption").fill("Origem A3 sintética")
            one.get_by_role("button",name="Adicionar",exact=True).click()
            one.get_by_role("button",name="Fechar",exact=True).click()
            one.get_by_role("button",name="Clientes",exact=True).click()
            one.get_by_role("button",name="+ Nova cliente").click()
            one.locator("#cfName").fill("Cliente sintética validação A3")
            one.locator("#cfPhone").fill("31900009999")
            source=one.locator("#cfSource option").evaluate_all("(els)=>els.filter(e=>e.value).map(e=>e.value)")
            assert source
            one.locator("#cfSource").select_option(source[0])
            one.get_by_role("button",name="Salvar cliente").click()
            one.wait_for_function("db.clients.some(c=>c.name==='Cliente sintética validação A3'&&c.central===true)",timeout=16000)
            client_id=one.evaluate("db.clients.find(c=>c.name==='Cliente sintética validação A3').id")
            seed_receivables(client_id)
            # Financeiro navigation hydrates new receivables centrally; no local writes used for settlements.
            go_fin(one,"u3","Lançamentos")
            one.get_by_role("button",name="Clientes",exact=True).click()
            one.locator("#clientSearch").fill("Cliente sintética validação A3")
            one.locator("#clientRows tr").filter(has_text="Cliente sintética validação A3").get_by_role("button",name="Abrir").click()
            one.get_by_role("button",name="Conta mensal",exact=True).click()
            one.get_by_role("button",name="Receber conta").click()
            one.locator("#cmPayMethod").select_option(pix_id)
            one.locator("#cmPayAccount").select_option(acc_id)
            one.locator("#cmPayAmount").fill("50")
            one.locator("#cmPayDate").fill("2026-10-09")
            centro=one.locator('input.a3-receivable[value="a3_forms_centro_receivable"]')
            centro.wait_for(timeout=6000)
            centro.check()
            assert one.locator('input.a3-receivable[value="a3_forms_big_receivable"]').count()==0,"Cross-unit Big invoice displayed for Centro"
            one.locator("#modalHost").get_by_role("button",name="Confirmar recebimento").click()
            one.wait_for_function("db.clientReceivables.some(x=>x.id==='a3_forms_centro_receivable'&&Number(x.balance)===30)",timeout=15000)
            record("monthly_settlement_real_form_selected_Centro_only",amount=50,otherUnitNotSelectable=True)
            go_fin(two,"u3","Lançamentos")
            two.reload(wait_until="domcontentloaded")
            if two.locator("#adminApp").evaluate("(e)=>e.classList.contains('hidden')"):
                two.get_by_role("button",name="Área da equipe").click()
            two.wait_for_function("!!window.__a3Finance&&sessionStorage.getItem('imperio-v99-central-authenticated')==='1'",timeout=20000)
            go_fin(two,"u3","Lançamentos")
            evidence=dbcheck(acc_id,ids,client_id)
            balances={x["unitId"]:float(x["balance"]) for x in evidence["receivables"]}
            assert balances=={"centro":30.0,"big":200.0},balances
            assert len(evidence["entries"])==3
            assert len(evidence["alloc"])==1 and evidence["alloc"][0]["unitId"]=="centro"
            assert evidence["alloc"][0]["metadata"]["allocations"][0]["receivableId"]=="a3_forms_centro_receivable"
            record("PostgreSQL_form_consistency",threeEntries=True,CentroBalance=30,BigBalance=200)
            (OUT/"result.json").write_text(json.dumps({"ok":True,"sha":APP_SHA,"syntheticOnly":True,"checks":logs},ensure_ascii=False,indent=2))
        except Exception as exc:
            print("A3_FORM_FAILURE: "+type(exc).__name__+": "+str(exc)[:500],flush=True)
            if one:
                try:one.screenshot(path=str(OUT/"failure-synthetic.png"),full_page=False,timeout=5000)
                except Exception:pass
            (OUT/"result.json").write_text(json.dumps({"ok":False,"sha":APP_SHA,"stage":logs[-1]["stage"] if logs else "startup","exceptionType":type(exc).__name__,"checks":logs},ensure_ascii=False,indent=2))
            raise
        finally:browser.close()
finally:
    for proc in reversed(processes):
        proc.terminate()
        try:proc.wait(timeout=5)
        except subprocess.TimeoutExpired:proc.kill()
