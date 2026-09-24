import type { Recorte } from '@hq-crion/contracts/recorte';
import {
  aplicarIndicador,
  diaNoFuso,
  passaNoDashboard,
  passaNoRecorte,
  passaNosFiltros,
  periodoDaQuery,
  type ModoDaListagem
} from './filtros.js';
import type { RegistroDeAtendimento } from './registro.js';

export function aplicarConsultaDaListagem(
  registros: readonly RegistroDeAtendimento[],
  recorte: Recorte,
  query: Record<string, string | undefined>,
  modo: ModoDaListagem,
  perfilId: string
) {
  const filtrados = registros.filter((item) =>
    passaNosFiltros(item, recorte, query, modo, perfilId)
  );

  return modo === 'todos' ? aplicarIndicador(filtrados, query.indicador) : filtrados;
}

export function aplicarConsultaDoDashboard(
  registros: readonly RegistroDeAtendimento[],
  recorte: Recorte,
  query: Record<string, string | undefined>
) {
  return registros.filter((item) => passaNoDashboard(item, recorte, query));
}

function conversaDaQuery(query: Record<string, string | undefined>) {
  return typeof query.conversa === 'string' ? query.conversa.trim() : '';
}

function passaNoFiltroDaFila(
  item: {
    administradora: string;
    agenteId: string;
    conversa: string;
    iniciadoEm: string;
  },
  recorte: Recorte,
  query: Record<string, string | undefined>
) {
  if (!passaNoRecorte(item, recorte)) {
    return false;
  }

  const conversa = conversaDaQuery(query);

  if (conversa && item.conversa !== conversa) {
    return false;
  }

  const periodo = periodoDaQuery(query);
  const dia = diaNoFuso(item.iniciadoEm);
  return dia >= periodo.inicio && dia <= periodo.fim;
}

function compararInstanteEId(
  esquerda: { iniciadoEm: string; atendimentoId: string },
  direita: { iniciadoEm: string; atendimentoId: string }
) {
  const porData = esquerda.iniciadoEm.localeCompare(direita.iniciadoEm);

  return porData !== 0
    ? porData
    : esquerda.atendimentoId.localeCompare(direita.atendimentoId, 'en');
}

export function consultaDoPercurso(
  registros: readonly RegistroDeAtendimento[],
  atendimentoAtual: { id: string; iniciadoEm: string },
  recorte: Recorte,
  query: Record<string, string | undefined>
) {
  const comentarios = registros.flatMap((item) => {
    if (!item.avaliacaoDoCurador?.comentario) {
      return [];
    }

    return [
      {
        atendimentoId: item.id,
        comentarioId: item.comentarioId ?? item.id,
        texto: item.avaliacaoDoCurador.comentario,
        status: item.comentarioStatus ?? 'Pendente',
        iniciadoEm: item.iniciadoEm,
        administradora: item.administradora,
        agenteId: item.agenteId,
        conversa: item.conversa
      }
    ];
  });
  const pendentesDeste = comentarios
    .filter(
      (item) => item.atendimentoId === atendimentoAtual.id && item.status === 'Pendente'
    )
    .sort((a, b) => a.comentarioId.localeCompare(b.comentarioId, 'en'));
  const ordenados = [...comentarios]
    .filter((item) => {
      if (item.status !== 'Pendente' || item.atendimentoId === atendimentoAtual.id) {
        return false;
      }

      return passaNoFiltroDaFila(item, recorte, query);
    })
    .sort(compararInstanteEId);
  const proximo = ordenados.find(
    (item) =>
      compararInstanteEId(item, {
        iniciadoEm: atendimentoAtual.iniciadoEm,
        atendimentoId: atendimentoAtual.id
      }) > 0
  );

  return {
    pendentesNoAtendimento: pendentesDeste.length,
    comentarioPendenteId: pendentesDeste[0]?.comentarioId ?? null,
    textoPendente: pendentesDeste[0]?.texto ?? null,
    proximoAtendimentoId: pendentesDeste.length > 0 ? null : (proximo?.atendimentoId ?? null)
  };
}

export function aplicarConsultaDaManutencao(
  registros: readonly RegistroDeAtendimento[],
  recorte: Recorte,
  query: Record<string, string | undefined>
) {
  return registros.filter((item) => {
    if (!item.avaliacaoDoCurador?.comentario) {
      return false;
    }

    if (query.status && (item.comentarioStatus ?? 'Pendente') !== query.status) {
      return false;
    }

    return passaNoFiltroDaFila(item, recorte, query);
  });
}
