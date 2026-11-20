# Finanzas del Hogar

Aplicación web de finanzas familiares para dos o más integrantes de un mismo hogar. Permite registrar gastos, ingresos, transferencias, pagos de tarjetas y préstamos, presupuestos, compromisos y movimientos recurrentes, con entrada por voz y funcionamiento como PWA instalable.

- **Stack:** React 19 + TypeScript + Vite, Tailwind CSS v4, Firebase Authentication (Google), Cloud Firestore, Zod, React Hook Form, Recharts.
- **Multi-hogar:** cada usuario puede pertenecer a varios hogares; los datos están aislados por hogar y protegidos con Firestore Rules.
- **Multi-moneda:** PYG (guaraníes) como moneda principal y USD (dólares) con cotización configurable por hogar.
- **Sin floats en dinero:** todos los importes se guardan como enteros en unidades mínimas (PYG sin decimales; USD con dos decimales).
- **Saldos derivados:** no se almacenan saldos mutables. Se calculan a partir de los movimientos confirmados, que son la única fuente de verdad.
- **Voz determinista:** la interpretación de frases no depende de una API de IA ni de claves en el frontend. El borrador siempre se revisa y se confirma manualmente.
- **PWA:** instalable en Android, iOS y escritorio. El shell se precachea; Firestore mantiene caché persistente para consultas offline.

