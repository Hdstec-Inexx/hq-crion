import type {
  DashboardResponse,
  KpiDoDashboard,
  PaineisDoDashboard
} from '@hq-crion/contracts/dashboard';
import { reguaUnica } from '../regua/regua-unica.js';
import type { RegistroDeAtendimento } from '../atendimentos/registro.js';

const slaMaximoEmSegundos = 150;
const slaMeta = 80;
const limiteDePiores = 5;

function media(valores: number[]) {
  if (valores.length === 0) {
    return null;
  }

  return valores.reduce((soma, valor) => soma + valor, 0) / valores.length;
}

function taxa(parte: number, todo: number) {
  if (todo === 0) {
    return null;
  }

  return (parte / todo) * 100;
}

function concluidos(itens: RegistroDeAtendimento[]) {
  return itens.filter((item) => item.status === 'Concluído');
}

function todosComFato<T>(
  itens: RegistroDeAtendimento[],
  fato: (item: RegistroDeAtendimento) => T | undefined
): T[] | null {
  const valores: T[] = [];

  for (const item of itens) {
    const valor = fato(item);

    if (valor === undefined) {
      return null;
    }

    valores.push(valor);
  }

  return valores;
}

function kpisDoPeriodo(itens: RegistroDeAtendimento[]): KpiDoDashboard[] {
  const fechados = concluidos(itens);
  const duracoes = todosComFato(fechados, (item) => item.duracaoEmSegundos);
  const transferencias = todosComFato(fechados, (item) => item.transferencia);
  const resolvidos =
    transferencias === null
      ? null
      : fechados.filter((item) => item.transferencia === false);
  const duracoesResolvidas =
    resolvidos === null
      ? null
      : todosComFato(resolvidos, (item) => item.duracaoEmSegundos);
  const dentroDoSla = fechados.filter(
    (item) =>
      item.tempoDeEsperaEmSegundos !== undefined &&
      item.tempoDeEsperaEmSegundos <= slaMaximoEmSegundos
  ).length;
  const notasIa = itens
    .map((item) => item.avaliacaoDaIa?.nota)
    .filter((valor): valor is number => valor !== undefined);
  const notasCurador = itens
    .map((item) => item.avaliacaoDoCurador?.nota)
    .filter((valor): valor is number => valor !== undefined);
  const ferramentas = itens.reduce(
    (acc, item) => {
      if (!item.ferramentas) {
        return acc;
      }

      return {
        executadas: acc.executadas + item.ferramentas.executadas,
        sucesso: acc.sucesso + item.ferramentas.sucesso
      };
    },
    { executadas: 0, sucesso: 0 }
  );
  const aprovados = itens.filter(
    (item) => item.nota >= reguaUnica.limiarDeAprovacao
  ).length;

  return [
    { id: 'atendimentos', rotulo: 'Atendimentos', valor: itens.length },
    { id: 'tma', rotulo: 'TMA', valor: duracoes === null ? null : media(duracoes) },
    {
      id: 'taxaDeResolvidas',
      rotulo: 'Taxa de Resolvidas',
      valor: resolvidos === null ? null : taxa(resolvidos.length, fechados.length)
    },
    {
      id: 'sla',
      rotulo: 'SLA',
      valor: taxa(dentroDoSla, fechados.length),
      meta: slaMeta
    },
    { id: 'notaMediaIa', rotulo: 'Nota média IA', valor: media(notasIa) },
    {
      id: 'notaMediaCurador',
      rotulo: 'Nota média Curador',
      valor: media(notasCurador)
    },
    { id: 'avaliadosIa', rotulo: 'Avaliados IA', valor: notasIa.length },
    {
      id: 'avaliadosCurador',
      rotulo: 'Avaliados Curador',
      valor: notasCurador.length
    },
    {
      id: 'promessasCumpridas',
      rotulo: 'Taxa de Promessas Cumpridas',
      valor: taxa(ferramentas.sucesso, ferramentas.executadas)
    },
    {
      id: 'tempoMedioAteResolucao',
      rotulo: 'Tempo Médio até Resolução',
      valor: duracoesResolvidas === null ? null : media(duracoesResolvidas)
    },
    {
      id: 'aprovacao',
      rotulo: 'Aprovação',
      valor: taxa(aprovados, itens.length)
    }
  ];
}

