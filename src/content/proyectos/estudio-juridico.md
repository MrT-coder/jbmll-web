---
titulo: Sitio corporativo y CMS autogestionable para un estudio jurídico
desc: Plataforma full-stack que el personal no técnico administra sin tocar código.
estado: produccion
fecha: 2025-01
destacado: true
st:
  - PHP
  - Laravel
  - Filament
  - Inertia.js
  - React
  - TypeScript
  - Tailwind CSS
  - PostgreSQL
  - Docker
  - GitHub Actions
  - Pest
  - Vitest
  - Cloudflare
kw:
  - CMS
  - RBAC
  - CI/CD
  - endurecimiento
  - SSR
---

Diseñé y construí una plataforma corporativa full-stack con un panel
administrativo que permite al personal no técnico gestionar todas las secciones
públicas —servicios, publicaciones, logros, equipo, sucursales e identidad del
sitio— sin intervención de desarrollo.

## Acceso

Implementé control de acceso basado en roles con políticas por modelo, de manera
que cada perfil accede únicamente al contenido que le corresponde.

## El sitio público

Lo construí como una SPA dirigida por el servidor con Inertia.js, React y
TypeScript, con soporte para renderizado en el servidor.

## Endurecimiento del formulario de contacto

Un formulario público es la puerta más barata para abusar de un sitio. Lo cerré
con verificación por Turnstile, límite de peticiones, CSRF, orígenes CORS
restringidos, sesiones cifradas con cookies seguras y cabeceras CSP, HSTS y
Permissions-Policy.

## Imágenes

Automaticé el tratamiento de recursos con un componente de carga que convierte y
comprime a WebP, reduciendo el peso de las páginas sin trabajo manual.

## Integración y despliegue

Configuré un pipeline de integración continua con verificaciones estáticas y una
suite de 148 pruebas como condición de fusión, que construye y publica una imagen
de contenedor. El servidor nunca compila: solo descarga la imagen ya construida.

Desplegué dos entornos, integración y producción, con base de datos PostgreSQL,
un contenedor dedicado a la cola de trabajos y migraciones automáticas al
arranque.

El entorno de integración no es indexable, y eso se decide con una bandera de
entorno explícita en lugar de deducirlo del nombre del entorno. Deducirlo es
justo cómo un sitio de pruebas termina compitiendo con el de producción en los
buscadores.

## Mapas

Reemplacé el selector de mapas de pago por uno basado en Leaflet y OpenStreetMap,
que no necesita clave de API. Eliminó un costo recurrente y, con él, una clave
que administrar y que se puede filtrar.
