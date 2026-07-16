# API de Mercado Público (ChileCompra) — Documentación de referencia para LicitIA

Fuente: portal oficial `https://www.chilecompra.cl/api/` + diccionarios de datos oficiales en PDF (licitaciones y órdenes de compra). Consolidado el 15-07-2026.

---

## 1. Cómo obtener el ticket (obligatorio, antes de tocar código)

1. Ir a `https://api.mercadopublico.cl/modules/IniciarSesion.aspx`, aceptar los Términos de Uso e iniciar sesión con **Clave Única**.
2. Solicitar el ticket vía formulario con nombre, RUT y correo reales — **se entrega un único ticket por persona**. Si detectan inconsistencias, pueden limitar o suspender el acceso.
3. El ticket llega al correo registrado.

Ticket de prueba público (solo para pruebas, no usar en producción):
```
F8537A18-6766-4DEF-9E59-426B4FEE2844
```

### Límites de uso (importantes para el diseño del `ChileCompraClient`)
- **10.000 solicitudes diarias por ticket**, límite no modificable.
- Monitoreo por IP: uso excesivo puede derivar en bloqueo temporal o permanente.
- Para descargas masivas, ChileCompra recomienda explícitamente correr los procesos **entre las 22:00 y las 07:00** (esto encaja bien con un job nocturno de APScheduler).
- No hay soporte por canales informales; solo formulario de sugerencias, respuesta en máx. 3 días hábiles.

---

## 2. Endpoints base

Formatos disponibles: `.json`, `.jsonp`, `.xml` (default: JSON si no se especifica).

| Recurso | Endpoint base |
|---|---|
| Licitaciones | `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json` |
| Órdenes de compra | `https://api.mercadopublico.cl/servicios/v1/publico/ordenesdecompra.json` |
| Buscar proveedor por RUT | `https://api.mercadopublico.cl/servicios/v1/Publico/Empresas/BuscarProveedor?rutempresaproveedor={RUT}` |
| Buscar organismos públicos | `https://api.mercadopublico.cl/servicios/v1/Publico/Empresas/BuscarComprador` |

El ticket va siempre como parámetro `&ticket=...`. Las fechas van en formato `ddmmaaaa` (ej: `12062026` = 12 de junio de 2026).

---

## 3. Tipos de consulta — Licitaciones

| Consulta | URL de ejemplo |
|---|---|
| Por código | `.../licitaciones.json?codigo=1509-5-L114&ticket=...` |
| Todos los estados, día actual | `.../licitaciones.json?ticket=...` |
| Todos los estados, fecha específica | `.../licitaciones.json?fecha=02022014&ticket=...` |
| Activas (publicadas al día de la consulta) | `.../licitaciones.json?estado=activas&ticket=...` |
| Por estado + fecha | `.../licitaciones.json?fecha=02022014&estado=adjudicada&ticket=...` |
| Por código de proveedor | `.../licitaciones.json?fecha=02022014&CodigoProveedor=17793&ticket=...` |
| Por código de organismo | `.../licitaciones.json?fecha=02022014&CodigoOrganismo=6945&ticket=...` |

**Nota de diseño clave**: la búsqueda por `codigo` ignora la fecha y siempre devuelve la ficha completa/detallada. Las demás búsquedas (por fecha/estado/organismo/proveedor) devuelven **información básica del listado del día**, no el detalle completo. Esto implica que tu flujo real es: (1) listar candidatas del día/rango por fecha o estado, (2) para cada `CodigoExterno` nuevo, hacer una segunda llamada por `codigo` para obtener el detalle completo. Tu prompt actual no distingue estas dos llamadas — conviene que el `ChileCompraClient` las modele como dos métodos separados (`search()` vs `get_detail(codigo)`).

Estados disponibles como parámetro `estado`: `publicada`, `cerrada`, `desierta`, `adjudicada`, `revocada`, `suspendida`, `todos`, `activas`.

Códigos de estado en la respuesta:
```
Publicada = 5   Cerrada = 6   Desierta = 7
Adjudicada = 8  Revocada = 18 Suspendida = 19
```

## 3.1 Tipos de consulta — Órdenes de compra (por si las usas más adelante)

Mismo patrón: `.../ordenesdecompra.json?codigo=2097-241-SE14&ticket=...`, filtros por fecha, estado, organismo, proveedor.

Códigos de estado OC: `Enviada a Proveedor=4, En proceso=5, Aceptada=6, Cancelada=9, Recepción Conforme=12, Pendiente de Recepcionar=13, Recepcionada Parcialmente=14, Recepción Conforme Incompleta=15`.

---

## 4. Diccionario de campos — Licitaciones (respuesta detallada)

Estructura raíz: `Licitaciones/Cantidad`, `Licitaciones/FechaCreacion`, `Licitaciones/Version`, `Licitaciones/Listado/Licitacion/...`

Campos más relevantes para el scoring/resumen de LicitIA (lista completa de 97 campos disponible en el PDF oficial, acá los que mapean directo a tu Fase 2/3):

