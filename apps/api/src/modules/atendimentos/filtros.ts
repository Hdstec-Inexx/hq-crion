import { lerRecorte, periodoMesCivil, type Recorte } from '@hq-crion/contracts/recorte';
import type { RegistroDeAtendimento } from './registro.js';

export type ModoDaListagem = 'todos' | 'fila' | 'minhas' | 'realizadas' | 'monitoramento';

const formatadorDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const diaCivil = /^\d{4}-\d{2}-\d{2}$/;

export function diaNoFuso(iso: string) {
  const parts = formatadorDia.formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

export function recorteDaQuery(
  query: Record<string, string | undefined>
): Recorte | undefined {
  try {
    return lerRecorte({
      administradora: query.administradora,
      agente: query.agente
    });
  } catch {
    return undefined;
  }
}

export function periodoDaQuery(query: Record<string, string | undefined>) {
  const inicio = query.inicio;
  const fim = query.fim;

  if (
    inicio &&
    fim &&
    diaCivil.test(inicio) &&
    diaCivil.test(fim) &&
    inicio <= fim
  ) {
    return { inicio, fim };
  }

  return periodoMesCivil(new Date());
}

export function passaNoRecorte(
  item: { administradora: string; agenteId: string },
  recorte: ReturnType<typeof lerRecorte>
) {
  if (recorte.administradora && item.administradora !== recorte.administradora) {
    return false;
  }

  if (recorte.agente && item.agenteId !== recorte.agente) {
    return false;
  }

  return true;
}

export function passaNoRecorteEPeriodo(
  item: RegistroDeAtendimento,
  recorte: ReturnType<typeof lerRecorte>,
  query: Record<string, string | undefined>,
  quando: string
) {
  const periodo = periodoDaQuery(query);
  const dia = diaNoFuso(quando);

  if (dia < periodo.inicio || dia > periodo.fim) {
    return false;
  }

  return passaNoRecorte(item, recorte);
}

export function passaNosFiltros(
  item: RegistroDeAtendimento,
  recorte: ReturnType<typeof lerRecorte>,
  query: Record<string, string | undefined>,
  modo: ModoDaListagem,
  perfilId: string
) {
  if (modo === 'monitoramento') {
    return passaNoRecorte(item, recorte) && item.status === 'Em andamento';
  }

  const quando = modo === 'fila' ? (item.concluidoEm ?? item.iniciadoEm) : item.iniciadoEm;

  if (!passaNoRecorteEPeriodo(item, recorte, query, quando)) {
    return false;
  }

  if (query.status && item.status !== query.status) {
    return false;
  }

  if (query.nota && item.nota !== Number(query.nota)) {
    return false;
  }

  if (query.motivo && item.motivo !== query.motivo) {
    return false;
  }

  if (query.conversa && item.conversa !== query.conversa) {
    return false;
  }

  if (query.curadoria === 'true' && !item.curadoria) {
    return false;
  }

  if (query.curadoria === 'false' && item.curadoria) {
    return false;
  }

  if (modo === 'fila') {
    return (
      item.status === 'Concluído' &&
      Boolean(item.avaliacaoDaIa) &&
      !item.curadoria
    );
  }

  if (modo === 'minhas') {
    return item.curadoria && item.curadorId === perfilId;
  }

  if (modo === 'realizadas') {
    return item.curadoria;
  }

  return true;
}

export function passaNoDashboard(
  item: RegistroDeAtendimento,
  recorte: ReturnType<typeof lerRecorte>,
  query: Record<string, string | undefined>
) {
  return passaNoRecorteEPeriodo(item, recorte, query, item.iniciadoEm);
}
