# Quantiv SaaS — Guía de instalación y despliegue

## Paso 1 — Instalar Node.js

Descarga e instala Node.js LTS desde: https://nodejs.org
(elige "LTS" → "macOS Installer")

Verifica con: `node --version` y `npm --version`

---

## Paso 2 — Crear cuenta y proyecto en Supabase (gratis)

1. Ve a https://supabase.com y crea una cuenta gratuita
2. Crea un nuevo proyecto (anota la contraseña del proyecto)
3. En el dashboard del proyecto ve a **Settings → API**
4. Copia:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public key** → `eyJhbGci...`

---

## Paso 3 — Crear la tabla en Supabase

1. En Supabase: **SQL Editor → New query**
2. Pega el contenido de `supabase-schema.sql` y ejecútalo
3. Ve a **Authentication → Email** y asegúrate de que esté habilitado

---

## Paso 4 — Configurar variables de entorno

Crea el archivo `.env.local` en la raíz del proyecto:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

(copia los valores del Paso 2)

---

## Paso 5 — Instalar dependencias y correr localmente

Abre Terminal, navega a la carpeta del proyecto y ejecuta:

```bash
cd "/Users/percy/Library/CloudStorage/OneDrive-Personal/Documentos/SupplyChain Software/quantiv-saas"
npm install
npm run dev
```

Abre http://localhost:3000 en el navegador.

---

## Paso 6 — Desplegar en Vercel (gratis)

1. Crea cuenta en https://vercel.com con tu GitHub/Google
2. Sube el proyecto a GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # crea repo en github.com y sigue las instrucciones
   ```
3. En Vercel: **New Project → Import** tu repositorio de GitHub
4. En **Environment Variables** agrega las mismas variables de `.env.local`
5. Haz clic en **Deploy** — en 2 minutos tienes una URL pública

---

## Estructura del proyecto

```
quantiv-saas/
├── app/
│   ├── page.tsx              ← Landing page (marketing)
│   ├── (auth)/
│   │   ├── login/page.tsx    ← Login
│   │   └── register/page.tsx ← Registro
│   └── (app)/
│       ├── dashboard/page.tsx ← Lista de simulaciones
│       └── sim/
│           ├── new/page.tsx   ← Nuevo simulador
│           └── [id]/page.tsx  ← Ver simulación guardada
├── components/
│   ├── SimulatorClient.tsx   ← El simulador completo (React)
│   ├── AppShell.tsx          ← Header con navegación
│   └── DeleteSimButton.tsx
├── lib/supabase/
│   ├── client.ts             ← Cliente browser
│   └── server.ts             ← Cliente servidor (SSR)
├── public/js/
│   └── simulation.js         ← Lógica de simulación original
├── middleware.ts             ← Protección de rutas
├── supabase-schema.sql       ← Schema de base de datos
└── .env.local                ← Credenciales (NO subir a GitHub)
```

## Próximos pasos sugeridos

- [ ] Agregar confirmación de email en Supabase (Authentication → Email Templates)
- [ ] Configurar dominio personalizado en Vercel
- [ ] Agregar plan de organización / multi-usuario para instituciones educativas
- [ ] Agregar simulaciones compartibles por link público
