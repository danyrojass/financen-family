# Arquitectura — Finanzas del Hogar

Documento técnico de referencia. Describe las decisiones, los datos, el motor contable, la seguridad y las operaciones de la aplicación.

---

## 1. Objetivos y no objetivos

### Objetivos

- Registrar finanzas de un hogar compartido por dos o más personas con aislamiento estricto por hogar.
- Evitar la doble contabilidad y los saldos inconsistentes.
- Soportar PYG y USD sin errores de punto flotante.
- Funcionar en móvil, como PWA instalable, con soporte offline para el shell y caché de Firestore.
- Permitir carga rápida por voz sin depender de un servicio de IA ni de claves secretas en el frontend.
- Mantener trazabilidad de quién creó, editó, borró o restauró cada movimiento.
- Poder desplegarse en Vercel con Firebase como backend.

### No objetivos

- No es un ERP ni un sistema de contabilidad formal con partida doble.
- No concilia extractos bancarios ni se conecta a APIs de bancos.
- No gestiona inversiones con valuación de mercado.
- No reemplaza asesoramiento contable, impositivo o financiero.
- No busca ser una app multi-tenant pública con miles de hogares por usuario; el modelo está pensado para un hogar familiar.

---

## 2. Vista general

```text
┌─────────────────────────────────────────────────────────────┐
│ Navegador (React 19 + Vite + Tailwind)                      │
│                                                             │
│  features/  ───────────────►  providers/                    │
│  (páginas, formularios)       (auth, hogar, tema, quick-add)│
│        │                          │                         │
│        ▼                          ▼                         │
│  domain/  ◄───────────────  data/                           │
│  (ledger, money, voz)        (Firestore, Zod, mappers)      │
│        │                          │                         │
│        └──────────┬───────────────┘                         │
│                   ▼                                         │
│        Firebase SDK (Auth, Firestore, Functions)            │
└───────────────────┬─────────────────────────────────────────┘
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
┌──────────────┐        ┌──────────────────────┐
│ Google Auth  │        │ Cloud Firestore      │
│              │        │ + Rules + Indexes    │
└──────────────┘        └──────────┬───────────┘
                                   │
                          ┌────────┴─────────┐
                          │ Cloud Function   │
                          │ opcional:        │
                          │ acceptInvitation │
                          └──────────────────┘
```

### Capas

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| Dominio | `src/domain` | Modelos, dinero, motor contable, parser de voz, categorías iniciales. Sin Firebase. |
| Datos | `src/data` | Suscripciones, lecturas paginadas, escrituras por lote, mappers y esquemas Zod. |
| Estado | `src/providers` | Sesión, perfil, hogar activo, colecciones en tiempo real, tema y quick-add. |
| UI | `src/features`, `src/components` | Rutas, páginas, formularios, diálogos, gráficos y primitivas visuales. |
| Infra | raíz, `functions/` | Vite, Vercel, Firebase, reglas, índices, PWA y Functions. |

La dirección de dependencias es `UI → estado → datos → dominio`. El dominio no importa Firebase ni React, lo que permite testearlo de forma aislada.

---

## 3. Modelo de datos

### 3.1 Árbol de colecciones

```text
users/{uid}
  ├─ displayName, email, photoURL
  ├─ householdIds[]
  ├─ activeHouseholdId
  ├─ defaultCurrency
  └─ onboardingCompleted

households/{hid}
  ├─ name, baseCurrency, fxRates, ownerId
  ├─ timezone, locale
  ├─ members/{uid}
  ├─ invitations/{invitationId}
  ├─ accounts/{accountId}
  ├─ cards/{cardId}
  ├─ categories/{categoryId}
  ├─ budgets/{budgetId}
  ├─ loans/{loanId}
  ├─ recurring/{recurringId}
  └─ transactions/{transactionId}
       └─ audit/{auditId}
```

### 3.2 Documentos principales

