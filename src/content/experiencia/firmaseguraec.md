---
puesto: Desarrollador Backend
organizacion: FirmaSeguraEc
ubicacion: Quito, Ecuador
modalidad: remoto
inicio: 2025-09
st:
  - Java
  - Spring Boot
  - Spring AI
  - PostgreSQL
  - Feign
  - Vue.js
  - Cloudflare
kw:
  - microservicios
  - mensajería asíncrona
  - integración de LLM
  - SDD
  - TDD
---

Diseñé y desarrollé un flujo alternativo completo de emisión de firmas
electrónicas dentro de una arquitectura de microservicios, orientado a un tipo
específico de empresas. El flujo ha emitido más de 1.000 firmas electrónicas.

Implementé la comunicación entre microservicios con clientes Feign y HTTP
Interface (`HttpExchange`), y mensajería Pub/Sub para los flujos asíncronos.

Construí un módulo potenciado con IA usando Spring AI que analiza los cambios en
la documentación de las APIs de la empresa y genera automáticamente plantillas de
actualización que se envían por correo a los aliados, reduciendo el esfuerzo
manual de comunicación.

Desarrollé un módulo interno de correo transaccional que envía mensajes con
plantillas de marca desde la propia infraestructura de la empresa.

Implementé la personalización de marca blanca para aliados, sirviendo recursos
propios de cada uno a través de un CDN de imágenes con Cloudflare R2.

Lidero un flujo de desarrollo agéntico, guiado por especificaciones y por
pruebas, con enfoque human-in-the-loop: la calidad se decide antes de escribir
código, no en la revisión del pull request.
