# Ambientes y ramas — Finanzas del Hogar

Última actualización: 2026-11-17.

## Mapa de ambientes

| Rama | Web | Firebase | Stripe |
| --- | --- | --- | --- |
| `main` | Vercel **Production** + Firebase Hosting (`financen-family.web.app`) | alias `default` → `financen-family` | live (cuando se defina) |
| `feature/*` | Vercel **Preview** | alias `staging` → `<staging-project-id>` | test |

No hay rama `develop` en este repositorio: las features salen de `main` y vuelven a `main` por PR.

## Estado actual

- El proyecto de **staging todavía no existe**. Crearlo en Firebase Console con Authentication (Google) y Cloud Firestore, y reemplazar `<staging-project-id>` en `.firebaserc` por el ID real.
- La **allowlist sigue hardcodeada** en `src/domain/access.ts` y en `firestore.rules` (`isAllowedEmail()`). No quitarla: la beta cerrada admite solo esos dos emails. Cualquier cambio de acceso requiere actualizar ambos archivos y volver a desplegar reglas.
- `.env.local` es local e ignorado y hoy apunta a **producción**. No commitearlo.
- El `VERCEL_OIDC_TOKEN` guardado en `.env.local` está vencido. Para deploys de Vercel conviene usar la integración Git del repositorio o un `VERCEL_TOKEN` como secreto, en vez del token local.

## Comandos

| Comando | Efecto |
| --- | --- |
| `npm run deploy:rules` | Reglas e índices en **producción** (alias por defecto). Igual que `deploy:rules:prod`. |
| `npm run deploy:hosting` | Frontend en **producción**. Igual que `deploy:hosting:prod`. |
| `npm run deploy:rules:staging` | Reglas e índices en **staging**. |
| `npm run deploy:hosting:staging` | Frontend en **staging**. |
| `npm run deploy:functions:staging` | Cloud Functions en **staging** (plan Blaze). |
| `npm run emulators` | Emuladores locales de Auth, Firestore y Functions. |

**Regla de seguridad:** los scripts sin sufijo `:staging` despliegan a producción. Antes de ejecutarlos, confirmar la rama y el alias con `git branch --show-current` y `firebase use`.

## Variables de entorno

- Las variables `VITE_*` se inyectan en el bundle en tiempo de build: el mismo código compilado contra staging y contra producción no es intercambiable.
- En Vercel: cargar las variables de **Production** apuntando a `financen-family` y las de **Preview** apuntando al proyecto staging.
- En local: `.env.local` continúa apuntando a producción. Para probar staging, reemplazar temporalmente los valores `VITE_FIREBASE_*` por los del proyecto staging y restaurarlos después. Nunca versionar ese archivo.

## Pagos (pendiente de decisión)

- Stripe **no es una billetera** ni paga a las cuentas de los usuarios: es un procesador. El dinero se liquida en la cuenta bancaria del comercio según el calendario de payouts; desde ahí se puede transferir a una billetera propia, pero Stripe no desembolsa directamente en Takenos.
- Según la [disponibilidad oficial de Stripe](https://stripe.com/global), Paraguay **no es un país soportado** para abrir cuenta. Las alternativas son Stripe Atlas (constituir una LLC en EE.UU.) o un procesador local (por ejemplo Bancard). Esto define si se usa Stripe o no; no implementar billing hasta resolverlo.
- Las claves secretas de Stripe y el `STRIPE_WEBHOOK_SECRET` van solo en Cloud Functions. Nunca en variables `VITE_*`.

## Seguridad y operación

- Rotar y borrar la service account `financen-family.json`: la clave privada estuvo expuesta en el repositorio.
- Configurar App Check en modo monitoreo antes de habilitar enforcement.
- Activar backups/PITR y alertas de presupuesto en Firebase.
- Antes de mergear a `main`: `npm run typecheck`, `npm test`, `npm run build` y smoke test en Preview.