| Documento | Campos clave | Notas |
| --- | --- | --- |
| `users/{uid}` | `householdIds`, `activeHouseholdId`, `defaultCurrency` | Solo el propio usuario puede leer/escribir. |
| `households/{hid}` | `baseCurrency`, `fxRates`, `ownerId` | `fxRates` expresa unidades de moneda base por 1 unidad de la moneda extranjera. |
| `members/{uid}` | `role` (`OWNER`/`MEMBER`), `displayName` | Ser miembro habilita el acceso al hogar. |
| `invitations/{id}` | `email`, `status`, `expiresAt`, `role` | El ID es el código de invitación. |
| `accounts/{id}` | `currency`, `initialBalanceMinor`, `includeInAvailable`, `isActive` | El saldo actual no se guarda. |
| `cards/{id}` | `limitMinor`, `closingDay`, `dueDay`, `currency` | La deuda se deriva de movimientos. |
| `categories/{id}` | `kind`, `parentId`, `color`, `isArchived` | Dos niveles: raíz y subcategoría. |
| `budgets/{id}` | `period` (`YYYY-MM`), `categoryId`, `amountMinor` | Un presupuesto por categoría y período. |
| `loans/{id}` | `kind` (`loan`/`commitment`), `installmentsTotal`, `firstDueDate` | Pagos derivados de transacciones. |
| `recurring/{id}` | `frequency`, `nextRunAt`, `autoGenerate` | Plantilla; nunca confirma movimientos. |
| `transactions/{id}` | `type`, `date`, `amountMinor`, `baseAmountMinor`, `fxRate`, `status` | Fuente única de verdad. |
| `audit/{id}` | `action`, `by`, `at`, `summary` | Append-only. |

### 3.3 Índices

`firestore.indexes.json` declara índices compuestos para:

- `transactions`: `status + date`, `accountId + date`, `categoryId + date`, `createdBy + date`.
- `recurring`: `isActive + nextRunAt`.

Las consultas actuales del panel y de reportes usan un rango por `date` ordenado por `date` (índice automático de campo único). Los índices compuestos quedan disponibles para filtros del lado del servidor y futuras optimizaciones.

### 3.4 Por qué no hay saldos persistidos

Los saldos de cuentas, deuda de tarjetas y estado de préstamos se calculan con `src/domain/ledger.ts` a partir de las transacciones confirmadas. Ventajas:

- Una sola fuente de verdad. No hay riesgo de que un saldo quede desfasado tras editar o borrar.
- Se puede reconstruir cualquier estado histórico.
- Registrar un movimiento no requiere actualizar varios documentos ni transacciones multi-documento.
- Los tests del motor contable cubren la lógica sin emulador.

Costo: el panel debe cargar los movimientos necesarios. Por eso el proveedor suscribe un rango acotado (ver §9).

---

## 4. Dinero y multi-moneda

### 4.1 Unidades mínimas

Todo importe monetario es un entero (`number` seguro de JavaScript) en unidades mínimas:

- `PYG`: 0 decimales. `G. 1.500.000` → `1500000`.
- `USD`: 2 decimales. `USD 250,00` → `25000`.

No se usan floats para sumar, restar ni comparar dinero. El redondeo se hace una sola vez al convertir o al repartir cuotas, con `Math.round`/`Math.trunc` explícitos.

`src/domain/money.ts` expone:

- `parseAmountToMinor`, `toMinor`, `formatMoney`;
- `convertMinor` (BigInt para evitar pérdida de precisión);
- `sumMinor`;
- `CURRENCY_CODES`, `CURRENCY_META`, `MAX_AMOUNT_MINOR`.

### 4.2 Tasas de cambio

`households.fxRates` guarda cuántas unidades de moneda base equivalen a 1 unidad de cada moneda extranjera:

```text
PYG base:
  fxRates.USD = 7500   → 1 USD = 7.500 PYG

USD base:
  fxRates.PYG = 0.000133...  → 1 PYG = 0.000133 USD
```

La moneda base siempre tiene tasa 1 (se normaliza al guardar los ajustes). Si falta la tasa de una moneda usada por una cuenta o un movimiento, la UI muestra una advertencia y el registro puede bloquearse con `ledger/missing-rate`.

### 4.3 Snapshot por transacción

Cada transacción guarda:

- `currency`: moneda original del movimiento.
- `amountMinor`: importe original.
- `fxRate`: tasa aplicada al momento de crear/editar.
- `baseAmountMinor`: equivalente en moneda base.

