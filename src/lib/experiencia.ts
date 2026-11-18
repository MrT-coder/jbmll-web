/**
 * Meses de experiencia contados desde las fechas de cada puesto.
 *
 * Los periodos se UNEN antes de sumar: un puesto en paralelo con otro (un
 * trabajo independiente y un empleo a la vez) no duplica el tiempo. Un valor
 * `AAAA` sin mes se toma como enero, porque no hay precisión que inventar; quien
 * necesite otra cosa declara el mes. El `fin` ausente significa «hasta hoy».
 */
export interface Periodo {
  inicio: string;
  fin?: string;
}

/** Índice absoluto de mes: AAAA-MM -> año * 12 + (mes - 1). */
function indiceDeMes(valor: string): number {
  const [anio, mes] = valor.split('-');
  return Number(anio) * 12 + (mes ? Number(mes) - 1 : 0);
}

export function mesesDeExperiencia(periodos: Periodo[], hoy: Date = new Date()): number {
  const ahora = hoy.getUTCFullYear() * 12 + hoy.getUTCMonth();
  const tramos = periodos
    .map((p) => [indiceDeMes(p.inicio), p.fin ? indiceDeMes(p.fin) : ahora] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  let total = 0;
  let [desde, hasta] = tramos[0] ?? [0, 0];
  for (const [a, b] of tramos.slice(1)) {
    if (a <= hasta) hasta = Math.max(hasta, b);
    else {
      total += hasta - desde;
      [desde, hasta] = [a, b];
    }
  }
  return total + (hasta - desde);
}
