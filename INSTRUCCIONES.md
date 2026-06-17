# 🚀 Paquete: Cotizaciones + Flujo Desacoplado

Esta entrega cumple dos cosas:

1. **Funcionalidad nueva** — Compras puede ir cargando cotizaciones de proveedores
   mientras el jefe aún no aprueba. El jefe ve las cotizaciones para apoyar
   su decisión. Si el valor es muy alto, puede rechazar.
2. **Renovación visual completa** — escena animada en login, banners ilustrados
   en todas las páginas internas, contadores animados, micro-interacciones.

---

## ⚠️ ORDEN DE DESPLIEGUE (IMPORTANTE)

**Hay que hacer el paso 1 ANTES del paso 2**, o el código nuevo fallará al
buscar tablas/columnas que aún no existen.

### Paso 1 — Ejecutar la migración SQL en Supabase

1. Entra a tu proyecto en **supabase.com** → menú lateral **"SQL Editor"**
2. Click en **"New query"**
3. Abre el archivo `sql/02_cotizaciones_y_flujo.sql` del ZIP, copia TODO
   su contenido y pégalo en el editor
4. Click en **"Run"** (botón verde)
5. Al final debes ver una fila con resultados así:

   | estado | columna_aprobacion | tabla_cotizaciones | bucket_cotizaciones |
   |---|---|---|---|
   | Migración aplicada | 1 | 1 | 1 |

   Si los cuatro valores son `1`, ¡todo quedó listo!

> 🔒 **Es idempotente** — si por accidente lo corres dos veces, no rompe nada.

### Paso 2 — Subir el código a GitHub

1. **Descomprime** este ZIP en tu computador.
2. Entra a tu repo en **GitHub** → botón **"Add file" → "Upload files"**.
3. **Arrastra TODO el contenido descomprimido** (los `.html` + las carpetas
   `css/`, `js/`, `sql/`) a la ventana de GitHub.
4. Mensaje de commit sugerido:
   *"feat: cotizaciones de proveedores + flujo desacoplado de aprobación + renovación visual"*
5. Click en **"Commit changes"**.

Vercel detecta el cambio y despliega en 1-2 minutos. ✅

> ⚠️ **Mantén las carpetas tal cual** vienen en el ZIP. Cada archivo debe
> quedar en su ruta original (`css/cotizaciones.css`, `js/services/cotizaciones.service.js`, etc.)

---

## 🔄 ¿Qué cambió en el flujo?

### Antes
```
Usuario crea → estado=Pendiente aprobación
   ↓ (Compras no puede tocar nada)
Jefe aprueba → estado=Pendiente
   ↓
Compras → En cotización → En proceso → Cumplido
```

### Ahora
```
Usuario crea → estado=Pendiente aprobación, aprobacion_pendiente=true
   ↓
   ├─→ Jefe aprueba (puede hacerlo en cualquier momento)
   │     └─→ aprobacion_pendiente=false (estado puede haber avanzado o no)
   │
   └─→ Compras puede mover a "En cotización" SIN esperar
         └─→ Carga 1+ cotizaciones (proveedor, valor, PDF opcional)
         └─→ Marca una como GANADORA con un check
         └─→ El jefe las ve cuando va a aprobar

Compras NO puede pasar a "En proceso" hasta que aprobacion_pendiente=false
```

---

## 🆕 Archivos nuevos del paquete

### Base de datos
| Archivo | Qué hace |
|---|---|
| `sql/02_cotizaciones_y_flujo.sql` | Crea tabla `cotizaciones`, agrega columna `aprobacion_pendiente`, crea bucket de Storage `cotizaciones-archivos` con RLS y triggers |

### Código
| Archivo | Qué hace |
|---|---|
| `js/services/cotizaciones.service.js` | CRUD de cotizaciones + manejo de archivos |
| `js/modules/cotizaciones-modal.js` | Modal de gestión + panel para el jefe |
| `css/cotizaciones.css` | Estilos animados del modal y panel |
| `css/animaciones.css` | Sistema de animaciones global |
| `js/animaciones.js` | Contadores animados en dashboard |

### Modificados (lógica)
| Archivo | Cambio |
|---|---|
| `js/modules/acciones-requisiciones.js` | `puedeCambiarEstado` y `puedeAprobar` reconocen la nueva fase. `aprobarRequisicion` muestra cotizaciones al jefe y conserva el estado si ya está en cotización |
| `requisiciones.html` | Botón **"Cotizaciones"** en la tabla + badge contador |
| `dashboard.html` | Banner pulsante amarillo para Compras: *"X requisiciones nuevas esperando aprobación → ya puedes cotizar"* |

### Renovación visual
| Archivo | Cambio |
|---|---|
| `index.html` | Login con escena animada (avión, nubes, documentos, carrito, tiquete, moneda) |
| `dashboard.html` `requisiciones.html` `tiquetes.html` `admin.html` | Banner ilustrado animado en cada uno con tema apropiado |
| `css/login.css` | Fondo del login con resplandores y profundidad |

---

## ✅ Cómo probarlo después del despliegue

1. **Entra como usuario común** → crea una requisición de prueba.
   Verás que queda en *"Pendiente aprobación"*.

2. **Entra como admin de compras** → ve al **Dashboard**.
   Debe aparecer el banner amarillo pulsante con el conteo de pendientes.
   Click en *"Ir a cotizar"*.

3. **En requisiciones** → click en el botón **"+ Cotizar"** de tu requisición.
   Se abre el modal animado. Agrega 2-3 cotizaciones con diferentes proveedores
   y valores. Marca una como ganadora con el check.

4. **Cambia el estado** a *"En cotización"*. El sistema te dirá que el jefe
   todavía debe aprobar. Intenta pasarla a *"En proceso"* → debe bloquearte.

5. **Entra como jefe del proceso** → al aprobar, verás el panel con las
   cotizaciones que Compras cargó. Aprueba o rechaza.

6. **Si aprobaste**: vuelve como Compras → ahora sí puedes pasar a *"En proceso"*.

---

## 🎨 Detalles de calidad

- **Accesibilidad**: respeta `prefers-reduced-motion` del sistema operativo.
- **Rendimiento**: todas las ilustraciones son SVG (~10KB cada una). Cero imágenes externas.
- **Responsive**: el modal de cotizaciones se reorganiza en celular.
- **Auditoría**: cada acción sobre cotizaciones queda en el historial existente
  (creación, edición, eliminación, marcado como ganadora).
- **Storage**: los archivos quedan en bucket privado con URLs firmadas temporales (1 hora).
- **Backward compatible**: las requisiciones ya existentes funcionan igual,
  la migración hace backfill automático del campo nuevo.

---

## 🐛 Si algo falla

- **"No puedo subir cotizaciones"** → revisa que el bucket
  `cotizaciones-archivos` exista en Supabase → **Storage**.
- **"No veo el botón Cotizaciones"** → tu rol debe ser `admin_compras`,
  `administrador` o `super_admin`.
- **"El SQL marcó error de política duplicada"** → es seguro, la migración
  hace `DROP POLICY IF EXISTS` antes de crear. Vuelve a correrla y queda OK.
- **"El jefe no ve las cotizaciones al aprobar"** → verifica que existan
  cotizaciones cargadas (badge amarillo "📋 N" en la fila de la tabla).