> Este repositorio contiene la aplicación completa y la configuración de seguridad. La puesta en marcha requiere crear o usar un proyecto de Firebase y desplegar reglas e índices. Ver [Configuración de Firebase](#configuración-de-firebase).

---

## Índice

- [Funcionalidades](#funcionalidades)
- [Inicio rápido](#inicio-rápido)
- [Configuración de Firebase](#configuración-de-firebase)
- [Variables de entorno](#variables-de-entorno)
- [Comandos](#comandos)
- [Despliegue en Vercel](#despliegue-en-vercel)
- [Cloud Functions opcionales](#cloud-functions-opcionales)
- [Modelo contable](#modelo-contable)
- [Seguridad y multi-tenancy](#seguridad-y-multi-tenancy)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Calidad y pruebas](#calidad-y-pruebas)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Checklist de producción](#checklist-de-producción)
- [Documentación adicional](#documentación-adicional)

---

## Funcionalidades

### Panel

- Ingresos, gastos, balance y ahorro del mes.
- Dinero disponible, deuda total de tarjetas, deuda de préstamos y movimientos pendientes.
- Gráficos: gastos por categoría, evolución mensual y avance de presupuestos.
- Últimos movimientos, próximos vencimientos y filtros por mes, año, integrante, cuenta y categoría.
- Acceso rápido para cargar un movimiento manual o por voz.

### Movimientos

- Gastos, ingresos, transferencias entre cuentas, retiros con tarjeta, pagos de tarjeta, pagos de préstamo/compromiso, aportes y retiros de ahorro, y ajustes.
- Carga manual con vista previa, validación con Zod y edición posterior.
- Carga por voz en español rioplatense/paraguayo: el texto se interpreta localmente, se muestra un borrador editable y **nunca se guarda sin confirmación**.
- Compras con tarjeta en cuotas: se generan N movimientos con el importe repartido en enteros.
- Borrado lógico con trazabilidad; restauración disponible.
- Historial de auditoría por movimiento (creación, edición, borrado y restauración).

### Cuentas y tarjetas

- Cuentas de efectivo, banco, billetera, ahorro, inversión y otras, en PYG o USD.
- Saldo inicial, inclusión en “dinero disponible” y activación/desactivación.
- Tarjetas de crédito con límite, día de cierre, día de vencimiento y moneda.
- Deuda de tarjeta, crédito disponible, utilización y resumen estimado.

### Préstamos y compromisos

- Préstamos con capital original, tasa, cantidad de cuotas, importe de cuota y primera fecha de vencimiento.
- Compromisos (alquiler, colegio, etc.) con cuotas y seguimiento de pagos.
- Cada pago separa capital e interés: el capital amortiza deuda y el interés es gasto real.
- Progreso, cuotas restantes, próxima fecha y estado de vencimiento.

### Presupuestos

- Presupuesto mensual por categoría, en PYG o USD.
- Incluye subcategorías al calcular el gasto.
- Avance, restante, exceso y copia de presupuestos del mes anterior.

### Recurrentes

- Plantillas semanales, mensuales, anuales o personalizadas.
- Generación de **borradores pendientes** al abrir la app (máximo una vez por día y por hogar).
- Los borradores no afectan saldos hasta que se confirman. La app nunca paga ni registra nada automáticamente.

### Informes y exportación

- Rangos de fecha configurables y filtros por tipo, integrante, cuenta, tarjeta y categoría.
- Paginación contra Firestore y agregaciones en memoria sobre la página cargada.
- Exportación a CSV y Excel (`.xlsx`) generada en el navegador.

### Hogar, integrantes e invitaciones

- Roles `OWNER` y `MEMBER`.
- Invitaciones por enlace con código de alta entropía y vencimiento (7 días desde la app; máximo 30 días en reglas).
- Invitación opcionalmente reservada a un email; el enlace se comparte manualmente (no se envían correos).
- Cambio de hogar activo, salida de un hogar y expulsión de miembros por parte del owner.
- Creación de hogar con categorías iniciales y configuración de moneda base y cotizaciones.

### Experiencia

- Mobile-first, responsive, tema claro/oscuro y UI en español.
- Formato exacto de importes: `G. 1.500.000` y `USD 250,00`.
- PWA instalable con iconos, manifest y service worker.

---

## Inicio rápido

Requisitos:

- Node.js **20.19+** (recomendado 22 LTS).
- npm 10+.
- Un proyecto de Firebase con Authentication (Google) y Firestore habilitados.

```bash
npm install
cp .env.example .env.local   # Windows PowerShell: Copy-Item .env.example .env.local
# Completar .env.local con la configuración web de Firebase
npm run dev
```

La app queda en `http://localhost:5173`. Para probar la PWA y el service worker:

```bash
npm run build
npm run preview
```

> Si faltan variables obligatorias, la app muestra una pantalla de configuración en lugar de fallar en blanco.

---

## Configuración de Firebase

La app funciona con el **plan Spark** para el flujo principal. Cloud Functions requiere plan **Blaze** y es opcional.

### 1. Crear el proyecto

1. Entrar a [Firebase Console](https://console.firebase.google.com/) y crear un proyecto (o reutilizar uno existente).
2. Agregar una app web (`</>`). Copiar el objeto `firebaseConfig`.
3. Guardar los valores en `.env.local` con el prefijo `VITE_FIREBASE_`.
4. Opcional: habilitar Google Analytics y copiar `measurementId`.

### 2. Habilitar Google Sign-In

1. **Authentication → Sign-in method → Google → Enable**.
2. Configurar el email de soporte del proyecto.
3. En **Authentication → Settings → Authorized domains**, agregar:
   - `localhost`
   - el dominio de Vercel (`tu-proyecto.vercel.app`)
   - el dominio propio, si se usa
   - el dominio de Firebase Hosting, si se despliega allí

La app usa `signInWithPopup` con `prompt: 'select_account'` y persistencia local.

### 3. Crear Firestore

1. **Firestore Database → Create database**.
2. Elegir modo producción.
3. Elegir una región cercana (por ejemplo `southamerica-east1`). La región no se puede cambiar después.
4. Desplegar reglas e índices desde este repositorio:

```bash
npx firebase-tools login
npx firebase-tools use --add          # elegir el proyecto y asignarle un alias
npm run deploy:rules
```

También se puede hacer manualmente:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

Los archivos fuente son `firestore.rules` y `firestore.indexes.json`.

> **Importante:** sin reglas desplegadas, Firestore queda en modo producción con denegación por defecto; la app no podrá leer ni escribir. Después de cada cambio en `firestore.rules`, volver a desplegar.

### 4. Verificar la configuración

1. `npm run dev`.
2. Ingresar con Google.
3. Crear un hogar desde el onboarding.
4. Verificar en Firestore que se crearon `households/{hid}`, `members/{uid}`, categorías iniciales y `users/{uid}`.
5. Registrar un gasto y comprobar que el saldo de la cuenta cambia en el panel.

### 5. App Check (recomendado en producción)

1. **App Check → Apps → Web → reCAPTCHA v3**.
2. Registrar el dominio de producción.
3. Copiar la site key en `VITE_FIREBASE_APP_CHECK_SITE_KEY`.
4. Redeployar el frontend.
5. Verificar que las solicitudes aparecen como verificadas en App Check.
6. Recién entonces, activar la **enforcement** para Firestore y, si se usan, Cloud Functions.

Si App Check se fuerza antes de que el frontend tenga la site key, la app dejará de funcionar.

---

## Variables de entorno

Archivo de ejemplo: `.env.example`.

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Sí | API key web de Firebase. Es pública por diseño. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Sí | Dominio de Authentication. |
| `VITE_FIREBASE_PROJECT_ID` | Sí | ID del proyecto. |
| `VITE_FIREBASE_STORAGE_BUCKET` | No | Bucket de Storage. No se usa para datos financieros. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | No | Sender ID. |
| `VITE_FIREBASE_APP_ID` | Sí | App ID web. |
| `VITE_FIREBASE_MEASUREMENT_ID` | No | Analytics. |
| `VITE_FIREBASE_APP_CHECK_SITE_KEY` | No | Site key de reCAPTCHA v3 para App Check. |
| `VITE_USE_CLOUD_FUNCTIONS` | No | `true` para aceptar invitaciones vía Cloud Function. Por defecto `false`. |
| `VITE_FUNCTIONS_REGION` | No | Región de las Functions. Por defecto `southamerica-east1`. |
| `VITE_DEFAULT_USD_RATE` | No | Cotización inicial sugerida al crear un hogar. Por defecto `7500`. |

**Nunca** poner claves privadas, service accounts ni secretos de Admin SDK en variables `VITE_*`: se incluyen en el bundle del navegador. La seguridad real está en Firestore Rules, App Check y, si se usan, las Cloud Functions.

En Vercel, cargar las mismas variables en **Project → Settings → Environment Variables** para Production, Preview y Development, y volver a desplegar.

---

## Comandos

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo Vite. |
| `npm run build` | Typecheck (`tsc -b`) + build de producción + service worker. |
| `npm run preview` | Sirve el build localmente (útil para probar la PWA). |
| `npm run typecheck` | TypeScript estricto sin emitir. |
| `npm test` | Tests unitarios con Vitest. |
| `npm run test:watch` | Tests en modo watch. |
| `npm run lint` | ESLint 9 (flat config). |
| `npm run icons` | Regenera los iconos PWA en `public/` con Sharp. |
| `npm run deploy:rules` | Despliega reglas e índices de Firestore. |
| `npm run deploy:hosting` | Despliega el build en Firebase Hosting (opcional). |
| `npm run emulators` | Levanta emuladores de Auth, Firestore y Functions. |

---

## Despliegue en Vercel

El repositorio ya incluye `vercel.json` con:

- build `npm run build`;
- salida `dist`;
- rewrites SPA hacia `index.html`;
- cache inmutable para `/assets/*`;
- `no-cache` para `sw.js`;
- headers de seguridad básicos (`nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`).

Pasos:

1. Subir el repositorio a GitHub/GitLab/Bitbucket.
2. En Vercel, **Add New → Project** e importar el repositorio.
3. Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
4. Cargar las variables `VITE_*` en Production, Preview y Development.
5. Desplegar.
6. Agregar el dominio de Vercel (y el dominio propio, si existe) a **Authorized domains** en Firebase Authentication.
7. Verificar el login, el onboarding y la creación de un movimiento en producción.
8. Probar la instalación de la PWA desde el navegador.

> Vercel sirve el frontend. Firestore, Authentication y Functions siguen viviendo en Firebase. No es necesario desplegar funciones de Vercel.

### Alternativa: Firebase Hosting

```bash
npm run build
npx firebase-tools deploy --only hosting
```

La configuración de Hosting, rewrites y emuladores está en `firebase.json`.

---

## Cloud Functions opcionales

Por defecto, las invitaciones se aceptan **desde el cliente** con escrituras por lote protegidas por reglas. Es el camino más simple y no requiere Blaze.

El repositorio incluye una función `acceptInvitation` en `functions/` para quienes prefieran una validación centralizada y atómica en el servidor:

- verifica autenticación, email, estado y vencimiento;
- crea el miembro, consume la invitación y actualiza el perfil del usuario en una transacción de Firestore;
- es idempotente si el usuario ya es miembro;
- vive en la región `southamerica-east1` (coincide con `VITE_FUNCTIONS_REGION`).

Pasos:

```bash
cd functions
npm install
npm run build
cd ..
npx firebase-tools deploy --only functions
```

Luego:

1. Activar el plan Blaze en Firebase.
2. Configurar `VITE_USE_CLOUD_FUNCTIONS=true` en el frontend.
3. Redeployar el frontend.
4. Probar una invitación completa con una segunda cuenta.

Si se cambia la región de la función, actualizar `VITE_FUNCTIONS_REGION` y el valor de `REGION` en `functions/src/index.ts`.

---

## Modelo contable

### Reglas

| Movimiento | Cuenta de origen | Tarjeta | Reporte mensual |
| --- | --- | --- | --- |
| **Gasto** | Disminuye el saldo | Si es con tarjeta, aumenta la deuda y no mueve cuentas | Gasto |
| **Ingreso** | Aumenta el saldo | Si es sobre tarjeta, es un reintegro: reduce deuda | Ingreso (o menor gasto si es reintegro) |
| **Transferencia** | Disminuye | — | No es gasto ni ingreso |
| **Aporte a ahorro** | Disminuye la cuenta origen | — | Ahorro, no consumo |
| **Retiro de ahorro** | Aumenta la cuenta origen | — | Desahorro, no ingreso |
| **Retiro con tarjeta (avance)** | Aumenta la cuenta destino | Aumenta la deuda por importe + comisión | Solo la comisión es gasto |
| **Pago de tarjeta** | Disminuye la cuenta | Reduce la deuda | No es gasto |
| **Pago de préstamo** | Disminuye la cuenta | — | El interés es gasto; el capital no |
| **Ajuste** | Suma o resta al saldo | Ajusta deuda si es de tarjeta | No es ingreso ni gasto |

### Reglas de implementación

- Solo los movimientos `status: 'confirmed'` y sin `deletedAt` afectan saldos, métricas y presupuestos.
- Los borradores de recurrentes se crean como `status: 'pending'` y se confirman manualmente.
- `principalMinor + interestMinor === amountMinor` en pagos de préstamo (validado por Zod y por reglas).
- Las cuotas se reparten en enteros: `trunc(amount / n)`, y el remanente se suma a la primera cuota.
- La moneda base y las cotizaciones se configuran por hogar. Cada movimiento guarda `fxRate` y `baseAmountMinor` para que los reportes sean reproducibles aunque la cotización cambie después.
- Las cuentas y tarjetas pueden estar en PYG o USD; los saldos se convierten a la moneda base del hogar para los totales.
- Un gasto con tarjeta no reduce el “dinero disponible” hasta que se registra el pago de la tarjeta.

### Fechas y zona horaria

- Las fechas de movimientos se guardan como `Timestamp` de Firestore.
- La UI trabaja con fechas locales y las claves de mes (`YYYY-MM`) para presupuestos y reportes.
- El hogar guarda `timezone` y `locale`; la app usa la zona del navegador al crear el hogar.

---

## Seguridad y multi-tenancy

- Cada documento de negocio vive bajo `households/{householdId}`.
- **Allowlist de uso:** solo las cuentas de `src/domain/access.ts` pueden usar la app. La misma lista está en `firestore.rules` (`isAllowedEmail()`), que es la barrera autoritativa. Cualquier otra cuenta de Google es deslogueada y recibe `permission-denied` en Firestore.
- Para leer o escribir, el usuario debe tener un documento `households/{hid}/members/{uid}`.
- El rol se lee desde ese documento; `OWNER` administra hogar, miembros e invitaciones.
- Un usuario solo puede leer y editar su propio `users/{uid}`.
- Las invitaciones usan el ID del documento como código portador de alta entropía. Pueden tener email o ser abiertas; vencen a los 30 días como máximo (la app usa 7).
- Las reglas validan forma, tipos, límites de tamaño e importes enteros en todas las colecciones.
- Los movimientos tienen reglas de forma específicas por tipo (por ejemplo, un pago de tarjeta requiere cuenta y tarjeta; una transferencia requiere cuentas distintas).
- La auditoría es **append-only**: se puede leer y crear, nunca modificar ni borrar.
- El borrado de movimientos desde la UI es lógico (`deletedAt`); el borrado físico solo lo permite el owner a nivel de reglas.
- Regla final: denegar todo lo no declarado.

Archivo autoritativo: [`firestore.rules`](firestore.rules).

### Recomendaciones operativas

- Activar App Check en producción.
- Configurar alertas de presupuesto y cuotas en Google Cloud.
- Habilitar backups/PITR de Firestore si el proyecto lo permite.
- Revisar periódicamente las reglas y las invitaciones pendientes.
- No compartir enlaces de invitación por canales públicos.
- No usar la misma cuenta de Google para dos integrantes distintos.

---

## Estructura del proyecto

```text
.
├── docs/
│   ├── ARCHITECTURE.md          # decisiones y modelo técnico
│   └── FIREBASE_SETUP.md        # guía de consola paso a paso
├── functions/                   # Cloud Function opcional acceptInvitation
│   ├── src/index.ts
│   ├── package.json
│   └── tsconfig.json
├── public/                      # iconos PWA, favicon y manifest assets
├── scripts/
│   └── generate-icons.mjs
├── src/
│   ├── components/              # UI, layout y componentes comunes
│   ├── data/                    # acceso a Firestore, mappers y esquemas Zod
│   ├── domain/                  # dinero, motor contable, modelos, voz, defaults
│   ├── features/                # páginas por módulo
│   ├── lib/                     # Firebase, fechas, exportación, voz, utilidades
│   ├── providers/               # auth, hogar, tema y quick-add
│   ├── test/                    # setup y fixtures
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── firebase.json
├── firestore.indexes.json
├── firestore.rules
├── vercel.json
└── vite.config.ts
```

### Capas

1. **Dominio** (`src/domain`): puro, sin Firebase. Dinero, ledger, parser de voz, modelos y defaults. Es la parte más testeada.
2. **Datos** (`src/data`): Firestore, mappers, validación Zod y escrituras por lote.
3. **Estado global** (`src/providers`): autenticación, hogar activo, colecciones suscritas, tema y quick-add.
4. **UI** (`src/features`, `src/components`): páginas, formularios, gráficos, tablas y diálogos.

La app usa **saldos derivados**: `ledger.ts` calcula saldos de cuentas, deuda de tarjetas, estado de préstamos, resumen mensual, presupuestos, series y próximos vencimientos a partir de las transacciones. No hay campos de saldo que se puedan desincronizar.

Más detalle en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Calidad y pruebas

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Cobertura actual de tests unitarios:

- `money.test.ts`: formato PYG/USD, parseo de importes, conversión y redondeo con enteros.
- `ledger.test.ts`: saldos, avances de tarjeta, pagos, préstamos, transferencias, ahorro, pendientes y presupuestos.
- `voice-parser.test.ts`: importes, tipos, cuentas, tarjetas, categorías, fechas y advertencias.

Los tests rápidos cubren la lógica crítica. Las reglas de Firestore y los flujos E2E requieren emuladores o un proyecto de prueba; ver [Limitaciones conocidas](#limitaciones-conocidas).

### TypeScript

- `strict: true`
- `noUnusedLocals`, `noUnusedParameters`
- `verbatimModuleSyntax: true` (usar `import type` para tipos)

### Lint

ESLint 9 con flat config, `typescript-eslint`, reglas de React Hooks y React Refresh. Los warnings de Fast Refresh en archivos que exportan providers + hooks son esperables y no bloquean el build.

---

## Limitaciones conocidas

- **Borrado de hogar sin cascada:** Firestore no elimina subcolecciones automáticamente. La UI solo permite borrar el hogar cuando queda un único miembro (el owner); aun así, los documentos de miembros y datos históricos pueden quedar huérfanos. Ver la sección de operaciones en `docs/ARCHITECTURE.md`.
- **Borrado de entidades referenciadas:** cuentas, tarjetas, categorías y préstamos se protegen en la UI cuando tienen referencias, pero las reglas no pueden verificar todas las referencias. Para conservar el histórico, se recomienda desactivar/archivar en lugar de borrar.
- **Cambio de moneda base:** los movimientos históricos conservan su `baseAmountMinor` original; cambiar la moneda base no reconvierte el pasado. La UI lo advierte.
- **Edición de importes:** al editar el importe de un movimiento, el equivalente en moneda base se recalcula con la tasa guardada en el movimiento y se reescalan los campos derivados (destino, capital e interés). En compras en cuotas, cada cuota se edita de forma individual.
- **Sin transferencia de propiedad desde la UI:** el rol existe en el modelo y en las reglas, pero la pantalla de ajustes no expone la transferencia de owner.
- **Recurrentes sin catch-up completo:** si la app no se abre durante varios ciclos, se genera un solo borrador por regla y se avanza `nextRunAt` al futuro. No se crean todos los borradores omitidos.
- **Reportes en memoria:** los filtros y agregaciones se aplican sobre la página cargada de Firestore. Para rangos muy grandes se recomienda acotar fechas. El panel suscribe hasta 5.000 movimientos desde 2000 hasta +1 año.
- **Sin conciliación bancaria automática:** no hay integración con bancos ni importación de extractos.
- **Invitaciones sin email:** el enlace se comparte manualmente; no se envían correos transaccionales.
- **Voz dependiente del navegador:** usa Web Speech API. La disponibilidad y calidad varían según navegador (Chrome/Edge suelen tener mejor soporte). Siempre se ofrece el formulario manual como alternativa.
- **Sin tests de reglas ni E2E:** la suite actual es unitaria. Se recomienda agregar tests con Firebase Emulator Suite y Playwright antes de un uso intensivo.
- **Datos de voz:** si se usa la entrada por voz, se guarda `rawTranscript` en el movimiento para trazabilidad. Es información sensible que conviene revisar antes de compartir exports.

---

## Checklist de producción

- [ ] Proyecto Firebase creado con Authentication (Google) y Firestore.
- [ ] Reglas e índices desplegados (`npm run deploy:rules`).
- [ ] Dominios de Vercel/localhost autorizados en Authentication.
- [ ] Variables `VITE_*` cargadas en Vercel.
- [ ] Build y typecheck verdes.
- [ ] Tests unitarios verdes.
- [ ] Login y onboarding probados en producción.
- [ ] Invitación probada con una segunda cuenta Google.
- [ ] App Check configurado y, si se fuerza, verificado.
- [ ] Backups/PITR y alertas de costo configurados.
- [ ] PWA instalada y probada en Android/iOS.
- [ ] Exportación CSV/XLSX probada con datos reales.
- [ ] Política de privacidad y consentimiento para datos financieros definidos por el hogar.

---

## Documentación adicional

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): arquitectura, modelo de datos, seguridad, decisiones y operación.
- [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md): ramas, ambientes (producción/staging) y comandos de deploy.
- [`docs/FIREBASE_SETUP.md`](docs/FIREBASE_SETUP.md): guía de consola paso a paso.
- [`firestore.rules`](firestore.rules): reglas de seguridad.
- [`firestore.indexes.json`](firestore.indexes.json): índices compuestos.
- [`functions/src/index.ts`](functions/src/index.ts): Cloud Function opcional de invitaciones.

---

Hecho para administrar el dinero de una familia sin planillas paralelas, sin doble contabilidad y sin depender de una IA opaca para registrar movimientos.