Los reportes y resúmenes usan `baseAmountMinor`, no la cotización actual. Así un reporte histórico no cambia cuando se actualiza la cotización.

Las cuentas, en cambio, convierten su saldo actual con la cotización vigente del hogar, porque representan valor presente.

### 4.4 Redondeo

- La conversión usa BigInt y redondeo half-up.
- El reparto de cuotas usa división entera y asigna el remanente a la primera cuota.
- Los ajustes pueden ser negativos; el resto de los tipos exige importe positivo en Zod y en reglas.

---

## 5. Motor contable

El motor está en `src/domain/ledger.ts`. Solo considera transacciones activas (`deletedAt == null`) y confirmadas (`status === 'confirmed'`).

### 5.1 Efectos por tipo

```text
EXPENSE
  cuenta:  -amount
  tarjeta: +amount (deuda)
  reporte: gasto

INCOME
  cuenta:  +amount
  tarjeta: -amount (reintegro/devolución, reduce deuda)
  reporte: ingreso (o menor gasto si es reintegro a tarjeta)

TRANSFER
  origen:  -amount
  destino: +toAmount (o amount si misma moneda)
  reporte: no es gasto ni ingreso

SAVINGS_CONTRIBUTION
  origen:  -amount
  destino: +toAmount
  reporte: ahorro (no consumo)

SAVINGS_WITHDRAWAL
  origen:  -amount
  destino: +toAmount
  reporte: desahorro (no ingreso)

WITHDRAWAL (avance de tarjeta)
  tarjeta: +amount + fee (deuda)
  destino: +toAmount (efectivo)
  reporte: solo fee es gasto

CARD_PAYMENT
  cuenta:  -amount
  tarjeta: -amount (reduce deuda)
  reporte: pago de deuda, no gasto

LOAN_PAYMENT
  cuenta:  -amount
  préstamo: -principal (amortiza deuda)
  reporte: interés es gasto, capital no

ADJUSTMENT
  cuenta o tarjeta: ±amount
  reporte: no es ingreso ni gasto
```

### 5.2 Saldos de cuentas

```text
delta(cuenta) = Σ efectos de transacciones confirmadas
saldo(cuenta) = initialBalanceMinor + delta(cuenta)
saldoBase(cuenta) = convertir(saldo(cuenta), monedaCuenta → base)
```

`availableMoneyBase()` suma las cuentas activas que:

- no son de tipo `savings` y tienen `includeInAvailable = true`, o
- son de tipo `savings` (se informan aparte como ahorro).

### 5.3 Tarjetas

```text
deuda = cargos - pagos/reintegros
disponible = límite - deuda
utilización = max(0, deuda) / límite
```

Cargos incluyen gastos con tarjeta, avances (importe + comisión) y ajustes de tarjeta. Pagos incluyen `card_payment` e ingresos sobre tarjeta (reintegros).

El resumen (`cardStatementRange`) calcula el período según el día de cierre y la fecha de vencimiento a partir del día de vencimiento configurado.

### 5.4 Préstamos y compromisos

Para cada préstamo:

- Pagos relevantes: `loan_payment` con `loanId`, o transacciones con `commitmentId` para compromisos.
- `paidPrincipal = principalMinor` si existe; si no, `amount - interest` para pagos de préstamo; si no, `amount`.
- `debt = max(0, originalPrincipal - paidPrincipal)` solo para `kind = 'loan'`.
- `installmentsPaid` = cantidad de pagos; `remaining = total - paid`.
- Próximo vencimiento: `firstDueDate + installmentsPaid meses`.
- `isOverdue` si el próximo vencimiento es anterior a hoy.

En compromisos, el capital original no se usa como deuda pendiente; se sigue el cumplimiento de cuotas.

### 5.5 Resumen mensual

`computeMonthSummary` separa:

- `incomeMinor`
- `expenseMinor`
- `balanceMinor = income - expense`
- `savingsMinor`
- `debtPaymentsMinor`
- pendientes (`pendingCount`, `pendingAmountMinor`)
- cantidad de movimientos confirmados

Los gastos con tarjeta cuentan como gasto en el mes en que se registran, aunque el pago de la tarjeta ocurra después. El pago de tarjeta no vuelve a contar como gasto.

