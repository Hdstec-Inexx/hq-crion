import { lerRecorte, periodoMesCivil } from '@hq-crion/contracts/recorte';
import { notaIaDaQuery, statusDaCuradoria } from '@hq-crion/contracts/filtros-listagem';
import { reguaUnica } from '../regua/regua-unica.js';
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
): ReturnType<typeof lerRecorte> | undefined {
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

  if (modo === 'todos' && query.status && item.status !== query.status) {
    return false;
  }

  const notaIa = notaIaDaQuery(query.notaIa);

  if (notaIa !== undefined && item.avaliacaoDaIa.nota !== notaIa) {
    return false;
  }

  if (query.motivo && item.motivo !== query.motivo) {
    return false;
  }

  if (query.conversa && item.conversa !== query.conversa) {
    return false;
  }

  const statusCuradoria = statusDaCuradoria.find((status) => status === query.statusCuradoria);

  if (modo === 'todos' && statusCuradoria === 'feita' && !item.curadoria) {
    return false;
  }

  if (modo === 'todos' && statusCuradoria === 'pendente' && item.curadoria) {
    return false;
  }

  if (modo !== 'fila' && !passaNosCriterios(item, query)) {
    return false;
  }

  if (
    (modo === 'todos' || modo === 'realizadas') &&
    query.curador &&
    item.curadorId !== query.curador
  ) {
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

function nomesDaQuery(valor: string | undefined) {
  return (valor ?? '')
    .split(',')
    .map((nome) => nome.trim())
    .filter(Boolean);
}

function passaNosCriterios(
  item: RegistroDeAtendimento,
  query: Record<string, string | undefined>
) {
  const atendidos = nomesDaQuery(query.criteriosAtendidos);
  const naoAtendidos = nomesDaQuery(query.criteriosNaoAtendidos);

  const temEstado = (nomes: string[], estado: 'Atendido' | 'Não atendido') =>
    nomes.every((nome) =>
      item.avaliacaoDaIa.criterios.some(
        (criterio) => criterio.nome === nome && criterio.estado === estado
      )
    );

  return temEstado(atendidos, 'Atendido') && temEstado(naoAtendidos, 'Não atendido');
}

export function aplicarIndicador(
  itens: RegistroDeAtendimento[],
  indicador: string | undefined
) {
  if (!indicador) {
    return itens;
  }

  const concluidos = itens.filter((item) => item.status === 'Concluído');

  switch (indicador) {
    case 'atendimentos':
    case 'motivos':
      return itens;
    case 'tma':
      return concluidos.filter((item) => item.duracaoEmSegundos !== undefined);
    case 'taxaDeResolvidas':
      return concluidos.filter((item) => item.transferencia === false);
    case 'sla':
      return concluidos;
    case 'notaMediaIa':
    case 'avaliadosIa':
    case 'acertoPorCriterio':
      return itens.filter((item) => Boolean(item.avaliacaoDaIa));
    case 'notaMediaCurador':
    case 'avaliadosCurador':
      return itens.filter((item) => Boolean(item.avaliacaoDoCurador));
    case 'promessasCumpridas':
      return itens.filter((item) => Boolean(item.ferramentas));
    case 'tempoMedioAteResolucao':
      return concluidos.filter(
        (item) => item.transferencia === false && item.duracaoEmSegundos !== undefined
      );
    case 'aprovacao':
      return itens.filter((item) => item.nota >= reguaUnica.limiarDeAprovacao);
    case 'concordancia':
      return itens.filter(
        (item) => Boolean(item.avaliacaoDaIa) && Boolean(item.avaliacaoDoCurador)
      );
    case 'naoConformidade':
      return itens.filter((item) =>
        item.avaliacaoDaIa.criterios.some((criterio) => criterio.estado === 'Não atendido')
      );
    case 'pioresAtendimentos':
      return concluidos
        .slice()
        .sort((a, b) => a.avaliacaoDaIa.nota - b.avaliacaoDaIa.nota)
        .slice(0, 5);
    default:
      return itens;
  }
}

export function passaNoDashboard(
  item: RegistroDeAtendimento,
  recorte: ReturnType<typeof lerRecorte>,
  query: Record<string, string | undefined>
) {
  return passaNoRecorteEPeriodo(item, recorte, query, item.iniciadoEm);
}
