/**
 * Conciliacion del hogar: ancla los saldos informados y registra las
 * diferencias pendientes SIN borrar ni alterar los ajustes provisionales.
 *
 * Uso:
 *   node scripts/reconcile-balances.cjs            -> dry-run (no escribe)
 *   node scripts/reconcile-balances.cjs --apply    -> aplica los cambios
 *
 * Idempotente: si el ancla o el item ya existe con el valor esperado, no hace
 * nada. Los items ya existentes NUNCA se sobrescriben (preserva resoluciones).
 */
const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')

const ROOT = path.resolve(__dirname, '..')
// firebase-admin vive en functions/, no en la raiz del proyecto.
const requireFromFunctions = createRequire(path.join(ROOT, 'functions/package.json'))
const { initializeApp, cert, getApps } = requireFromFunctions('firebase-admin/app')
const { getFirestore, Timestamp } = requireFromFunctions('firebase-admin/firestore')

const SERVICE_ACCOUNT = path.join(ROOT, 'financen-family.json')
const HID = '497e6594-dfbe-49a4-a2a3-cb34604e4610'
const OWNER_UID = 'FcRxr3GQSqNyrZtmcPYAJv37fXg1'
const OWNER_NAME = 'Daniel Rojas'
const FX_USD = 6089.39
const BASE_CURRENCY = 'PYG'

// Cierre del 16/11/2026 en America/Asuncion (UTC-3): 2026-11-17T02:59:59.999Z
const ANCHOR_AT = new Date('2026-11-17T02:59:59.999Z')

const ANCHORS = [
  { id: 'acc_itau', name: 'Itaú', currency: 'PYG', initialBalanceMinor: 742299 },
  { id: 'acc_takenos', name: 'Takenos', currency: 'USD', initialBalanceMinor: 64000 },
  // USD 70,00 informados al 13/11. Incluye el ajuste USD 18,07 no comprobado.
  { id: 'acc_ontop', name: 'Ontop', currency: 'USD', initialBalanceMinor: 7000 },
]

const EXPECTED_ADJUSTMENTS = [
  { id: 'tx_2026-11-16_ajuste_itau', amountMinor: -1992413, currency: 'PYG' },
  { id: 'tx_2026-11-16_ajuste_takenos', amountMinor: -138433, currency: 'USD' },
  { id: 'tx_2026-11-13_ajuste_ontop', amountMinor: -1807, currency: 'USD' },
]

const EXPECTED_TRANSFER = {
  id: 'tx_2026-11-16_transfer_takenos_itau',
  from: 'acc_takenos',
  to: 'acc_itau',
  amountMinor: 49000,
  toAmountMinor: 2983712,
}

const EXPECTED_TRANSFER_USD2 = {
  id: 'tx_2026-11-06_transfer_ontop_takenos_2',
  from: 'acc_ontop',
  to: 'acc_takenos',
  amountMinor: 50000,
}