### 5.6 Presupuestos

`computeBudgetProgress`:

- convierte el presupuesto a moneda base si está en otra moneda;
- suma gastos de la categoría **y sus subcategorías**;
- en pagos de préstamo, solo imputa la porción de interés;
- calcula restante, ratio y exceso.

### 5.7 Próximos vencimientos

`computeUpcoming` combina:

- reglas recurrentes activas con `nextRunAt` dentro de los próximos 60 días o vencidas;
- próximas cuotas de préstamos/compromisos activos;
- vencimientos de tarjetas con deuda.

Se ordenan por fecha y se marcan como vencidos si corresponde.

---

## 6. Seguridad y multi-tenancy

### 6.1 Principio

Todo acceso a datos de un hogar requiere que exista `households/{hid}/members/{uid}` para el usuario autenticado. El rol se obtiene de ese documento. No se confía en campos enviados por el cliente.

### 6.2 Reglas de Firestore

`firestore.rules` es la fuente autoritativa. Puntos principales:

- `users/{uid}`: solo el propio usuario; no se puede cambiar `uid`.
- `households/{hid}`: lectura para miembros; creación solo para usuarios con email verificado y como owner; actualización solo owner; borrado solo owner.
- `members/{uid}`: alta como owner solo para el creador sin miembros previos; alta como member solo con invitación `pending`, vigente y con email coincidente (o abierta).
- `invitations/{id}`: el invitado puede leer por ID si está pendiente y vigente; listar solo owner; crear/revocar solo owner; aceptar solo el invitado.
- Entidades (`accounts`, `cards`, `categories`, `budgets`, `loans`, `recurring`): lectura para miembros; escritura con validación estricta de forma y `updatedBy == uid`.
- `transactions`: validación por tipo; actualización limitada a campos editables; no se puede cambiar `type`, `currency`, `fxRate`, `createdBy` ni `householdId`; borrado físico solo owner.
- `audit`: solo lectura y creación; nunca update/delete.
- Regla final: `allow read, write: if false` para todo lo no declarado.

Los límites de longitud, importes, IDs y enums están replicados en reglas y en Zod. Zod da mensajes de UI; las reglas son la barrera real.

### 6.3 Invitaciones

Hay dos caminos:

1. **Cliente (por defecto):** `acceptInvitation` lee la invitación, valida en cliente y ejecuta un `writeBatch` que crea el miembro, marca la invitación como aceptada y actualiza el perfil. Las reglas validan cada escritura. No requiere Blaze.
2. **Cloud Function (`VITE_USE_CLOUD_FUNCTIONS=true`):** `functions/src/index.ts` valida y ejecuta todo en una transacción de Firestore con Admin SDK. Es idempotente si el usuario ya es miembro.

En ambos casos el ID de la invitación es un código de alta entropía. El email es opcional; si está presente, solo esa cuenta puede aceptar.

### 6.4 App Check

La app inicializa App Check con reCAPTCHA v3 si `VITE_FIREBASE_APP_CHECK_SITE_KEY` está definida. La enforcement se activa en Firebase Console, no en el código. Recomendación: activar primero en modo monitoreo, verificar que el tráfico legítimo está verificado y recién después forzar.

### 6.5 Pérdida de acceso

Si un miembro es expulsado o el hogar desaparece, las suscripciones fallan con `permission-denied`. `HouseholdProvider` detecta el caso y elimina el hogar del perfil del usuario (`removeHouseholdFromUser`) para evitar un estado inconsistente.

---

## 7. Escrituras y trazabilidad

### 7.1 Movimientos

`createTransactions` usa un `writeBatch` para crear:

- uno o N documentos de movimiento (cuotas);
- un documento de auditoría por cada movimiento.

El batch es atómico. El límite de Firestore es 500 escrituras; con un máximo de 48 cuotas y su auditoría, el peor caso son 96 escrituras, dentro del límite.

Campos relevantes:

- `createdBy`, `createdByName`, `entryMethod`, `createdAt`.
- `updatedBy`, `updatedAt` en cada edición.
- `deletedAt`, `deletedBy` para borrado lógico.
- `rawTranscript` y `confidence` cuando el origen es voz.
- `recurringId` cuando el borrador proviene de una regla.
- `installmentPlanId`, `installmentIndex`, `installmentCount` para cuotas.

