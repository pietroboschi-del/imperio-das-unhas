#!/usr/bin/env python3
"""A4 F01/F02/F03: real Chromium UI, mock synthetic REST, no production network/data."""
import asyncio
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

APP = 'https://ui.a4.test'
API = 'https://api.a4.test'
JS = Path(__file__).resolve().parents[2] / 'assets/js/a4-tasks-central.js'
assert JS.exists()
assert os.getenv('CI') == 'true', 'Run in isolated CI only'
assert 'imperio_ci' in os.getenv('DATABASE_URL', ''), 'Isolated CI database required'
OWNER = {'userId':'owner','displayName':'Dona','networkAdmin':True,'unitAccesses':[], 'permissions':[]}
CENTRO = {'userId':'centro-user','displayName':'Recepção Centro','networkAdmin':False,'unitAccesses':[{'unitId':'centro','active':True,'permissions':['tasks.read','tasks.manage']}], 'permissions':[]}
VIEWER = {'userId':'viewer','displayName':'Consulta Centro','networkAdmin':False,'unitAccesses':[{'unitId':'centro','active':True,'permissions':['tasks.read']}], 'permissions':[]}
BIG = {'userId':'big-user','displayName':'Recepção Big','networkAdmin':False,'unitAccesses':[{'unitId':'big','active':True,'permissions':['tasks.read','tasks.manage']}], 'permissions':[]}
DATA = [
 {'id':'manual_centro_seed','title':'Inicial Centro','unitId':'centro','sourceType':'MANUAL','status':'OPEN','priority':'normal','category':'general','assignedUserId':'centro-user','updatedAt':'2026-10-12T10:00:00Z','dueDate':None,'note':''},
 {'id':'manual_big_seed','title':'Inicial Big','unitId':'big','sourceType':'MANUAL','status':'OPEN','priority':'high','category':'general','assignedUserId':'big-user','updatedAt':'2026-10-12T10:00:00Z','dueDate':None,'note':''},
 {'id':'manual_shopping_seed','title':'Inicial Shopping','unitId':'shopping-contagem','sourceType':'MANUAL','status':'DONE','priority':'critical','category':'finance','assignedUserId':'owner','updatedAt':'2026-10-12T10:00:00Z','dueDate':None,'note':''},
 {'id':'auto_centro','title':'Automática PostgreSQL','unitId':'centro','sourceType':'WAITLIST','status':'OPEN','priority':'normal','category':'clients','assignedUserId':'centro-user','updatedAt':'2026-10-12T10:00:00Z','dueDate':None,'note':''},
]
USERS = [
 {'id':'owner','displayName':'Dona','networkAdmin':True,'active':True},
 {'id':'centro-user','displayName':'Recepção Centro','unitAccesses':[{'unitId':'centro','active':True}],'active':True},
 {'id':'big-user','displayName':'Recepção Big','unitAccesses':[{'unitId':'big','active':True}],'active':True},
]
html = """<!doctype html><html><body><div id="adminPage"></div>
<script>
window.page='actions';
window.db={managementTasks:[{id:'legacy-1',title:'LEGADO LOCAL',unitId:'centro',status:'OPEN'}]};
window.renderAdmin=function(){document.getElementById('adminPage').innerHTML='<div id="v66Automatic"><h3>Alertas automáticos V66</h3><span data-automatic-count="1">1</span>'+(db.managementTasks.length?'<div>LEGADO LOCAL na lista V66</div>':'')+'</div>';};
window.v66OpenTask=function(){};
window.v66SaveTask=function(){};
window.v66CompleteTask=function(){};
window.v66ReopenTask=function(){};
window.toast=function(m){window.__toasts.push(m)};
window.__toasts=[];
window.modal=function(title,body,actions){let old=document.getElementById('dialog');if(old)old.remove();let d=document.createElement('div');d.id='dialog';d.innerHTML='<h3>'+title+'</h3>'+body+'<footer>'+actions+'</footer>';document.body.appendChild(d);};
window.closeModal=function(){document.getElementById('dialog')?.remove()};
window.__imperioCentralApi={status:()=>({endpoint:'https://api.a4.test'}),disable:()=>{sessionStorage.removeItem('imperio-v99-central-authenticated')}};
</script></body></html>"""
gate = asyncio.Event()
delayed = False
hits = 0
checks = 0
def check(cond, message):
 global checks
 assert cond, message
 checks += 1

