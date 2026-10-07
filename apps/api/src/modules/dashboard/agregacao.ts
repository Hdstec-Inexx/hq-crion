import type {
  DashboardResponse,
  KpiDoDashboard,
  PaineisDoDashboard
} from '@hq-crion/contracts/dashboard';
import { reguaUnica } from '../regua/regua-unica.js';
import {
  avaliacaoDaIaTemVeredito,
  iaEstaAprovada,
  semTransferencia,
  type RegistroDeAtendimento
} from '../atendimentos/registro.js';
import { slaMaximoEmSegundos, slaMeta } from './sla.js';
import { tempoDeEsperaDaTranscricao } from '../atendimentos/tempo-de-espera.js';

const limiteDePiores = 5;

function media(valores: number[]) {
  const validos = valores.filter((v) => typeof v === 'number' && Number.isFinite(v));

  if (validos.length === 0) {
    return null;
  }

  const soma = validos.reduce((acc, valor) => acc + valor, 0);
  const resultado = soma / validos.length;
  return Number.isFinite(resultado) ? resultado : null;
}

function taxa(parte: number, todo: number) {
  if (
    typeof parte !== 'number' ||
    typeof todo !== 'number' ||
    !Number.isFinite(parte) ||
    !Number.isFinite(todo) ||
    todo <= 0 ||
    parte < 0
  ) {
    return null;
  }

  const resultado = (parte / todo) * 100;
  return Number.isFinite(resultado) ? resultado : null;
}

export function extrairContagemDeFerramentas(ferramentas: unknown): { executadas: number; sucesso: number } {
  if (!ferramentas) {
    return { executadas: 0, sucesso: 0 };
  }

  if (Array.isArray(ferramentas)) {
    const executadas = ferramentas.length;
    const sucesso = ferramentas.filter(
      (f) =>
        f &&
        typeof f === 'object' &&
        (f.success === true || f.sucesso === true || f.status === 'success')
    ).length;
    return { executadas, sucesso };
  }

  if (typeof ferramentas === 'object') {
    const obj = ferramentas as Record<string, unknown>;
    const executadas =
      typeof obj.executadas === 'number' && Number.isFinite(obj.executadas) && obj.executadas >= 0
        ? obj.executadas
        : Array.isArray(obj.chamadas)
          ? obj.chamadas.length
          : 0;
    const sucesso =
      typeof obj.sucesso === 'number' && Number.isFinite(obj.sucesso) && obj.sucesso >= 0
        ? obj.sucesso
        : 0;
    return { executadas, sucesso };
  }

  return { executadas: 0, sucesso: 0 };
}

function concluidos(itens: RegistroDeAtendimento[]) {
  return itens.filter((item) => item.status === 'Concluído');
}

function kpisDoPeriodo(itens: RegistroDeAtendimento[]): KpiDoDashboard[] {
  const fechados = concluidos(itens);
  const duracoes = fechados
    .map((item) => item.duracaoEmSegundos)
    .filter((valor): valor is number => typeof valor === 'number' && Number.isFinite(valor));
  const resolvidos = fechados.filter(semTransferencia);
  const duracoesResolvidas = resolvidos
    .map((item) => item.duracaoEmSegundos)
    .filter((valor): valor is number => typeof valor === 'number' && Number.isFinite(valor));
  const dentroDoSla = fechados.filter((item) => {
    const tempo =
      typeof item.tempoDeEsperaEmSegundos === 'number' && Number.isFinite(item.tempoDeEsperaEmSegundos)
        ? item.tempoDeEsperaEmSegundos
        : Array.isArray(item.transcricao)
          ? tempoDeEsperaDaTranscricao(item.transcricao)
          : undefined;

    return typeof tempo === 'number' && Number.isFinite(tempo) && tempo <= slaMaximoEmSegundos;
  }).length;
  const notasIa = itens
    .filter(avaliacaoDaIaTemVeredito)
    .map((item) => item.avaliacaoDaIa.nota)
    .filter((valor): valor is number => typeof valor === 'number' && Number.isFinite(valor));
  const notasCurador = itens
    .map((item) => item.avaliacaoDoCurador?.nota)
    .filter((valor): valor is number => typeof valor === 'number' && Number.isFinite(valor));
  const ferramentas = itens.reduce(
    (acc, item) => {
      const contagem = extrairContagemDeFerramentas(item.ferramentas);
      return {
        executadas: acc.executadas + contagem.executadas,
        sucesso: acc.sucesso + contagem.sucesso
      };
    },
    { executadas: 0, sucesso: 0 }
  );
  const aprovados = itens.filter(iaEstaAprovada).length;

  return [
    { id: 'atendimentos', rotulo: 'Atendimentos', valor: itens.length },
    { id: 'tma', rotulo: 'TMA', valor: media(duracoes) },
    {
      id: 'taxaDeResolvidas',
      rotulo: 'Taxa de Resolvidas',
      valor: taxa(resolvidos.length, fechados.length),
      resolvidas: resolvidos.length
    },
    {
      id: 'sla',
      rotulo: 'SLA',
      valor: taxa(dentroDoSla, fechados.length),
      meta: slaMeta,
      limiarEmSegundos: slaMaximoEmSegundos
    },
    { id: 'notaMediaIa', rotulo: 'Nota média IA Avaliadora', valor: media(notasIa) },
    {
      id: 'notaMediaCurador',
      rotulo: 'Nota média Curador',
      valor: media(notasCurador)
    },
    { id: 'avaliadosIa', rotulo: 'Avaliados IA Avaliadora', valor: notasIa.length },
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
      valor: media(duracoesResolvidas)
    },
    {
      id: 'aprovacao',
      rotulo: 'Aprovação',
      valor: taxa(aprovados, itens.length)
    }
  ];
}