### 7.2 Edición

La UI permite editar:

- descripción,
- fecha,
- importe,
- categoría,
- notas,
- estado (`pending`/`confirmed`).

No permite cambiar tipo, moneda, tasa, cuenta/tarjeta, préstamo ni cuotas. Para un cambio estructural se debe borrar y volver a crear. Las reglas rechazan cambios fuera de la lista permitida.

Al editar el importe, `baseAmountMinor` se recalcula con la tasa guardada en el propio movimiento (`fxRate`) para mantener la coherencia histórica; `fxRate` no se modifica porque las reglas lo prohíben. También se reescalan `toAmountMinor`, `principalMinor` e `interestMinor` cuando corresponde, para que las transferencias y los pagos de préstamo sigan siendo coherentes.

### 7.3 Auditoría

Cada creación, edición, borrado y restauración agrega un documento en `transactions/{id}/audit` con:

- `action`: `created` | `updated` | `deleted` | `restored`;
- `by`, `byName`, `at`;
- `summary` y, opcionalmente, `changes`.

Las reglas impiden modificar o borrar auditoría. La UI puede consultar los últimos 30 registros por movimiento.

### 7.4 Borrado

- La UI usa borrado lógico (`deletedAt`) y permite restaurar.
- El owner puede borrar físicamente a nivel de reglas, pero la UI no lo expone como acción normal.
- Entidades referenciadas (cuentas, tarjetas, categorías, préstamos) se protegen en la UI; las reglas no pueden verificar todas las referencias. Se recomienda archivar/desactivar.

---

## 8. Voz

### 8.1 Flujo

```text
Micrófono
  → Web Speech API (src/lib/speech.ts)
  → transcripción (texto)
  → intérprete determinista (src/domain/voice-parser.ts)
  → TransactionDraft editable
  → revisión humana en el formulario
  → confirmación explícita
  → createTransactions
```

- La captura usa `SpeechRecognition`/`webkitSpeechRecognition` si está disponible.
- El parser usa diccionarios de verbos, monedas, números y categorías. No hace red.
- El `TransactionDraft` incluye campos faltantes y advertencias (`missing`, `warnings`) y una confianza estimada.
- La UI muestra el borrador en el mismo formulario de alta para que la persona complete o corrija.
- Nunca se guarda automáticamente. La confirmación es obligatoria.
- Se guarda `rawTranscript` para trazabilidad, junto con `entryMethod: 'voice'`.

### 8.2 Extensión futura

`VoiceInterpreter` es una interfaz. Se puede reemplazar la implementación local por una llamada a una Cloud Function que use un LLM, sin cambiar la UI ni el contrato de `TransactionDraft`. La regla se mantiene: la IA propone, la persona confirma.

### 8.3 Limitaciones

- La disponibilidad de Web Speech API depende del navegador y del sistema.
- La transcripción puede requerir conexión.
- El parser es determinista y conservador: si no está seguro, marca campos faltantes en lugar de inventar datos.
- No se debe usar la voz para datos que la persona no quiera conservar: `rawTranscript` queda en Firestore.

---

## 9. Carga de datos y estado en tiempo real

`HouseholdProvider` se suscribe a:

- documento del hogar;
- miembros;
- cuentas;
- tarjetas;
- categorías;
- presupuestos;
- préstamos;
- recurrentes;
- transacciones en el rango `2000-01-01` a `hoy + 1 año`, con límite de 5.000.

Esto permite que el panel, las tarjetas, los préstamos y los presupuestos se calculen en memoria sin consultas adicionales. La página de informes usa `fetchTransactionsPage` con paginación por cursor (`date desc`, 100 por página) y aplica filtros/agregaciones sobre lo cargado.

### Trade-offs

- **Ventaja:** UI reactiva y cálculos consistentes sin N+1.
- **Costo:** el rango cargado crece con el uso. Para hogares con miles de movimientos, acotar el rango o migrar reportes a agregaciones server-side/precalculadas.
- **Filtros:** se aplican en cliente después de la paginación para evitar una explosión de índices compuestos. El usuario debe cargar más páginas si necesita un filtro sobre datos antiguos.

