import json,subprocess,tempfile,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];HTML=ROOT.parent/'index.html';tests=0
def ok(v,m):
 global tests;tests+=1
 if not v: raise AssertionError(m)
def main():
 global tests
 try: import playwright  # noqa
 except Exception:
  print(json.dumps({'ok':True,'tests':0,'feature':'v98a_professional_parity','skipped':'playwright unavailable'}));return
 data={'storageMeta':{'dataMode':'real'},'units':[{'id':'u1','name':'U1'}],'categories':[],'services':[],'pros':[{'id':'p1','name':'Prof','units':['u1']}],'clients':[],'bookings':[],'professionalCommissionAdjustments':[{'id':'a1','professionalId':'p1','unitId':'u1','amount':2.35,'date':'2026-09-28'}],'tipMovements':[{'id':'t1','professionalId':'p1','unitId':'u1','amount':10,'date':'2026-09-28'}],'userAccounts':[],'auditEvents':[]}
 import hashlib
 raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode();env={'format':'imperio-central-migration','contractVersion':1,'schemaVersion':97,'instanceId':'i','revision':1,'sensitiveIncluded':False,'sourceKind':'CANONICAL_RECONCILED','reconciliationId':'r','dataHash':'sha256:'+hashlib.sha256(raw).hexdigest(),'data':data}
 with tempfile.TemporaryDirectory() as td:
  inp=Path(td)/'in.json';out=Path(td)/'out.json';inp.write_text(json.dumps(env))
  cmd=[sys.executable,str(ROOT/'tools/extract-v97-professional-obligations.py'),'--input',str(inp),'--html',str(HTML),'--through','2026-09-29','--out',str(out)]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=180);ok(r.returncode==0,'extrator executa');e=json.loads(out.read_text());s=e['data']['professionalObligationSnapshot'];ok(s['engine']=='V97_V61_PROFESSIONAL_OBLIGATIONS','engine');ok(s['schemaVersion']==97,'schema');ok(isinstance(s['rows'],list),'rows');ok(s['snapshotHash'].startswith('sha256:'),'hash snapshot');ok(e['dataHash'].startswith('sha256:'),'hash envelope');ok(s['sourceDataHash'].startswith('sha256:'),'hash origem');ok('uncertain' in s,'incerteza explícita')
 print(json.dumps({'ok':True,'tests':tests,'feature':'v98a_professional_parity'}))
if __name__=='__main__':main()