function percentualDeAcerto(itens: RegistroDeAtendimento[], criterio: string) {
  let aplicaveis = 0;
  let atendidos = 0;

  for (const item of itens) {
    const estado = item.avaliacaoDaIa.criterios.find((c) => c.nome === criterio)?.estado;

    if (!estado || estado === 'Não se aplica') {
      continue;
    }

    aplicaveis += 1;

    if (estado === 'Atendido') {
      atendidos += 1;
    }
  }

  return taxa(atendidos, aplicaveis);
}

function concordanciaPorCriterio(itens: RegistroDeAtendimento[], criterio: string) {
  let comparaveis = 0;
  let iguais = 0;

  for (const item of itens) {
    if (!item.avaliacaoDoCurador) {
      continue;
    }

    const ia = item.avaliacaoDaIa.criterios.find((c) => c.nome === criterio)?.estado;
    const curador = item.avaliacaoDoCurador.criterios.find((c) => c.nome === criterio)
      ?.estado;

    if (!ia || !curador || ia === 'Não se aplica' || curador === 'Não se aplica') {
      continue;
    }

    comparaveis += 1;

    if (ia === curador) {
      iguais += 1;
    }
  }

  return taxa(iguais, comparaveis);
}

function paineisDoPeriodo(itens: RegistroDeAtendimento[]): PaineisDoDashboard {
  const conferidos = itens.filter((item) => item.avaliacaoDoCurador);
  const nomes = reguaUnica.criterios.map((criterio) => criterio.nome);
  const motivos = new Map<string, number>();

  for (const item of itens) {
    motivos.set(item.motivo, (motivos.get(item.motivo) ?? 0) + 1);
  }

  let paresDeCriterio = 0;
  let criteriosIguais = 0;

  for (const item of conferidos) {
    for (const criterio of nomes) {
      const ia = item.avaliacaoDaIa.criterios.find((c) => c.nome === criterio)?.estado;
      const curador = item.avaliacaoDoCurador?.criterios.find((c) => c.nome === criterio)
        ?.estado;

      if (!ia || !curador || ia === 'Não se aplica' || curador === 'Não se aplica') {
        continue;
      }

      paresDeCriterio += 1;

      if (ia === curador) {
        criteriosIguais += 1;
      }
    }
  }

  return {
    motivos: [...motivos.entries()].map(([motivo, quantidade]) => ({
      motivo,
      quantidade
    })),
    acertoPorCriterio: nomes.map((criterio) => ({
      criterio,
      percentual: percentualDeAcerto(itens, criterio)
    })),
    concordancia: {
      nota: taxa(
        conferidos.filter(
          (item) => item.avaliacaoDaIa.nota === item.avaliacaoDoCurador?.nota
        ).length,
        conferidos.length
      ),
      criterios: taxa(criteriosIguais, paresDeCriterio),
      porCriterio: nomes.map((criterio) => ({
        criterio,
        percentual: concordanciaPorCriterio(conferidos, criterio)
      }))
    },
    naoConformidade: nomes.map((criterio) => ({
      criterio,
      quantidade: itens.filter((item) =>
        item.avaliacaoDaIa.criterios.some(
          (atual) => atual.nome === criterio && atual.estado === 'Não atendido'
        )
      ).length
    })),
    pioresAtendimentos: concluidos(itens)
      .slice()
      .sort((a, b) => a.avaliacaoDaIa.nota - b.avaliacaoDaIa.nota)
      .slice(0, limiteDePiores)
      .map((item) => ({ id: item.id, nota: item.avaliacaoDaIa.nota }))
  };
}

export function pulsoDoDashboard(
  itens: RegistroDeAtendimento[],
  recorte: DashboardResponse['recorte'],
  periodo: DashboardResponse['periodo']
): DashboardResponse {
  return {
    recorte,
    periodo,
    kpis: kpisDoPeriodo(itens),
    paineis: paineisDoPeriodo(itens)
  };
}
