# Bitácora de conciliación y acceso (financen-family)

Última actualización: 2026-11-17.

Este archivo es el registro persistente de lo que ya se hizo y lo que queda pendiente.
Si una tarea figure en **Pendiente**, no darla por cerrada hasta verificarla contra Firestore.

## Reglas que rigen el trabajo

- No crear movimientos ficticios ni borrar históricos.
- No duplicar transferencias ni ingresos (Ontop → Takenos, Takenos → Itaú, pagos de tarjeta desde Itaú).
- No cerrar diferencias cuya causa no esté confirmada con evidencia.
- No convertir pendientes en gastos/ingresos.
- Usar la tasa configurada (`fxRates.USD = 6089.39`) solo para equivalencias, sin modificar importes originales ni moneda.
- Todo cambio debe ser idempotente, con `--dry-run`/`--apply`, IDs deterministas y auditoría.

## Datos base

- Hogar: `497e6594-dfbe-49a4-a2a3-cb34604e4610`, moneda base PYG.
- Owner: `FcRxr3GQSqNyrZtmcPYAJv37fXg1` (`danyrojassimon@gmail.com`).
- Invitado: `GorD3ZcqCTW3jsq2jAZUn3vcZsg2` (`isaux13@gmail.com`).
- Allowlist: `isaux13@gmail.com`, `danyrojassimon@gmail.com` (`src/domain/access.ts` + `firestore.rules`).
- Dominios autorizados en Firebase Auth: `localhost`, `financen-family.firebaseapp.com`, `financen-family.web.app`, `financen-family.vercel.app`.

## Hecho

### Conciliación previa (aplicada en Firestore)

- Anclas con `balanceAsOf = 2026-11-17T02:59:59.999Z`:
  - Itaú `initialBalanceMinor = 742299`
  - Takenos `initialBalanceMinor = 64000`
  - Ontop `initialBalanceMinor = 7000`
- Ajustes provisionales conservados como históricos:
  - `tx_2026-11-16_ajuste_itau` → G. -1.992.413
  - `tx_2026-11-16_ajuste_takenos` → USD -1.384,33
  - `tx_2026-11-13_ajuste_ontop` → USD -18,07
- `scripts/reconcile-balances.cjs` ejecutado con `--apply`: 3 anclas, 7 ítems de conciliación, 3 auditorías. Segunda pasada: 0 escrituras (idempotente).
- 7 `reconciliationItems` creados, todos en `open`:
  - `recon_itau_provisional`, `recon_takenos_provisional`, `recon_ontop_provisional`
  - `recon_transfer_onop_takenos_usd2`, `recon_transfer_takenos_itau_fx89`
  - `recon_card_mastercard_104400`, `recon_takenos_reference_usd8`

### Código y reglas

- `cardStatementRange` corregido: si `dueDay > closingDay`, el vencimiento cae en el mes del cierre (Cooperativa 10/12/2026, Mastercard 15/12/2026, Caja Mutual 01/12/2026).
- `UpcomingItem.isIncome` agregado y `commitmentsMinor` excluye ingresos y tarjetas: compromisos pasaron de G. 32.327.913 a G. 13.659.223.
- Ahorros/inversiones se muestran separados y no entran en liquidez total.
- Reglas de `reconciliationItems` agregadas, compiladas y desplegadas (`npm run deploy:rules` equivalente).
- Refuerzo de vehículo G. 8.400.000 ya existe como `pending` del 01/12/2026. No crear otro.
- Usuario decidió **no** cambiar tema claro/oscuro.

### Invitación (`permission-denied`)

- Invitación verificada en producción: ID `0e651b5n3x1w6f2k2q0q3r2k2o4o3x5q441l`, email `isaux13@gmail.com`, `status = pending`, vence `2026-11-24T13:53:34.874Z`, `acceptedBy = null`. No existe aún `members/{uid}` de Isa.
- Reglas verificadas en emulador (lectura y batch de aceptación 200/200/200) y en producción con ID token real de `isaux13@gmail.com` (HTTP 200). No son las reglas.
- App Check descartado: API deshabilitada y `VITE_FIREBASE_APP_CHECK_SITE_KEY` vacío.
- Causa concluida: sesión/caché previa del navegador (el invitado abrió el link antes de iniciar sesión o con otra cuenta).
- Fix aplicado: `getInvitation` usa `getDocFromServer` para evitar el `persistentLocalCache`; el join page muestra el botón “Cerrar sesión e ingresar de nuevo”.
- Validación: `npm run typecheck` ✅, `npm test` 43/43 ✅, `npm run build` ✅.
- Build desplegado en Firebase Hosting: **https://financen-family.web.app** (chunk `join-page-DP5elOVi.js` verificado).