| Campo | Descripción |
|---|---|
| `CodigoExterno` | Código único de la licitación — **usar como clave de deduplicación** |
| `Nombre` | Nombre de la licitación |
| `CodigoEstado` / `Estado` | Estado actual (ver tabla arriba) |
| `Descripcion` | Objeto de la contratación |
| `Comprador/NombreOrganismo`, `Comprador/RegionUnidad`, `Comprador/ComunaUnidad` | Organismo y ubicación — para tu filtro por región |
| `Fechas/FechaCierre`, `Fechas/FechaPublicacion`, `Fechas/FechaAdjudicacion` | Fechas clave del proceso |
| `MontoEstimado`, `VisibilidadMonto`, `Moneda` | Monto — ojo que puede no ser público (`VisibilidadMonto=0`) |
| `Tipo`, `CodigoTipo` | Tipo/tamaño de licitación (ver tabla de tipos abajo) — útil para filtrar por monto/categoría sin depender solo de `MontoEstimado` |
| `Etapas`, `EstadoEtapas` | Número de etapas (1 o 2) |
| `Items/Listado/ítem/NombreProducto`, `.../Categoria` (código UNSPSC) | Rubro/categoría del producto o servicio — probablemente tu mejor filtro por "palabra clave" real, ya que la API no tiene un parámetro de texto libre |
| `SubContratacion` | Si permite subcontratar (bit) |
| `Adjudicacion/UrlActa` | URL del acta de adjudicación (solo si está adjudicada) |

**Importante — riesgo que ya te había marcado, ahora confirmado**: revisé el diccionario oficial completo (97 campos) y **no existe ningún campo documentado que entregue URLs de descarga de los documentos/anexos adjuntos** (bases, formularios, anexos técnicos) de una licitación. La API pública solo entrega metadata estructurada, no los archivos. Esto significa que tu paso "Fase 1.4 — descargar automáticamente todos los PDFs asociados" probablemente **no se puede resolver solo con esta API**; vas a necesitar complementarlo con scraping controlado de la ficha web (`www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=...` o similar) para extraer los links de la sección de anexos. Vale la pena que se lo plantees explícitamente a Claude Code como una decisión de arquitectura en la Fase 1, no como un supuesto.

### Tabla — Tipo de licitación (`Tipo` / `CodigoTipo`)
```
L1 = Pública < 100 UTM        LE = Pública 100–1.000 UTM
LP = Pública 1.000–2.000 UTM  LQ = Pública 2.000–5.000 UTM
LR = Pública > 5.000 UTM      LS = Pública servicios personales especializados
E2 = Privada < 100 UTM        CO = Privada 100–1.000 UTM
B2 = Privada 1.000–2.000 UTM  H2 = Privada 2.000–5.000 UTM
I2 = Privada > 5.000 UTM
CodigoTipo: 1 = Pública, 2 = Privada
```

### Tabla — Moneda (`Moneda`)
```
CLP = Peso Chileno   CLF = Unidad de Fomento
USD = Dólar          UTM = Unidad Tributaria Mensual   EUR = Euro
```

### Tabla — Modalidad de pago (`Modalidad`)
```
1=30 días  2=30/60/90 días  3=al día  4=anual  5=bimensual
6=contra entrega  7=mensual  8=por avance  9=trimestral  10=60 días
```

### Otros campos binarios (0/1, salvo excepción indicada)
```
Informada, TomaRazon, EstadoPublicidadOfertas, SubContratacion,
ExtensionPlazo, EsBaseTipo, EsRenovable   → 1=Sí, 0=No
Obras                                      → 2=Sí, 1=No (ojo, invertido)
```

---

## 5. Cómo obtener códigos de organismo/proveedor (para filtros por organismo)

```
Proveedor por RUT:
https://api.mercadopublico.cl/servicios/v1/Publico/Empresas/BuscarProveedor?rutempresaproveedor=70.017.820-k&ticket=...

Listado completo de organismos públicos:
https://api.mercadopublico.cl/servicios/v1/Publico/Empresas/BuscarComprador?ticket=...
```

Esto te da `CodigoEmpresa` y `NombreEmpresa`, que después usas como `CodigoOrganismo` en las búsquedas de licitaciones.

---

## 6. Condiciones de uso relevantes para el diseño técnico

- Servicio gratuito, pero sin garantías: ChileCompra puede modificar, suspender o dar de baja el servicio en cualquier momento sin generar derechos adquiridos — diseña el `ChileCompraClient` desacoplado tal como ya planeabas, para poder absorber cambios de contrato sin tocar el resto del sistema.
- Si publicas datos obtenidos de la API sin modificarlos, debes citar a ChileCompra como fuente (aplica si tu informe ejecutivo se comparte fuera de tu uso personal).

---

## 7. Guías oficiales completas (PDFs fuente)

- Licitaciones: `https://www.chilecompra.cl/wp-content/uploads/2026/03/Documentacion-API-Mercado-Publico-Licitaciones.pdf`
- Órdenes de compra: `https://www.chilecompra.cl/wp-content/uploads/2026/03/Documentacion-API-Mercado-Publico-oc.pdf`
- Compra Ágil (no la pediste, pero existe si te sirve a futuro): `https://www.chilecompra.cl/wp-content/uploads/2026/05/Documentacion_API_Compra_Agil.pdf`
- Portal general: `https://www.chilecompra.cl/api/`

---

## 8. Ajustes sugeridos para tu prompt original (Fase 1)

1. Modelar `ChileCompraClient` con métodos separados `search_by_date()`, `search_by_state()`, `get_detail(codigo)` — no una sola función genérica, porque el detalle completo solo llega por código.
2. Reemplazar el filtro "palabra clave" por filtro sobre `Items/Listado/ítem/NombreProducto` o categoría UNSPSC, ya que no existe un parámetro de texto libre en la API.
3. Añadir explícitamente un paso de scraping controlado (o reevaluar el alcance) para obtener los documentos adjuntos, dado que la API no los expone.
4. Usar `CodigoExterno` como clave única para deduplicar en PostgreSQL.
5. Programar el job pesado de APScheduler en horario nocturno (22:00–07:00), como recomienda ChileCompra.
6. Añadir retry/backoff en `httpx` y un contador de requests diario para no acercarte al límite de 10.000.
