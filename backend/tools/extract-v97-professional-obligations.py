import argparse,json,hashlib,sys
from pathlib import Path
from playwright.sync_api import sync_playwright

def canonical_json(v): return json.dumps(v,ensure_ascii=False,separators=(',',':'),sort_keys=True)
def js_json(v): return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def sha(v,canonical=True): return 'sha256:'+hashlib.sha256((canonical_json(v) if canonical else js_json(v)).encode()).hexdigest()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--html',required=True);ap.add_argument('--through',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    env=json.loads(Path(a.input).read_text());payload=env.get('data',{})
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page();page.set_content(Path(a.html).read_text(),wait_until='domcontentloaded')
        rows=page.evaluate("""({payload,through})=>{for(const [k,v] of Object.entries(payload||{})) db[k]=structuredClone(v);ensureDatabaseShape(db);return window.__imperioV61.v61ProfessionalObligations({to:through,unit:'all'});}""",{'payload':payload,'through':a.through});browser.close()
    snapshot={'engine':'V97_V61_PROFESSIONAL_OBLIGATIONS','schemaVersion':97,'asOfDate':a.through,'sourceDataHash':sha(payload,False),'rows':rows,'uncertain':any(bool(r.get('uncertain')) for r in rows if isinstance(r,dict))}
    snapshot['snapshotHash']=sha(snapshot)
    env['data']['professionalObligationSnapshot']=snapshot;env['dataHash']=sha(env['data'],False)
    Path(a.out).write_text(json.dumps(env,ensure_ascii=False,indent=2));print(json.dumps({'ok':True,'rows':len(rows),'out':a.out}))
if __name__=='__main__': main()
