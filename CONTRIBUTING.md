# Contribuciones

Este repositorio es público para que se pueda leer, no para recibir aportes.

Es mi sitio personal: el contenido es mío y las decisiones de diseño también. No
acepto pull requests externos y los cierro sin revisar. No es descortesía, es
que no hay nada que delegar en un portafolio de una sola persona.

Si encuentras un error —un enlace roto, un dato equivocado, un fallo de
accesibilidad— abre un issue y lo agradezco de verdad. Eso sí lo leo.

El código está bajo licencia MIT y puedes reutilizarlo. El contenido y la
identidad, no: los detalles están en [LICENSE](LICENSE).

## Cómo trabajo

- `main` es producción. Está protegida: solo entra por pull request, sin
  reescritura de historial y con historial lineal.
- `develop` es donde vive el desarrollo. Cloudflare la despliega como vista
  previa, marcada para que los buscadores no la indexen.
- Ninguna rama se da por terminada con `npm run ship` en rojo.
