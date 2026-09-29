# V87 — Migration

- `schemaVersion`: 87
- Migration ID: `v87-waitlist-opportunity-trace-recovery`
- Nova coleção: `waitlistOpportunities`
- Idempotente: sim
- Destrutiva: não
- Backfill fabricado: não

Na primeira abertura:
1. registra a nova coleção como coleção persistível;
2. garante `db.waitlistOpportunities = []` quando ausente;
3. adiciona um único marcador em `migrationHistory`;
4. avança o schema para 87;
5. adota somente oportunidades V80 **atualmente ativas e observáveis**, marcando-as como `UNKNOWN_LEGACY` quando a origem anterior não pode ser demonstrada.

Reabrir um banco já atualizado não duplica migration, coleção ou oportunidade atual.
