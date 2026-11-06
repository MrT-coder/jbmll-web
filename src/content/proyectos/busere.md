---
titulo: BUSERE, plataforma de evaluación psicológica multi-test
desc: Psicólogos crean sus propias pruebas, las aplican por enlace a evaluados sin cuenta y descargan el informe en PDF.
estado: construyendo
contexto: personal
fecha: 2026-04
destacado: false
st:
  - Java
  - Spring Boot
  - Spring Modulith
  - PostgreSQL
  - Testcontainers
  - Playwright
  - Nuxt
  - Vue.js
  - TypeScript
  - Tailwind CSS
  - Vitest
  - Astro
  - Docker
  - Cloudflare
  - GitHub Actions
kw:
  - evaluación psicológica
  - monolito modular
  - arquitectura hexagonal
  - cifrado de datos
  - privacidad de datos
  - generación de informes PDF
  - sistema de créditos
demo: https://busere.com
borrador: false
---

Construí BUSERE, una plataforma donde cada psicólogo diseña sus propias pruebas psicológicas y las usa con sus evaluados. El sistema no trae pruebas precargadas: el psicólogo arma la suya por secciones, cada una con sus ítems, escala, puntaje y categorías. Después envía un enlace al evaluado, que la responde sin crear cuenta, y descarga el informe en PDF. Las pruebas son privadas de su autor.

![Listado de pruebas del psicólogo, con una prueba de ejemplo publicada y su precio por evaluación](/media/busere-tests.webp "El psicólogo crea sus pruebas y las publica para usarlas en sus enlaces.")

## Créditos prepago, sin comisiones

El psicólogo paga por cada aplicación con créditos prepago, sin mensualidades, y fija libremente lo que cobra a sus evaluados: la plataforma no toma comisión. Al crear un enlace se reserva un crédito, que se consume solo cuando se entrega el informe; si no se entrega, vuelve al saldo. Las recargas se hacen por transferencia y las aprueba el administrador.

## Monolito modular con fronteras verificadas

Escribí la API en Java 25 con Spring Boot 4 y Spring Modulith, con arquitectura hexagonal dentro de cada módulo: identidad, pruebas, enlaces, créditos, recargas, informes, entre otros. Las fronteras entre módulos se comprueban con pruebas, para que el diseño no se degrade con el tiempo. La suite tiene 351 clases de pruebas unitarias y 126 de integración sobre PostgreSQL real con Testcontainers.

## Datos de evaluados: cifrados y efímeros

Las respuestas de los evaluados se guardan cifradas con AES-256-GCM, con rotación de claves, y se purgan después de que se descarga el informe. Al modelo de IA que redacta parte del informe solo le llegan puntajes, categorías y edad, nunca el nombre, la cédula ni datos de contacto. Revisé el diseño contra la Ley Orgánica de Protección de Datos Personales.

## Autenticación propia en lugar de un proveedor externo

Implementé sesiones con cookie HttpOnly, cabecera CSRF y contraseñas con Argon2. El inicio de sesión tiene límite de intentos sin bloquear la cuenta y no revela qué correos están registrados. Para un producto con pocos roles, me evitó operar un servidor de identidad aparte.

## Informes PDF con Chromium

Genero los informes con plantillas Thymeleaf renderizadas en Chromium sin interfaz, con los gráficos en SVG dentro del documento. Descarté JasperReports para poder diseñar el informe con HTML y CSS. Los trabajos de generación usan una cola sobre PostgreSQL en lugar de Redis, con una pieza de infraestructura menos.

![Informe de resultados de una prueba de ejemplo, con tabla de puntajes por escala, perfil gráfico e interpretación](/media/busere-informe.webp "Informe de una evaluación de ejemplo, tal como se descarga en PDF.")

## Frontend y sitio público

El panel es una SPA en Nuxt 4 dividida en capas por área de negocio, con 194 archivos de pruebas en Vitest. Las guardas de ruta son solo para la experiencia de uso: la autorización la decide la API. El sitio público, en Astro, se publica en Cloudflare Pages.

Pendiente: el entorno de producción, la pasarela de pago y la prueba con los primeros psicólogos. Hoy la plataforma corre en un entorno de pruebas con datos de prueba.