function paineisDoPeriodo(itens: RegistroDeAtendimento[]): PaineisDoDashboard {
  const nomes = reguaUnica.criterios.map((criterio) => criterio.nome);
  const acerto = new Map(nomes.map((nome) => [nome, { aplicaveis: 0, atendidos: 0 }]));
  const concordancia = new Map(
    nomes.map((nome) => [nome, { comparaveis: 0, iguais: 0 }])
  );
  const naoConformidade = new Map(nomes.map((nome) => [nome, 0]));
  const motivos = new Map<string, number>();
  const conferidos: RegistroDeAtendimento[] = [];
  const piores = concluidos(itens)
    .filter(avaliacaoDaIaTemVeredito)
    .slice()
    .sort((a, b) => a.avaliacaoDaIa.nota - b.avaliacaoDaIa.nota)
    .slice(0, limiteDePiores)
    .map((item) => ({ id: item.id, nota: item.avaliacaoDaIa.nota }));

  for (const item of itens) {
    motivos.set(item.motivo, (motivos.get(item.motivo) ?? 0) + 1);

    if (item.avaliacaoDoCurador) {
      conferidos.push(item);
    }

    const criteriosIa = item.avaliacaoDaIa?.criterios ?? [];

    for (const criterio of criteriosIa) {
      if (criterio.estado === 'Não atendido') {
        naoConformidade.set(
          criterio.nome,
          (naoConformidade.get(criterio.nome) ?? 0) + 1
        );
      }

      if (criterio.estado === 'Não se aplica') {
        continue;
      }

      const fatia = acerto.get(criterio.nome);

      if (!fatia) {
        continue;
      }

      fatia.aplicaveis += 1;

      if (criterio.estado === 'Atendido') {
        fatia.atendidos += 1;
      }
    }

    if (!item.avaliacaoDoCurador) {
      continue;
    }

    for (const criterio of nomes) {
      const ia = item.avaliacaoDaIa?.criterios.find((atual) => atual.nome === criterio)?.estado;
      const curador = item.avaliacaoDoCurador.criterios.find(
        (atual) => atual.nome === criterio
      )?.estado;

      if (!ia || !curador || ia === 'Não se aplica' || curador === 'Não se aplica') {
        continue;
      }

      const fatia = concordancia.get(criterio);

      if (!fatia) {
        continue;
      }

      fatia.comparaveis += 1;

      if (ia === curador) {
        fatia.iguais += 1;
      }
    }
  }

  let paresDeCriterio = 0;
  let criteriosIguais = 0;

  for (const fatia of concordancia.values()) {
    paresDeCriterio += fatia.comparaveis;
    criteriosIguais += fatia.iguais;
  }

  return {
    motivos: [...motivos.entries()].map(([motivo, quantidade]) => ({
      motivo,
      quantidade
    })),
    acertoPorCriterio: nomes.map((criterio) => {
      const fatia = acerto.get(criterio);
      return {
        criterio,
        percentual: fatia ? taxa(fatia.atendidos, fatia.aplicaveis) : null,
        atendidos: fatia?.atendidos ?? 0,
        aplicaveis: fatia?.aplicaveis ?? 0
      };
    }),
    concordancia: {
      nota: taxa(
        conferidos.filter(
          (item) =>
            item.avaliacaoDaIa !== undefined &&
            item.avaliacaoDaIa.nota === item.avaliacaoDoCurador?.nota
        ).length,
        conferidos.length
      ),
      criterios: taxa(criteriosIguais, paresDeCriterio),
      porCriterio: nomes.map((criterio) => {
        const fatia = concordancia.get(criterio);
        return {
          criterio,
          percentual: fatia ? taxa(fatia.iguais, fatia.comparaveis) : null,
          iguais: fatia?.iguais ?? 0,
          comparaveis: fatia?.comparaveis ?? 0
        };
      })
    },
    naoConformidade: nomes.map((criterio) => ({
      criterio,
      quantidade: naoConformidade.get(criterio) ?? 0
    })),
    pioresAtendimentos: piores
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