/** Diferencias a conservar como pendientes (no son movimientos). */
const RECONCILIATION_ITEMS = [
  {
    id: 'recon_itau_provisional',
    title: 'Itaú: ajuste provisional pendiente de reemplazo',
    detail:
      'G. -1.992.413 registrados el 16/11 para cerrar contra el saldo informado. ' +
      'El saldo real G. 742.299 quedó anclado al 16/11 y el ajuste se conserva como histórico. ' +
      'Reemplazar por los débitos y pagos reales cuando esté el extracto completo.',
    kind: 'account',
    referenceId: 'acc_itau',
    amountMinor: -1992413,
    currency: 'PYG',
    source: 'tx_2026-11-16_ajuste_itau',
  },
  {
    id: 'recon_takenos_provisional',
    title: 'Takenos: salidas sin identificar',
    detail:
      'USD -1.384,33 registrados como cierre provisional. Sólo se documentó la salida de USD 490. ' +
      'Faltan fecha, importe, destinatario y comisión de las salidas restantes. ' +
      'El saldo USD 640 quedó anclado al 16/11; el ajuste se conserva como histórico.',
    kind: 'account',
    referenceId: 'acc_takenos',
    amountMinor: -138433,
    currency: 'USD',
    source: 'tx_2026-11-16_ajuste_takenos',
  },
  {
    id: 'recon_ontop_provisional',
    title: 'Ontop: diferencia USD 18,07 sin comprobante',
    detail:
      'USD -18,07 registrados el 13/11 por movimientos no registrados. ' +
      'El saldo informado USD 70 quedó anclado al 16/11; el ajuste se conserva como histórico.',
    kind: 'account',
    referenceId: 'acc_ontop',
    amountMinor: -1807,
    currency: 'USD',
    source: 'tx_2026-11-13_ajuste_ontop',
  },
  {
    id: 'recon_transfer_onop_takenos_usd2',
    title: 'Transferencia Ontop → Takenos (parte 2): USD 2 acreditados de menos',
    detail:
      'Se enviaron USD 500 y Takenos acreditó USD 498. Los USD 2 de diferencia quedan dentro ' +
      'de las salidas pendientes. No se asume comisión ni se registra como gasto.',
    kind: 'account',
    referenceId: 'acc_takenos',
    amountMinor: 200,
    currency: 'USD',
    source: 'tx_2026-11-06_transfer_ontop_takenos_2',
  },
  {
    id: 'recon_transfer_takenos_itau_fx89',
    title: 'Transferencia Takenos → Itaú: G. 89 de diferencia de cambio',
    detail:
      'Conversión exacta G. 2.983.801 contra G. 2.983.712 efectivamente acreditados. ' +
      'No se registra como gasto.',
    kind: 'other',
    referenceId: 'tx_2026-11-16_transfer_takenos_itau',
    amountMinor: 89,
    currency: 'PYG',
    source: 'tx_2026-11-16_transfer_takenos_itau',
  },
  {
    id: 'recon_card_mastercard_104400',
    title: 'Mastercard Sudameris: G. 104.400 sin movimiento identificado',
    detail:
      'Deuda informada G. 3.445.837 contra compras y cargos G. 3.341.437 al 13/11. ' +
      'No se registra como gasto ni como saldo hasta explicar la diferencia.',
    kind: 'card',
    referenceId: 'card_mc_sudameris',
    amountMinor: 104400,
    currency: 'PYG',
    source: 'tx_2026-11-13_ajuste_deuda_sudameris',
  },
  {
    id: 'recon_takenos_reference_usd8',
    title: 'Takenos: referencia posterior de USD 8 sin movimiento',
    detail:
      'Existe una referencia de saldo posterior de USD 8 que no se usa como saldo ' +
      'hasta conciliar el movimiento que la explica.',
    kind: 'account',
    referenceId: 'acc_takenos',
    amountMinor: 800,
    currency: 'USD',
    source: 'Nota de la cuenta acc_takenos',
  },
]

const AUDIT_FOR_ADJUSTMENT = {
  'tx_2026-11-16_ajuste_itau': 'recon_itau_provisional',
  'tx_2026-11-16_ajuste_takenos': 'recon_takenos_provisional',
  'tx_2026-11-13_ajuste_ontop': 'recon_ontop_provisional',
}

