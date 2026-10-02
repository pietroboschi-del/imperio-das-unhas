import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(repoRoot,'index.html'),'utf8');
let tests=0;const ok=(v,m)=>{tests++;if(!v)throw new Error(m)};
const marker='/* ===== V99 · CLIENTS_ONLY · CONSOLE OPERACIONAL DE DRY-RUN ===== */';
const first=html.indexOf(marker),second=html.indexOf(marker,first+marker.length);
ok(first>=0&&second>first,'bloco visual e script da console CLIENTS_ONLY presentes');
const scriptEnd=html.indexOf('</script>',second);
ok(scriptEnd>second,'script da console possui fechamento');
const js=html.slice(second+marker.length,scriptEnd);
new Function(js);tests++;

ok(js.includes("const ROUTE='/api/v1/migrations/v94/clients/batches/excel/dry-run'"),'UI chama somente endpoint Excel dry-run');
ok(!js.includes('/clients/batches/commit'),'UI não expõe endpoint de commit');
ok(js.includes("commitExposed:false"),'contrato declara commit indisponível');
ok(js.includes("principal()?.networkAdmin===true"),'execução exige administrador de rede central');
ok(js.includes("window.__imperioV63?.currentUser?.()?.role==='admin'"),'UI exige perfil Administração local');
ok(js.includes("sessionStorage.getItem(CSRF_KEY)"),'CSRF vem apenas da sessão da aba');
ok(js.includes("credentials:'include'"),'requisição usa cookie HttpOnly do backend');
ok(js.includes("new FormData()"),'upload usa multipart FormData');
ok(js.includes("form.append('manifest',JSON.stringify(manifest))"),'manifest de batch acompanha arquivos');
ok(js.includes("for(const x of files)form.append('files',x.file,x.file.name)"),'arquivos preservam nome original');
ok(js.includes("{id:'centro',label:'Centro de Contagem'}")&&js.includes("{id:'big',label:'Big Shopping'}")&&js.includes("{id:'shopping-contagem',label:'Shopping Contagem'}"),'três unidades oficiais disponíveis');
ok(js.includes('BATCH_1_REHEARSAL'),'batch inicial padrão é rehearsal');
ok(js.includes('PRE_CUTOVER')&&js.includes('FINAL · dry-run'),'fases futuras suportadas sem promoção');
ok(js.includes('sourceUpdatedAtReliable'),'confiabilidade do updatedAt configurável por arquivo');
ok(js.includes('sheetName'),'planilha específica pode ser informada por unidade');
ok(js.includes('reportHash'),'hash de aprovação é exibido');
ok(js.includes("'/api/v1/migrations/v94/clients/batches/'+encodeURIComponent(batchId)+'/report'"),'relatório persistido pode ser recarregado sem reenviar Excel');
ok(js.includes('v99ClientsReloadReport'),'UI expõe recarga somente leitura do relatório');
ok(js.includes('Diagnóstico dos conflitos')&&js.includes('candidateClusterIds'),'conflitos exibem diagnóstico e candidatos relacionados');
ok(js.includes('sourceRows')&&js.includes('Cliente / linha'),'conflitos exibem cliente e linha de origem');
ok(js.includes('slice(0,limit)')&&js.includes('limit=300'),'renderização de conflitos é limitada para não travar navegador');

ok(js.includes('unmappedHeaders')&&js.includes('duplicateCanonicalHeaders'),'mapeamento de colunas é auditável');
ok(js.includes('snapshotDiff')&&js.includes('missingFromNewSnapshot'),'comparação de snapshots é exibida');
ok(js.includes('report.conflicts')&&js.includes('REVIEW_REQUIRED'),'conflitos são exibidos para conferência');
ok(!js.includes('localStorage.setItem'),'console não persiste dados de clientes no navegador');
ok(!js.includes('db.clients.push')&&!js.includes('db.clients='),'console não altera clientes locais');
ok(!js.includes('MIGRATION_IMPORT_ENABLED')&&!js.includes('CLIENT_BATCH_COMMIT_ENABLED'),'UI não tenta abrir gates de importação');
ok(js.includes('getLastResult:()=>lastResult'),'resultado fica somente em memória da sessão da página');

ok(js.includes('/api/v1/admin/database-backup')&&js.includes('Baixar backup lógico (.dump)'),'admin pode baixar backup lógico gratuito antes da migração');
ok(js.includes('URL.createObjectURL(blob)')&&js.includes('v99DatabaseBackup'),'backup é baixado como arquivo no navegador');
console.log(JSON.stringify({ok:true,tests,feature:'v99_clients_migration_ui_dry_run_only'}));
