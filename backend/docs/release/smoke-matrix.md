# BLOCO 3 - Smoke Matrix

## READ-ONLY SMOKE

| Area | Smoke | Evidence | Stop condition |
|---|---|---|---|
| AUTH | Load login, attempt authenticated session check with approved operator | HTTP status and role/unit payload | Auth unavailable or wrong role/unit scope |
| Centro | Read unit profile, catalog, professionals, workstations | HTTP 200 and canonical `centro` data | Missing canonical unit or catalog |
| Big | Read unit profile, catalog, professionals, workstations | HTTP 200 and canonical `big` data | Missing canonical unit or catalog |
| Shopping Contagem | Read unit profile, catalog, professionals, workstations | HTTP 200 and canonical `shopping-contagem` data | Missing canonical unit or catalog |
| cliente global | Search/read global client history without mutation | Response includes network-safe client projection | Client isolation or permission regression |
| histórico global | Read client/network history views | HTTP 200 and no cross-unit leak outside role | Missing history or unauthorized data exposure |
| Agenda cross-unit | Read agenda windows for all three units | Slots/bookings scoped by unit | Cross-unit leakage or missing records |
| public booking | Load public catalog and availability | HTTP 200 and no write side effect | Public path broken |
| comanda | Read open command list/detail | HTTP 200 and unit scoped totals | Financial data mismatch |
| pagamento | Read payment records and summaries | HTTP 200 and immutable payment trace | Payment trace missing |
| caixa | Read cash session summaries | HTTP 200 and unit scoped totals | Cash totals inconsistent |
| estoque | Read stock locations/products/balances | Central plus three unit stock locations visible | Missing stock foundation |
| relatórios | Read operational reports | HTTP 200 and expected empty state allowed | Report crash or unsafe leakage |

## WRITE SMOKE - OWNER AUTHORIZATION REQUIRED

| Area | Synthetic name/id pattern | Safe closeout | Hard rule |
|---|---|---|---|
| Booking | `AUDIT-B3-BOOKING-<timestamp>` | Cancel through normal business action | No hard delete |
| Comanda | `AUDIT-B3-COMMAND-<timestamp>` | Close or mark cancelled according to business flow | Preserve financial trail |
| Pagamento | `AUDIT-B3-PAYMENT-<timestamp>` | Use reversal/void flow if available | Do not erase payment audit |
| Caixa | `AUDIT-B3-CASH-<timestamp>` | Close session with note | Do not rewrite historical cash |
| Estoque | `AUDIT-B3-STOCK-<timestamp>` | Use transfer/adjustment reversal flow | Do not truncate or delete movements |
| WhatsApp | No write smoke in main cutover | Keep automation off unless later approved | No real number activation |