const money = (amount, currency) =>
  currency === 'USD'
    ? `USD ${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : `G. ${amount.toLocaleString('es-PY')}`

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (value.__timestamp) return new Date(value.__timestamp)
  if (value instanceof Date) return value
  return null
}

function convertToBase(amountMinor, currency) {
  if (currency === BASE_CURRENCY) return amountMinor
  if (currency === 'USD') return Math.round((amountMinor * FX_USD) / 100)
  throw new Error(`Moneda no soportada: ${currency}`)
}

function computeDeltas(transactions, accounts) {
  const deltas = new Map()
  const cutoffs = new Map(
    accounts
      .filter((account) => toDate(account.balanceAsOf))
      .map((account) => [account.id, toDate(account.balanceAsOf).getTime()]),
  )
  const add = (accountId, amount, at) => {
    if (!accountId || !Number.isFinite(amount) || amount === 0) return
    const cutoff = cutoffs.get(accountId)
    if (cutoff !== undefined && at.getTime() <= cutoff) return
    deltas.set(accountId, (deltas.get(accountId) ?? 0) + Math.trunc(amount))
  }
  for (const tx of transactions) {
    if (tx.deletedAt || tx.status !== 'confirmed') continue
    const date = toDate(tx.date)
    if (!date) continue
    const destinationAmount = tx.toAmountMinor ?? tx.amountMinor
    switch (tx.type) {
      case 'expense':
        if (!tx.cardId) add(tx.accountId, -tx.amountMinor, date)
        break
      case 'income':
        if (!tx.cardId) add(tx.accountId, tx.amountMinor, date)
        break
      case 'transfer':
      case 'savings_contribution':
      case 'savings_withdrawal':
        add(tx.accountId, -tx.amountMinor, date)
        add(tx.toAccountId, destinationAmount, date)
        break
      case 'withdrawal':
        add(tx.toAccountId, destinationAmount, date)
        break
      case 'card_payment':
      case 'loan_payment':
        add(tx.accountId, -tx.amountMinor, date)
        break
      case 'adjustment':
        if (!tx.cardId) add(tx.accountId, tx.amountMinor, date)
        break
      default:
        break
    }
  }
  return deltas
}

function computeBalances(accounts, transactions) {
  const deltas = computeDeltas(transactions, accounts)
  return accounts.map((account) => {
    const currentMinor = account.initialBalanceMinor + (deltas.get(account.id) ?? 0)
    return {
      id: account.id,
      name: account.name,
      currency: account.currency,
      type: account.type,
      includeInAvailable: account.includeInAvailable,
      currentMinor,
      baseMinor: convertToBase(currentMinor, account.currency),
      deltaMinor: deltas.get(account.id) ?? 0,
    }
  })
}

function printBalances(label, balances) {
  console.log(`\n===== ${label} =====`)
  let bank = 0
  let cash = 0
  let wallet = 0
  let savings = 0
  let investment = 0
  for (const b of balances) {
    const group =
      b.type === 'savings'
        ? 'savings'
        : b.type === 'investment'
          ? 'investment'
          : b.includeInAvailable === false
            ? 'excluded'
            : b.type === 'cash'
              ? 'cash'
              : b.type === 'wallet'
                ? 'wallet'
                : b.type === 'bank'
                  ? 'bank'
                  : 'other'
    if (group === 'bank') bank += b.baseMinor
    if (group === 'cash') cash += b.baseMinor
    if (group === 'wallet') wallet += b.baseMinor
    if (group === 'savings') savings += b.baseMinor
    if (group === 'investment') investment += b.baseMinor
    console.log(
      `  ${b.name.padEnd(30)} ${money(b.currentMinor, b.currency).padStart(18)}` +
        ` = ${money(b.baseMinor, 'PYG').padStart(18)}  delta=${b.deltaMinor}`,
    )
  }
  console.log(`  Bancos+efectivo: ${money(bank + cash, 'PYG')}`)
  console.log(`  Billeteras:      ${money(wallet, 'PYG')}`)
  console.log(`  LIQUIDEZ TOTAL:  ${money(bank + cash + wallet, 'PYG')}`)
  console.log(`  Ahorros:         ${money(savings, 'PYG')}`)
  console.log(`  Inversiones:     ${money(investment, 'PYG')}`)
  console.log(`  NO LIQUIDO:      ${money(savings + investment, 'PYG')}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(`PREFLIGHT FALLÓ: ${message}`)
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`Modo: ${apply ? 'APLICAR CAMBIOS' : 'DRY-RUN (sin escritura)'}`)

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'))) })
  }
  const db = getFirestore()
  const householdRef = db.collection('households').doc(HID)
  const col = (name) => householdRef.collection(name)

  // ---------- Preflight: solo lectura ----------
  const household = await householdRef.get()
  assert(household.exists, `No existe el hogar ${HID}`)
  const householdData = household.data()
  assert(householdData.baseCurrency === BASE_CURRENCY, 'La moneda base no es PYG')
  assert(Math.abs(householdData.fxRates.USD - FX_USD) < 0.001, 'La tasa USD configurada cambió')

  const accountsSnapshot = await col('accounts').get()
  const accounts = accountsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  const transactionsSnapshot = await col('transactions').get()
  const transactions = transactionsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  const reconSnapshot = await col('reconciliationItems').get()
  const existingRecon = new Set(reconSnapshot.docs.map((doc) => doc.id))

  for (const anchor of ANCHORS) {
    assert(accounts.some((account) => account.id === anchor.id), `Falta la cuenta ${anchor.id}`)
  }
  for (const adjustment of EXPECTED_ADJUSTMENTS) {
    const found = transactions.find((tx) => tx.id === adjustment.id)
    assert(found, `Falta el ajuste ${adjustment.id}`)
    assert(
      found.amountMinor === adjustment.amountMinor && found.currency === adjustment.currency,
      `El ajuste ${adjustment.id} cambió (encontrado ${found.amountMinor} ${found.currency})`,
    )
    assert(found.status === 'confirmed' && !found.deletedAt, `El ajuste ${adjustment.id} no está activo`)
  }
  const transfer = transactions.find((tx) => tx.id === EXPECTED_TRANSFER.id)
  assert(transfer, 'Falta la transferencia Takenos → Itaú')
  assert(
    transfer.accountId === EXPECTED_TRANSFER.from &&
      transfer.toAccountId === EXPECTED_TRANSFER.to &&
      transfer.amountMinor === EXPECTED_TRANSFER.amountMinor &&
      transfer.toAmountMinor === EXPECTED_TRANSFER.toAmountMinor,
    'La transferencia Takenos → Itaú cambió',
  )
  const transferUsd2 = transactions.find((tx) => tx.id === EXPECTED_TRANSFER_USD2.id)
  assert(transferUsd2, 'Falta la transferencia Ontop → Takenos (parte 2)')
  assert(
    transferUsd2.accountId === EXPECTED_TRANSFER_USD2.from &&
      transferUsd2.toAccountId === EXPECTED_TRANSFER_USD2.to &&
      transferUsd2.amountMinor === EXPECTED_TRANSFER_USD2.amountMinor,
    'La transferencia Ontop → Takenos (parte 2) cambió',
  )

  const proposedAccounts = accounts.map((account) => {
    const anchor = ANCHORS.find((candidate) => candidate.id === account.id)
    return anchor
      ? { ...account, initialBalanceMinor: anchor.initialBalanceMinor, balanceAsOf: ANCHOR_AT }
      : account
  })

  printBalances('ANTES (estado actual en Firestore)', computeBalances(accounts, transactions))
  printBalances('DESPUÉS (con anclas propuestas)', computeBalances(proposedAccounts, transactions))

  console.log('\n===== CAMBIOS PLANIFICADOS =====')
  const now = Timestamp.now()
  const batch = db.batch()
  let writes = 0

  for (const anchor of ANCHORS) {
    const account = accounts.find((candidate) => candidate.id === anchor.id)
    const currentAsOf = toDate(account.balanceAsOf)
    const alreadyAnchored =
      account.initialBalanceMinor === anchor.initialBalanceMinor &&
      currentAsOf &&
      currentAsOf.getTime() === ANCHOR_AT.getTime()
    if (alreadyAnchored) {
      console.log(`  [SKIP] ancla ${anchor.name}: ya aplicada`)
      continue
    }
    console.log(
      `  [SET]  ancla ${anchor.name}: initialBalanceMinor ${account.initialBalanceMinor} -> ${anchor.initialBalanceMinor}, balanceAsOf -> 16/11/2026 EOD`,
    )
    batch.update(col('accounts').doc(anchor.id), {
      initialBalanceMinor: anchor.initialBalanceMinor,
      balanceAsOf: Timestamp.fromDate(ANCHOR_AT),
      updatedAt: now,
      updatedBy: OWNER_UID,
    })
    writes++
  }

  for (const item of RECONCILIATION_ITEMS) {
    if (existingRecon.has(item.id)) {
      console.log(`  [SKIP] item ${item.id}: ya existe (no se sobrescribe)`)
      continue
    }
    console.log(`  [ADD]  item ${item.id}: ${item.title}`)
    batch.set(col('reconciliationItems').doc(item.id), {
      title: item.title,
      detail: item.detail,
      status: 'open',
      kind: item.kind,
      referenceId: item.referenceId,
      amountMinor: item.amountMinor,
      currency: item.currency,
      source: item.source,
      createdAt: now,
      updatedAt: now,
      updatedBy: OWNER_UID,
    })
    writes++
  }

  for (const [txId, itemId] of Object.entries(AUDIT_FOR_ADJUSTMENT)) {
    const auditId = `audit_${itemId}`
    const auditRef = col('transactions').doc(txId).collection('audit').doc(auditId)
    const existingAudit = await auditRef.get()
    if (existingAudit.exists) {
      console.log(`  [SKIP] auditoría ${auditId}: ya existe`)
      continue
    }
    console.log(`  [ADD]  auditoría en ${txId} -> ${itemId}`)
    batch.set(auditRef, {
      action: 'updated',
      by: OWNER_UID,
      byName: OWNER_NAME,
      at: now,
      summary:
        'Ajuste provisional conservado como histórico. El saldo informado quedó anclado al ' +
        `16/11/2026 y se registró la pendiente ${itemId}. No se borró ni cambió el estado del movimiento.`,
      changes: [
        { field: 'reconciliationItem', from: null, to: itemId },
        { field: 'balanceAnchoredAt', from: null, to: '2026-11-16T23:59:59-03:00' },
      ],
    })
    writes++
  }

  console.log(`\nTotal de escrituras: ${writes}`)
  if (!apply) {
    console.log('DRY-RUN: no se escribió nada. Ejecutá con --apply para aplicar.')
    return
  }
  if (writes === 0) {
    console.log('Nada que aplicar: la migración ya está completa.')
    return
  }

  await batch.commit()
  console.log('CAMBIOS APLICADOS.')

  // Verificación posterior leyendo el estado real.
  const afterAccounts = (await col('accounts').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  const afterRecon = (await col('reconciliationItems').get()).docs.map((doc) => doc.id)
  printBalances('VERIFICACIÓN FINAL (leído desde Firestore)', computeBalances(afterAccounts, transactions))
  console.log(`Items de conciliación presentes: ${afterRecon.length}`)
  for (const anchor of ANCHORS) {
    const account = afterAccounts.find((candidate) => candidate.id === anchor.id)
    const asOf = toDate(account.balanceAsOf)
    assert(account.initialBalanceMinor === anchor.initialBalanceMinor, `Verificación falló en ${anchor.id}`)
    assert(asOf && asOf.getTime() === ANCHOR_AT.getTime(), `Verificación de fecha falló en ${anchor.id}`)
  }
  for (const item of RECONCILIATION_ITEMS) {
    assert(afterRecon.includes(item.id), `Falta el item ${item.id} después de aplicar`)
  }
  console.log('VERIFICACIÓN OK')
}

main().catch((error) => {
  console.error('\nERROR:', error.message)
  process.exitCode = 1
})
