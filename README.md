# Requisiciones de Compras Administrativas

## Electroingeniería S.A.S.

Sistema web empresarial para la gestión de requisiciones de compras administrativas.

### Stack Tecnológico

- **Frontend:** HTML5, CSS3, JavaScript Vanilla (ES6+ modular)
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Hosting:** Netlify
- **Control de versiones:** GitHub

### Estructura del Proyecto

```
├── index.html              → Página de login
├── dashboard.html           → Dashboard principal
├── css/
│   ├── variables.css        → Variables CSS corporativas
│   ├── global.css           → Estilos base
│   ├── components.css       → Toast, loader, modal
│   └── login.css            → Estilos del login
├── js/
│   ├── config/
│   │   └── supabase.js      → Conexión con Supabase
│   ├── services/
│   │   └── auth.service.js  → Autenticación
│   ├── components/
│   │   ├── toast.js         → Notificaciones
│   │   └── loader.js        → Indicadores de carga
│   └── modules/
│       └── login.js         → Lógica del login
├── assets/                  → Logo e imágenes
├── sql/                     → Scripts de base de datos
├── netlify.toml             → Configuración Netlify
└── README.md
```

### Configuración Inicial

1. Crear proyecto en Supabase
2. Ejecutar el SQL en `sql/01_base_datos_completa.sql`
3. Configurar las credenciales en `js/config/supabase.js`
4. Desplegar en Netlify conectando el repositorio de GitHub

### Colores Corporativos

- Azul: `#00369C`
- Amarillo: `#F6D000`
- Gris: `#A4A8AB`
