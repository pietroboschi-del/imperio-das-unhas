const ROLE_ALLOWED: Record<string,string[]> = {
  admin: [
    'page.agenda','page.clients','page.pros','page.services','page.cash','page.stock','page.finance','page.reports','page.actions','page.settings',
    'pros.cadastro','pros.commissions','cash.current','cash.movements','cash.closures',
    'stock.overview','stock.products','stock.families','stock.purchases','stock.requests','stock.transfers','stock.inventory',
    'finance.entries','finance.accounts','finance.dre','finance.goals','finance.insights','finance.payments','finance.cnpjs','finance.invoices',
    'reports.overview','reports.clients','reports.retention','reports.agenda','reports.pros','reports.services','reports.stock','reports.finance','reports.marketing','reports.audit',
    'action.agenda.edit','action.clients.edit','action.pros.edit','action.pros.commissions.edit','action.services.edit',
    'action.cash.open','action.cash.adjust','action.cash.close','action.cash.reopen',
    'action.finance.entry.create','action.finance.accounts.edit','action.finance.receivables.settle',
    'action.stock.purchase','action.stock.request','action.stock.transfer','action.stock.inventory','action.tasks.create','action.tasks.complete',
  ],
  manager: [
    'page.agenda','page.clients','page.pros','page.services','page.cash','page.reports','page.actions',
    'pros.cadastro','cash.current','cash.movements','cash.closures',
    'reports.overview','reports.clients','reports.retention','reports.agenda','reports.pros','reports.services','reports.marketing',
    'action.agenda.edit','action.clients.edit','action.pros.edit','action.services.edit','action.cash.open','action.cash.adjust','action.cash.close','action.tasks.create','action.tasks.complete',
  ],
  reception: [
    'page.agenda','page.clients','page.services','page.cash','page.actions','cash.current','cash.movements',
    'action.agenda.edit','action.clients.edit','action.cash.open','action.cash.close','action.tasks.create','action.tasks.complete',
  ],
  finance: [
    'page.finance','page.reports','page.actions','finance.entries','finance.accounts','finance.dre','finance.goals','finance.insights','finance.payments','finance.cnpjs','finance.invoices','reports.overview','reports.finance',
    'action.finance.entry.create','action.finance.accounts.edit','action.finance.receivables.settle','action.tasks.create','action.tasks.complete',
  ],
  stock: [
    'page.stock','page.reports','page.actions','stock.overview','stock.products','stock.families','stock.purchases','stock.requests','stock.transfers','stock.inventory','reports.overview','reports.stock',
    'action.stock.purchase','action.stock.request','action.stock.transfer','action.stock.inventory','action.tasks.create','action.tasks.complete',
  ],
};

function legacyEffective(user: any): Set<string> {
  const role = String(user?.role || 'reception').toLowerCase();
  const base = new Set(ROLE_ALLOWED[role] || ROLE_ALLOWED.reception);
  if (role === 'admin') return base;
  if (user?.permissionMode === 'custom' && user?.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)) {
    for (const [key,value] of Object.entries(user.permissions)) {
      if (value === true) base.add(key); else if (value === false) base.delete(key);
    }
  }
  return base;
}

export function legacySystemRole(user:any): 'ADMINISTRATIVE' | 'OPERATOR' {
  const role=String(user?.role||'').toLowerCase();
  return role==='admin'||role==='finance' ? 'ADMINISTRATIVE' : 'OPERATOR';
}

export function mapLegacyPermissions(user:any): string[] {
  const old=legacyEffective(user), out=new Set<string>();
  const add=(permission:string,...legacyKeys:string[])=>{if(legacyKeys.some(key=>old.has(key)))out.add(permission)};
  add('units.read','page.agenda','page.clients','page.pros','page.services','page.cash','page.stock','page.finance','page.reports');
  add('catalog.read','page.services','page.agenda','page.clients');
  add('catalog.manage','action.services.edit');
  add('professionals.read','page.pros','reports.pros','page.agenda');
  add('professionals.manage','action.pros.edit');
  add('professionals.compensation.manage','action.pros.commissions.edit');
  add('clients.read','page.clients','reports.clients','reports.retention');
  add('clients.manage','action.clients.edit');
  add('agenda.read','page.agenda','reports.agenda');
  add('agenda.manage','action.agenda.edit');
  add('cash.read','page.cash','cash.current','cash.movements','cash.closures');
  add('cash.open','action.cash.open');
  add('cash.adjust','action.cash.adjust');
  add('cash.close','action.cash.close');
  add('cash.reopen','action.cash.reopen');
  add('finance.read','page.finance','reports.finance');
  add('finance.manage','action.finance.entry.create','action.finance.accounts.edit');
  add('finance.receivables.settle','action.finance.receivables.settle');
  add('stock.read','page.stock','reports.stock');
  add('stock.manage','action.stock.purchase','action.stock.request','action.stock.transfer','action.stock.inventory');
  add('reports.read','page.reports');
  add('tasks.read','page.actions');
  add('tasks.manage','action.tasks.create','action.tasks.complete');
  // Intencionalmente NÃO concedemos users.manage, migration.manage ou integrations.configure a usuários legados.
  return [...out].sort();
}