async def handler(route):
 global delayed,hits
 req=route.request
 url=urlsplit(req.url)
 if url.netloc=='ui.a4.test':
  await route.fulfill(status=200,content_type='text/html',body=html)
  return
 if url.netloc!='api.a4.test':
  raise AssertionError('Unexpected network destination: '+url.netloc)
 headers={'access-control-allow-origin':APP,'access-control-allow-credentials':'true',
          'access-control-allow-headers':'content-type,x-unit-id,x-csrf-token,idempotency-key',
          'access-control-allow-methods':'GET,POST,PATCH,OPTIONS','content-type':'application/json'}
 if req.method=='OPTIONS':
  await route.fulfill(status=204,headers=headers,body='')
  return
 unit=req.headers.get('x-unit-id','')
 path=url.path
 if path=='/api/v1/admin/users':
  await route.fulfill(status=200,headers=headers,body=json.dumps(USERS));return
 if path=='/api/v1/tasks' and req.method=='GET':
  if delayed and unit=='centro':
   hits += 1
   await gate.wait()
  data=[x for x in DATA if x['unitId']==unit]
  await route.fulfill(status=200,headers=headers,body=json.dumps(data));return
 if path.startswith('/api/v1/tasks') and req.method in ('POST','PATCH'):
  body=json.loads(req.post_data or '{}')
  if req.method=='POST' and path=='/api/v1/tasks':
   row={**body,'id':'manual_created_'+str(len(DATA)),'status':'OPEN','sourceType':'MANUAL','updatedAt':'2026-10-12T11:00:00Z'}
   DATA.append(row)
  elif req.method=='PATCH':
   ident=path.rsplit('/',1)[-1];row=next(x for x in DATA if x['id']==ident)
   row.update(body);row['updatedAt']='2026-10-12T11:01:00Z'
  else:
   ident=path.split('/')[-2];row=next(x for x in DATA if x['id']==ident)
   if row['sourceType']!='MANUAL':
    await route.fulfill(status=403,headers=headers,body='{"message":"protected"}');return
   row['status']='DONE' if path.endswith('/complete') else 'OPEN'
   row['updatedAt']='2026-10-12T11:02:00Z'
  await route.fulfill(status=200,headers=headers,body=json.dumps(row));return
 await route.fulfill(status=404,headers=headers,body='{"message":"unexpected"}')

async def authenticate(page,user):
 await page.evaluate("""u=>{sessionStorage.setItem('imperio-v99-central-authenticated','1');
 sessionStorage.setItem('imperio-v99-central-principal',JSON.stringify(u));
 sessionStorage.setItem('imperio-v96-shadow-csrf','synthetic-csrf');}""",user)

async def make_page(browser,user):
 context=await browser.new_context()
 await context.route('**/*',handler)
 page=await context.new_page()
 await page.goto(APP)
 await authenticate(page,user)
 await page.add_script_tag(path=str(JS))
 await page.evaluate('window.renderAdmin()')
 await page.wait_for_function("window.__a4Task.counts().loaded>0")
 return context,page