### Persistencia offline

- Firestore se inicializa con `persistentLocalCache` y `persistentMultipleTabManager`.
- Auth usa `browserLocalPersistence`.
- El service worker precachea el shell y los assets (Workbox).
- Firestore puede encolar escrituras offline; al reconectar se sincronizan. Las reglas se siguen aplicando en el servidor.
- Las consultas en tiempo real pueden mostrar datos cacheados mientras se reconecta.

---

## 10. Recurrentes

```text
Regla recurrente (recurring/{id})
  ├─ frequency: weekly | monthly | yearly | custom
  ├─ nextRunAt
  ├─ autoGenerate
  └─ snapshot de cuenta/tarjeta/categoría/préstamo
        │
        ▼
generateDueRecurringDrafts()
  ├─ crea transacciones status = pending
  ├─ crea auditoría
  └─ avanza nextRunAt al futuro
```

- Se ejecuta una vez por día y por hogar (clave en memoria `householdId:YYYY-MM-DD`).
- Solo procesa reglas activas con `autoGenerate = true` y `nextRunAt <= ahora`.
- Crea un borrador por regla vencida (no uno por cada ciclo omitido).
- Avanza `nextRunAt` con `nextOccurrence` hasta quedar en el futuro.
- Nunca confirma, nunca paga y nunca modifica saldos por sí solo.
- El usuario confirma o descarta el borrador en Movimientos.

---

## 11. Reportes y exportación

- La página de informes define un rango (`from`/`to`) y filtros por tipo, integrante, cuenta, tarjeta y categoría.
- `fetchTransactionsPage` pagina por `date desc` con cursor y tamaño 100.
- Los filtros y las agregaciones se aplican en memoria sobre las páginas cargadas.
- Los gráficos usan Recharts y los importes convertidos a moneda base.
- La exportación CSV se genera con `src/lib/export.ts`.
- La exportación XLSX usa `exceljs` cargado dinámicamente (`src/lib/excel-export.ts`) para no inflar el bundle inicial.
- Las exportaciones incluyen metadatos del movimiento y respetan los filtros aplicados.
- No se envían datos a servidores externos: todo se genera en el navegador.

---

## 12. PWA y rendimiento

- `vite-plugin-pwa` genera manifest y service worker en el build.
- Estrategia: precache del shell (`**/*.{js,css,html,svg,png,woff2}`), `NetworkOnly` para Firestore y `CacheFirst` para Google Fonts.
- `registerType: 'autoUpdate'`.
- Iconos normales y maskable generados con `npm run icons`.
- Rutas lazy-loaded con `React.lazy` y `Suspense` para reducir el bundle inicial.
- Recharts y ExcelJS se cargan solo en las páginas que los usan (ExcelJS con import dinámico).
- `vercel.json` aplica cache inmutable a `/assets/*` y `no-cache` al service worker.

---

## 13. Manejo de errores

- `AppError` normaliza errores de dominio y de Firebase.
- `errorMessage` traduce códigos comunes (`permission-denied`, `unavailable`, `failed-precondition`, etc.) a mensajes en español.
- `ErrorBoundary` captura errores de render y muestra una pantalla de recuperación.
- `ConfigErrorScreen` detecta variables de Firebase faltantes antes de inicializar.
- Los formularios muestran errores en línea; las operaciones muestran toasts.
- Si se pierde el acceso al hogar, el proveedor limpia el hogar activo del perfil.

---

## 14. Decisiones y trade-offs

| Decisión | Alternativa descartada | Motivo |
| --- | --- | --- |
| Saldos derivados | Campos de saldo persistidos | Evita desincronización y doble contabilidad. |
| `writeBatch` para movimientos + auditoría | Transacción multi-documento | Un batch es suficiente y atómico; no se necesita leer antes. |
| Snapshot `baseAmountMinor` + `fxRate` | Convertir siempre con la tasa actual | Reportes históricos reproducibles. |
| Filtros de reportes en cliente | Consultas compuestas por cada filtro | Evita una explosión de índices y simplifica la UI. |
| Invitación por código en el ID | Colección de códigos separada | Menos documentos y lectura directa por ID. |
| Flujo de invitación por cliente por defecto | Cloud Function obligatoria | Funciona en plan Spark y reduce infraestructura. |
| Parser de voz local | LLM en el frontend | Sin claves, determinista, privado y testeable. |
| Borrado lógico de movimientos | Borrado físico | Conserva historial y auditoría. |
| UI custom estilo shadcn sin Radix | Librería completa de componentes | Menos dependencias y control del bundle. |
| `exceljs` en lugar de `xlsx` | `xlsx` | Evitar advisories de seguridad y mantener mantenimiento. |

