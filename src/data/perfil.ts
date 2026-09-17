// Los cálculos sobre el perfil, no el perfil en sí: el dato vive en
// src/content/perfil.yaml, editable por un CMS basado en Git (Sveltia, en una
// PR futura) que entiende YAML pero no TypeScript. Lo que sí es código —
// derivar el teléfono legible, armar los enlaces de contacto— se queda aquí.

export interface Enlace {
  etiqueta: string;
  href: string;
  /** Lo que se muestra, cuando difiere del destino. */
  texto?: string;
}

/** Los campos del perfil que estas funciones necesitan, sin acoplarse al tipo
 * completo que exporta la colección. */
export interface DatosDeContacto {
  correo: string;
  telefono: string;
  github: string;
  linkedin: string;
  orcid: string;
}

/** +593 95 877 4749 — se deriva del número, no se escribe a mano. */
export function telefonoLegible(e164: string): string {
  const d = e164.replace(/\D/g, '');
  // Ecuador: 3 dígitos de país y 9 de abonado.
  const [pais, abonado] = [d.slice(0, 3), d.slice(3)];
  return `+${pais} ${abonado.slice(0, 2)} ${abonado.slice(2, 5)} ${abonado.slice(5)}`;
}

export function enlacesDeContacto(perfil: DatosDeContacto): Enlace[] {
  const wa = perfil.telefono.replace(/\D/g, '');
  return [
    { etiqueta: 'correo', href: `mailto:${perfil.correo}`, texto: perfil.correo },
    { etiqueta: 'whatsapp', href: `https://wa.me/${wa}`, texto: telefonoLegible(perfil.telefono) },
    {
      etiqueta: 'github',
      href: `https://github.com/${perfil.github}`,
      texto: `github.com/${perfil.github}`,
    },
    {
      etiqueta: 'linkedin',
      href: `https://www.linkedin.com/in/${perfil.linkedin}`,
      // Igual que github: el texto visible es el destino, no una repetición
      // de la etiqueta de la fila.
      texto: `linkedin.com/in/${perfil.linkedin}`,
    },
    {
      etiqueta: 'orcid',
      href: `https://orcid.org/${perfil.orcid}`,
      texto: perfil.orcid,
    },
  ];
}
