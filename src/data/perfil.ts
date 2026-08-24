// Los datos que no son una colección: el perfil es único y no se lista.
// Vive aquí y no en src/content/ porque una colección de un solo elemento
// obliga a preguntar «cuál» cada vez que se lee.

export interface Enlace {
  etiqueta: string;
  href: string;
  /** Lo que se muestra, cuando difiere del destino. */
  texto?: string;
}

export const perfil = {
  nombre: 'Josue Bladimir Morales Llanganate',
  marca: 'JBMLL',
  titular: 'Desarrollador Backend Java',
  ubicacion: 'Salcedo, Cotopaxi, Ecuador',
  disponibilidad: 'Disponible para remoto',

  correo: 'juniorbmorales@gmail.com',

  // En formato E.164 y sin separadores: es lo que espera wa.me y lo que evita
  // que el enlace y el número visible se separen. El formato legible se calcula
  // desde este mismo valor, no se escribe aparte.
  telefono: '+593958774749',

  github: 'MrT-coder',
  linkedin: 'josue-bladimir-morales-llanganate-20086636b',
  orcid: '0009-0004-2687-2314',
} as const;

/** +593 95 877 4749 — se deriva del número, no se escribe a mano. */
export function telefonoLegible(e164: string = perfil.telefono): string {
  const d = e164.replace(/\D/g, '');
  // Ecuador: 3 dígitos de país y 9 de abonado.
  const [pais, abonado] = [d.slice(0, 3), d.slice(3)];
  return `+${pais} ${abonado.slice(0, 2)} ${abonado.slice(2, 5)} ${abonado.slice(5)}`;
}

export function enlacesDeContacto(): Enlace[] {
  const wa = perfil.telefono.replace(/\D/g, '');
  return [
    { etiqueta: 'correo', href: `mailto:${perfil.correo}`, texto: perfil.correo },
    { etiqueta: 'whatsapp', href: `https://wa.me/${wa}`, texto: telefonoLegible() },
    {
      etiqueta: 'github',
      href: `https://github.com/${perfil.github}`,
      texto: `github.com/${perfil.github}`,
    },
    {
      etiqueta: 'linkedin',
      href: `https://www.linkedin.com/in/${perfil.linkedin}`,
      texto: 'linkedin',
    },
    {
      etiqueta: 'orcid',
      href: `https://orcid.org/${perfil.orcid}`,
      texto: perfil.orcid,
    },
  ];
}