---

## 15. Operación

### Despliegue

1. `npm run build` (typecheck + Vite + PWA).
2. Desplegar `dist` en Vercel o Firebase Hosting.
3. Desplegar reglas e índices cuando cambien: `npm run deploy:rules`.
4. Si se usan Functions: `npx firebase-tools deploy --only functions`.
5. Cargar variables `VITE_*` en el entorno de hosting.

### Backups

- Activar backups programados o PITR de Firestore según el plan.
- Exportar periódicamente a Cloud Storage si se necesita retención a largo plazo.
- Probar una restauración antes de depender del backup.

### Borrado de hogar

- La UI solo permite borrar el hogar cuando queda un único miembro (el owner).
- Firestore no borra subcolecciones en cascada.
- Después del borrado pueden quedar documentos huérfanos (miembros, transacciones, etc.).
- Para una limpieza completa se necesita una Cloud Function administrativa o un script con Admin SDK que recorra y borre las subcolecciones.
- Mientras el documento del hogar no exista, la app no puede suscribirse a él; los datos huérfanos no se muestran.

### Migraciones

- No hay migraciones automáticas. Los mappers toleran campos faltantes y valores inválidos con defaults.
- Cualquier cambio de forma debe ser retrocompatible o acompañarse de un script de migración.
- Los cambios de reglas deben probarse en el emulador antes de producción.

### Monitoreo

- Revisar errores de Firestore (`permission-denied`, `unavailable`) en la consola.
- Alertas de presupuesto en Google Cloud.
- Logs de Cloud Functions si se habilitan.
- Métricas de uso de Firestore (lecturas/escrituras) para controlar costos.

---

## 16. Testing

### Actual

- Vitest + jsdom.
- Tests unitarios de dinero, ledger y parser de voz.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` como verificación local.

### Recomendado antes de producción intensiva

- **Firestore Emulator Suite** para probar reglas de seguridad (altas, invitaciones, ownership, updates prohibidos).
- **Playwright** para flujos críticos: login, onboarding, alta de movimiento, confirmación de recurrente, invitación, exportación.
- **Tests de integración** para `createTransactions`, `updateTransaction`, `acceptInvitation` y `generateDueRecurringDrafts`.
- **Tests de accesibilidad** con axe.
- **Pruebas de carga** del panel con 5.000 movimientos.

---

## 17. Extensiones posibles

- Transferencia de propiedad desde la UI (las reglas ya permiten el cambio de rol).
- Agregaciones server-side o colecciones de resumen por mes para escalar reportes.
- Importación de extractos CSV/OFX con deduplicación.
- Adjuntar comprobantes a movimientos (Firebase Storage + reglas).
- Recordatorios push de vencimientos (FCM + Cloud Functions).
- Multi-moneda con más de PYG/USD y tasas por fecha.
- Catch-up completo de recurrentes omitidos.
- Exportación PDF y reportes programados por email.
- Tests de reglas y E2E en CI.

---

## 18. Referencias

- [`firestore.rules`](../firestore.rules)
- [`firestore.indexes.json`](../firestore.indexes.json)
- [`src/domain/ledger.ts`](../src/domain/ledger.ts)
- [`src/domain/money.ts`](../src/domain/money.ts)
- [`src/domain/voice-parser.ts`](../src/domain/voice-parser.ts)
- [`src/data/transactions.ts`](../src/data/transactions.ts)
- [`src/data/households.ts`](../src/data/households.ts)
- [`src/providers/household-provider.tsx`](../src/providers/household-provider.tsx)
- [`functions/src/index.ts`](../functions/src/index.ts)