async def main():
 global delayed,hits
 async with async_playwright() as play:
  browser=await play.chromium.launch(headless=True)
  ownerctx,owner=await make_page(browser,OWNER)
  check(await owner.locator('[data-central-task]').count()==4,'all three units central read and WA4 row')
  check(await owner.locator('[data-a4-count="loaded"]').inner_text()=='4','central loaded indicator')
  check(await owner.locator('#v66Automatic').count()==1,'V66 automatic alerts preserved')
  check(await owner.locator('#adminPage').get_by_text('LEGADO LOCAL na lista V66').count()==0,'legacy excluded from V66 authoritative list')
  check(await owner.locator('#a4LegacyArchive').count()==1,'legacy retained separately')
  await owner.locator('#a4FilterUnit').select_option('big')
  check(await owner.locator('[data-central-task]').count()==1,'unit filter')
  await owner.locator('#a4FilterUnit').select_option('all')
  await owner.locator('#a4FilterPriority').select_option('critical')
  check(await owner.locator('[data-central-task]').count()==0,'priority and open-status intersection')
  await owner.locator('#a4FilterStatus').select_option('done')
  check(await owner.locator('[data-central-task]').count()==1,'done + priority')
  await owner.locator('#a4FilterPriority').select_option('all')
  await owner.locator('#a4FilterStatus').select_option('open')
  await owner.locator('#a4FilterAssignee').select_option('centro-user')
  check(await owner.locator('[data-central-task]').count()==2,'assignee filter')
  await owner.locator('#a4FilterAssignee').select_option('all')
  await owner.evaluate("v66OpenTask()")
  await owner.locator('#a4Title').fill('Criada pelo Chromium')
  await owner.locator('#a4Unit').select_option('centro')
  await owner.locator('#a4Priority').select_option('high')
  await owner.locator('#a4Assignee').select_option('centro-user')
  check(await owner.evaluate("v66SaveTask()") is True,'create real browser form')
  check(any(x['title']=='Criada pelo Chromium' for x in DATA),'create persisted in synthetic REST')
  created=next(x for x in DATA if x['title']=='Criada pelo Chromium')
  await owner.evaluate('(id)=>v66OpenTask(id)',created['id'])
  await owner.locator('#a4Title').fill('Editada pelo Chromium')
  check(await owner.evaluate('(id)=>v66SaveTask(id)',created['id']) is True,'edit real browser form')
  check(created['title']=='Editada pelo Chromium','edit reflected backend fixture')
  check(await owner.evaluate('(id)=>window.__a4Task.status(id)',created['id']) is True,'complete via Chromium')
  check(created['status']=='DONE','completed persisted')
  check(await owner.evaluate('(id)=>window.__a4Task.status(id)',created['id']) is True,'reopen via Chromium')
  check(created['status']=='OPEN','reopen persisted')
  viewerctx,viewer=await make_page(browser,VIEWER)
  check(await viewer.locator('#a4TaskCentral button').filter(has_text='Nova tarefa').count()==0,'read only viewer cannot create')
  check(await viewer.locator('[data-central-task]').count()>=1,'second independent Chromium session read')
  bigctx,big=await make_page(browser,BIG)
  check(await big.locator('[data-central-task="manual_centro_seed"]').count()==0,'Big does not display Centro')
  check(await big.locator('[data-central-task="manual_big_seed"]').count()==1,'Big sees own unit')
  # Simulate delayed Centro response, swap same browser to Big, ensure stale response cannot overwrite.
  await owner.evaluate("() => {window.__a4Task.invalidate()}")
  await authenticate(owner,CENTRO)
  delayed=True;gate.clear();hits=0
  await owner.evaluate("() => {window.__oldRefresh=window.__a4Task.refresh(true)}")
  for _ in range(100):
   if hits:break
   await asyncio.sleep(.03)
  check(hits>0,'Centro request actually delayed')
  await authenticate(owner,BIG)
  check(await owner.evaluate('window.__a4Task.refresh(true).then(()=>true)'),'new user not blocked by busy')
  check(await owner.locator('[data-central-task="manual_big_seed"]').count()==1,'new Big data visible')
  gate.set();delayed=False
  await owner.wait_for_timeout(150)
  check(await owner.locator('[data-central-task="manual_centro_seed"]').count()==0,'late Centro reply discarded')
  await authenticate(owner,CENTRO)
  await owner.evaluate("() => {window.__a4Task.invalidate();window.__a4Task.refresh(true)}")
  await owner.wait_for_function('window.__a4Task.counts().loaded>0')
  await owner.evaluate("window.__imperioCentralApi.disable()")
  check(await owner.locator('[data-central-task]').count()==0,'logout clears visible rows')
  check(await owner.evaluate("window.__a4Task.rows().length")==0,'logout invalidates cached rows')
  check(next(x for x in DATA if x['id']=='auto_centro')['status']=='OPEN','automatic task unchanged')
  check(any(x['id']=='legacy-1' for x in await owner.evaluate('db.managementTasks')),'local legacy preserved')
  print(json.dumps({'scenario':'A4 F01/F02 Chromium isolated UI and two sessions','checks':checks,'result':'PASS'}))
  await ownerctx.close();await viewerctx.close();await bigctx.close();await browser.close()

if __name__=='__main__':
 asyncio.run(main())
