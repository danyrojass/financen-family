# Configuración de Firebase — paso a paso

Guía operativa para conectar la app a un proyecto de Firebase desde cero. Está pensada para alguien con acceso de owner al proyecto y a la consola de Google Cloud.

> La app no incluye credenciales privadas. Solo usa la configuración web pública de Firebase (`VITE_FIREBASE_*`). La seguridad se implementa con Firestore Rules y, opcionalmente, App Check.

---

## 1. Requisitos

- Cuenta de Google con acceso a [Firebase Console](https://console.firebase.google.com/).
- Node.js 20.19+ y npm.
- Un repositorio local de este proyecto.
- Opcional: [Firebase CLI](https://firebase.google.com/docs/cli) instalado globalmente (`npm i -g firebase-tools`) o usando `npx firebase-tools`.

---

## 2. Crear el proyecto

1. Abrir [Firebase Console](https://console.firebase.google.com/).
2. **Agregar proyecto**.
3. Elegir un nombre, por ejemplo `financen-family`.
4. Google Analytics es opcional. Si se habilita, elegir una cuenta y ubicación.
5. Esperar la creación.

### Registrar la app web

1. En la portada del proyecto, tocar el ícono **Web** (`</>`).
2. Elegir un apodo, por ejemplo `Finanzas del Hogar Web`.
3. **No** marcar Firebase Hosting en este paso (se puede configurar después).
4. Copiar el objeto `firebaseConfig`:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
  measurementId: "G-...",
}
```

5. Guardar esos valores en `.env.local` (ver §4).

---

## 3. Habilitar Authentication con Google

1. Ir a **Authentication**.
2. **Comenzar** si es la primera vez.
3. Pestaña **Sign-in method**.
4. Habilitar **Google**.
5. Elegir el email de soporte del proyecto.
6. Guardar.

### Configurar la pantalla de consentimiento

1. Ir a **Google Cloud Console → APIs & Services → OAuth consent screen** para el mismo proyecto.
2. Tipo de usuario:
   - **External** para cuentas personales de Google.
   - **Internal** solo si se usa Google Workspace y todos los usuarios son de la organización.
3. Completar nombre de la app, email de soporte y datos de desarrollador.
4. Scopes: los básicos (`email`, `profile`, `openid`) son suficientes.
5. Si la app queda en modo **Testing**, agregar como **test users** a todas las cuentas que van a ingresar (incluidas las de la familia).
6. Para producción, publicar la app cuando corresponda.

### Dominios autorizados

1. **Authentication → Settings → Authorized domains**.
2. Agregar:
   - `localhost`
   - `tu-proyecto.vercel.app`
   - `tu-dominio.com` (si existe)
   - `tu-proyecto.firebaseapp.com` (si se usa Firebase Hosting)
   - `tu-proyecto.web.app` (si se usa Firebase Hosting)

Sin el dominio correcto, el login falla con `auth/unauthorized-domain`.

### Allowlist de cuentas

La app solo acepta las cuentas listadas en dos lugares que deben quedar sincronizados:

- `firestore.rules` → helper `isAllowedEmail()` (barrera real, del lado del servidor).
- `src/domain/access.ts` → `ALLOWED_EMAILS` (cierra la sesión y muestra el error en la UI).

Actualmente: `isaux13@gmail.com` y `danyrojassimon@gmail.com`.

Para habilitar otra cuenta, agregarla en ambos archivos, correr los tests y desplegar las reglas:

```bash
npx vitest run
npm run deploy:rules
```

Cualquier otra cuenta de Google puede autenticarse, pero las reglas le niegan toda lectura/escritura y la app la desloguea de inmediato.

---

## 4. Crear Firestore

1. Ir a **Firestore Database**.
2. **Crear base de datos**.
3. Elegir **Modo de producción** (no modo de prueba).
4. Elegir la ubicación:
   - `southamerica-east1` (São Paulo) para Paraguay/Argentina/Brasil.
   - `us-central1` o `nam5` si el público está en Norteamérica.
   - La ubicación **no se puede cambiar** después.
5. Esperar la creación.

### Desplegar reglas e índices

Desde la raíz del repositorio:

```bash
npx firebase-tools login
npx firebase-tools use --add
```

Elegir el proyecto y asignarle un alias (por ejemplo `default` o `financen`). Luego:

```bash
npm run deploy:rules
```

Equivalente:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

Los archivos son:

- `firestore.rules`
- `firestore.indexes.json`

Los índices pueden tardar varios minutos en construirse. La app funciona con los índices automáticos para las consultas actuales; los compuestos quedan listos para filtros server-side.

### Verificar reglas

En **Firestore → Rules**, confirmar que aparece el contenido de `firestore.rules` y que la fecha de publicación es reciente. Si la app devuelve `permission-denied` en todas las operaciones, lo más probable es que las reglas no se hayan desplegado.

---

## 5. Variables de entorno

Crear `.env.local` a partir de `.env.example`:

**macOS/Linux:**

```bash
cp .env.example .env.local
```

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env.local
```

Completar:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=G-...

VITE_FIREBASE_APP_CHECK_SITE_KEY=
VITE_USE_CLOUD_FUNCTIONS=false
VITE_FUNCTIONS_REGION=southamerica-east1
VITE_DEFAULT_USD_RATE=7500
```

Notas:

- `VITE_FIREBASE_STORAGE_BUCKET` y `VITE_FIREBASE_MEASUREMENT_ID` no son obligatorios para el funcionamiento.
- Si falta una variable obligatoria, la app muestra una pantalla de configuración.
- Reiniciar `npm run dev` después de cambiar `.env.local`; Vite no recarga variables de entorno en caliente.

### Variables en Vercel

En **Project → Settings → Environment Variables**, cargar las mismas variables para Production, Preview y Development. Volver a desplegar después de cambiarlas.

---

## 6. Primer arranque

```bash
npm install
npm run dev
```

Abrir `http://localhost:5173`.

1. **Ingresar con Google**.
2. Completar el onboarding: nombre del hogar, moneda base y cotización USD.
3. Verificar en Firestore:
   - `users/{uid}` con `householdIds` y `activeHouseholdId`;
   - `households/{hid}` con `ownerId`, `baseCurrency`, `fxRates`;
   - `households/{hid}/members/{uid}` con `role: OWNER`;
   - categorías iniciales en `households/{hid}/categories`.
4. Crear una cuenta (por ejemplo “Efectivo” en PYG).
5. Registrar un gasto.
6. Verificar que el panel muestra el movimiento y que el saldo de la cuenta baja.

---

## 7. Invitaciones

1. En **Ajustes → Integrantes**, generar una invitación.
2. Copiar el enlace (`/join/{householdId}/{invitationId}`).
3. Abrirlo en una ventana de incógnito o en otro dispositivo.
4. Ingresar con la segunda cuenta de Google.
5. Aceptar.

Consideraciones:

- Si la invitación está reservada a un email, solo esa cuenta puede aceptarla.
- La app genera invitaciones de 7 días; las reglas aceptan como máximo 30.
- El enlace se comparte manualmente; no se envían correos.
- Si el segundo usuario está en modo Testing de OAuth, debe estar agregado como test user.

### Probar el flujo con Cloud Function (opcional)

1. Activar el plan Blaze.
2. `cd functions && npm install && npm run build`
3. `npx firebase-tools deploy --only functions`
4. Poner `VITE_USE_CLOUD_FUNCTIONS=true` en `.env.local` y en Vercel.
5. Redeployar el frontend.
6. Probar una invitación nueva.

La función se llama `acceptInvitation`, vive en `southamerica-east1` y su código está en `functions/src/index.ts`.

---

## 8. App Check (recomendado)

1. Ir a **App Check**.
2. Registrar la app web con **reCAPTCHA v3**.
3. En Google Cloud Console, crear una site key de reCAPTCHA v3 para los dominios de producción y localhost.
4. Copiar la site key en `VITE_FIREBASE_APP_CHECK_SITE_KEY`.
5. Redeployar.
6. En **App Check → APIs**, revisar métricas de Firestore y Authentication.
7. Cuando el tráfico legítimo esté verificado, activar **Enforce**.

Si se fuerza App Check sin la site key en el frontend, la app deja de funcionar. Hacer el rollout en este orden: monitoreo → verificación → enforcement.

Para Cloud Functions con App Check, revisar que la enforcement de Functions también esté configurada correctamente. Si hay problemas, desactivar temporalmente la enforcement de Functions y revisar logs.

---

## 9. Despliegue en Vercel

1. Subir el proyecto a un repositorio Git.
2. En Vercel, importar el repositorio.
3. Framework: **Vite**.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Cargar variables de entorno.
7. Deploy.
8. Agregar el dominio de Vercel a **Authorized domains** en Firebase Authentication.
9. Probar login, onboarding, movimiento y PWA.

`vercel.json` ya incluye el rewrite SPA y los headers de seguridad.

### Alternativa: Firebase Hosting

```bash
npm run build
npx firebase-tools deploy --only hosting
```

`firebase.json` ya configura `public: "dist"` y el rewrite a `index.html`.

---

## 10. Emuladores locales (opcional)

La app usa el proyecto real por defecto. Para trabajar sin tocar producción:

1. Instalar Java 11+ (requisito de los emuladores de Firestore).
2. `npx firebase-tools emulators:start`
3. Configurar el SDK para conectarse a los emuladores. El repositorio no incluye un switch automático de emulador; se puede agregar en `src/lib/firebase.ts` usando `connectAuthEmulator` y `connectFirestoreEmulator` cuando `import.meta.env.DEV` y una variable `VITE_USE_EMULATORS=true` estén activas.
4. Ejecutar los tests de reglas contra el emulador.

Los puertos configurados en `firebase.json` son:

- Auth: `9099`
- Firestore: `8080`
- Functions: `5001`
- UI: `4000`

---

## 11. Troubleshooting

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `auth/unauthorized-domain` | Dominio no autorizado | Agregarlo en Authentication → Settings → Authorized domains. |
| `auth/popup-blocked` | El navegador bloqueó el popup | Permitir popups para el dominio o usar otro navegador. |
| `auth/operation-not-allowed` | Google Sign-In deshabilitado | Habilitarlo en Authentication → Sign-in method. |
| `permission-denied` en todo | Reglas no desplegadas o incorrectas | `npm run deploy:rules`; revisar la pestaña Rules. |
| `permission-denied` solo al aceptar invitación | Invitación vencida, revocada o email distinto | Generar una nueva; verificar la cuenta de Google. |
| `The query requires an index` | Falta un índice compuesto | Desplegar `firestore.indexes.json` y esperar la construcción. |
| `FirebaseError: Missing or insufficient permissions` al leer un hogar | El usuario no es miembro o fue expulsado | Verificar `households/{hid}/members/{uid}`. |
| App Check 403 | Enforcement activo sin token válido | Configurar la site key y redeployar; revisar dominios de reCAPTCHA. |
| Functions `not-found` | Región incorrecta o función no desplegada | Verificar `VITE_FUNCTIONS_REGION` y `REGION` en `functions/src/index.ts`. |
| La PWA no se actualiza | Service worker cacheado | Cerrar todas las pestañas, recargar; en DevTools → Application → Service Workers → Update. |
| El build falla por variables | Faltan `VITE_*` en Vercel | Cargarlas y redeployar. |
| `auth/too-many-requests` | Rate limit | Esperar y reintentar; revisar cuotas. |
| Firestore `unavailable` | Sin red o cuota | La app usa caché; revisar conexión y cuotas de Firestore. |

### Logs útiles

- **Firebase Console → Firestore → Usage** para lecturas/escrituras.
- **Authentication → Users** para verificar cuentas.
- **Functions → Logs** si se usa la Cloud Function.
- **Google Cloud Console → Logging** para errores de backend.
- Consola del navegador para errores del SDK.

---

## 12. Checklist de seguridad

- [ ] Firestore en modo producción, no test.
- [ ] Reglas desplegadas y revisadas.
- [ ] Índices desplegados.
- [ ] Dominios de Authentication restringidos.
- [ ] OAuth consent screen configurado y, si aplica, publicado.
- [ ] App Check configurado y en enforcement.
- [ ] Variables de entorno solo en Vercel/Firebase, nunca en el repositorio.
- [ ] Backup/PITR de Firestore activo.
- [ ] Alertas de presupuesto de Google Cloud configuradas.
- [ ] Invitaciones pendientes revisadas y revocadas las que no se usan.
- [ ] Tests de reglas ejecutados en el emulador antes de cambios importantes.