## Pendiente

### Financiero (nueva evidencia aún no incorporada)

No se escribió ni aplicó el nuevo script. Sigue todo en `open`:

- Takenos 01/10–12/11: inicial USD 0,00; ingresos USD 2.520,06; egresos USD 1.849,55; final USD 670,51; referencia actual USD 640 → diferencia temporal USD 30,51.
- 06/11 ACH +498,00 y transferencia a Daniel -490,00; 09/11 ACH +2.012,33 y transferencia a Daniel -1.340,40; 11/11 QQQ -9,92; 12/11 QQQ +9,73 y SPY -9,23 (inversión, no gasto).
- Ontop → Takenos: USD 500→498 y USD 2.014,33→2.012,33; total enviado USD 2.514,33, acreditado USD 2.510,33; diferencia USD 4,00 sin clasificar.
- Ontop: salario USD 2.614,33; Google One USD 3,94; Amazon USD 7,99; Future Fund USD 10,00; residual USD 8,07 a verificar.
- Itaú CSV: 30/10 Caja Mutual G. 2.005.436; 30/10 Cooperativa G. 3.549.954; 06/11 Caja Mutual G. 565.000; 06/11 Nissan G. 1.767.600; 06/11 `PAGO PRESTAMO - DIGITAL` G. 677.567; 09/11 ídem G. 3.513.826 y G. 1.008.127; 09/11 SPI G. 2.625.404; 06/11 transferencia recibida G. 2.983.711 desde USD 490. El CSV no incluye saldo inicial/final.
- Transferencias ya existentes (no duplicar): `tx_2026-11-06_transfer_ontop_takenos_1` USD 2.014,33, `tx_2026-11-06_transfer_ontop_takenos_2` USD 500, `tx_2026-11-16_transfer_takenos_itau` USD 490 (`toAmountMinor = 2983712`).
- Destino económico de la transferencia USD 1.340,40: pendiente.
- Débitos de Itaú: **no asignar a préstamos específicos sin certeza**.
- No hay movimientos `loan_payment`. Capital de préstamos G. 411.980.537; deuda de tarjetas G. 6.486.981 antes de los dos movimientos nuevos del 17/11.

Pendientes que deben permanecer abiertos hasta confirmación:

- Itaú G. 1.992.413
- Mastercard G. 104.400
- Takenos USD 4,00
- Diferencia temporal USD 30,51
- FX G. 89,37
- Ontop residual USD 8,07
- Saldos sin extracto reciente

Movimientos creados por el usuario el 17/11 (ya existen, no recrear):

- `2ef7d4f4-2d60-46a9-b4f2-fe85c6fb12f4` — `expense` G. 799.450 en `card_coop_ypac` (“Sendit - Pedidos de David”).
- `627455dd-2f8f-4a08-a224-ab6bc8a6834d` — `expense` G. 20.000 en `acc_itau` (“Regalo para Gia Scout”).

Con el ancla al cierre del 16/11, esos dos movimientos impactan: Itaú quedaría G. 722.299 y deuda Cooperativa G. 3.049.637.

### Invitación

- Confirmar con Isa que el link de `financen-family.web.app` funciona (o que el botón de re-login la destraba).
- `financen-family.vercel.app` sigue con el build anterior. Para actualizarlo hace falta un `VERCEL_OIDC_TOKEN` vigente (el de `.env.local` venció el 16/11 15:14 UTC).
- Si sigue fallando: revocar y recrear la invitación para generar link nuevo (no hecho; requiere confirmación).

### Evidencias y casa

- No se encontraron archivos reales de la captura de Ontop ni los CSV en Downloads/Desktop/Documents/repo/temp. Se usó solo el contenido pegado en el chat. Si se requieren como respaldo físico, pedir rutas/archivos.
- Todos los cambios siguen sin commitear; no se hicieron commits ni push.
- `financen-family.json` contiene la clave privada de la service account versionada en el repo: riesgo reportado, pendiente de decidir su tratamiento.

## Próximo paso sugerido

1. Escribir el script nuevo sobre `scripts/reconcile-balances.cjs`, con IDs deterministas, auditoría, `source` apuntando al extracto/captura y `--dry-run`/`--apply`.
2. Comparar cada movimiento de la evidencia contra los 29 existentes por ID/fecha/importe/cuenta/descripción; crear solo lo faltante y actualizar ítems de conciliación sin sobrescribir resoluciones.
3. Dry-run → verificar 0 duplicados → apply → segunda pasada de idempotencia → `npm run typecheck`, `npm test`, `npm run build`.
4. Presentar pendientes/incorporados sin cerrar causas no confirmadas.
