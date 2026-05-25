# Requisiciones de Compras Administrativas


Sistema web empresarial para la gestión de requisiciones de compras administrativas.

### Stack Tecnológico

- **Frontend:** HTML5, CSS3, JavaScript Vanilla (ES6+ modular)
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Hosting:** Netlify (con Functions para operaciones sensibles)
- **Gráficos:** Chart.js
- **Excel:** SheetJS (xlsx)
- **Control de versiones:** GitHub

### Funcionalidades

- Login seguro con Supabase Auth
- Formulario de requisiciones con campos automáticos
- IDs consecutivos (REQ-00001 a REQ-99999)
- Tabla con búsqueda, filtros por estado/fecha y paginación
- Ver detalle, editar, eliminar (soft delete) y cambiar estado
- Historial de cambios por requisición (auditoría completa)
- Dashboard con métricas y 4 gráficos interactivos (Chart.js)
- Actividad reciente del sistema
- Exportación a Excel con formato corporativo y hoja de resumen
- Panel de administración de usuarios (crear, editar, contraseña, activar/desactivar)
- Seguridad RLS en toda la base de datos
- Permisos por rol (administrador / usuario)
- Regla de negocio: Compras vs Proceso Autónomo

### Estructura del Proyecto

```
├── index.html                      → Página de login
├── dashboard.html                  → Dashboard con métricas y gráficos
├── requisiciones.html              → Formulario + tabla de requisiciones
├── admin.html                      → Panel de administración de usuarios
├── netlify.toml                    → Configuración de Netlify
├── assets/
│   ├── logo-login.png              → Logo para página de login
│   ├── logo-header.png             → Logo para header (fondo azul)
│   ├── logo.png                    → Logo general
│   ├── favicon.svg                 → Favicon vectorial
│   ├── favicon.ico                 → Favicon ICO (respaldo)
│   └── favicon-*.png               → Favicons en múltiples tamaños
├── css/
│   ├── variables.css               → Variables CSS corporativas
│   ├── global.css                  → Estilos base y reset
│   ├── components.css              → Toast, loader, modal
│   ├── login.css                   → Estilos del login
│   └── requisiciones.css           → Estilos de requisiciones y layout
├── js/
│   ├── config/
│   │   └── supabase.js             → Conexión con Supabase
│   ├── services/
│   │   ├── auth.service.js         → Autenticación y sesiones
│   │   ├── requisiciones.service.js → CRUD de requisiciones
│   │   └── historial.service.js    → Consultas de auditoría
│   ├── components/
│   │   ├── toast.js                → Notificaciones
│   │   ├── loader.js               → Indicadores de carga
│   │   └── modal.js                → Modales reutilizables
│   ├── modules/
│   │   ├── login.js                → Lógica del login
│   │   ├── acciones-requisiciones.js → Ver, editar, eliminar, estado, historial
│   │   └── exportar-excel.js       → Exportación a Excel
│   └── utils/
│       └── formatters.js           → Formato moneda COP, fechas
├── netlify/
│   └── functions/
│       └── admin-users.js          → Función serverless para crear usuarios
└── sql/
    └── 01_base_datos_completa.sql  → Script SQL completo
```

### Configuración Inicial

1. Crear proyecto en Supabase (región São Paulo)
2. Ejecutar `sql/01_base_datos_completa.sql` en el SQL Editor
3. Ejecutar el fix de RLS (función `es_administrador()`)
4. Crear usuario admin en Authentication y su perfil
5. Configurar credenciales en `js/config/supabase.js`
6. Configurar variables de entorno en Netlify:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
7. Desplegar en Netlify conectando el repositorio de GitHub

### Colores Corporativos

- Azul: `#00369C`
- Amarillo: `#F6D000`
- Gris: `#A4A8AB`

### Costo

$0/mes en plan gratuito (Supabase Free + Netlify Free + GitHub Free)
