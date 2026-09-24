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
  const conversa = query.conversa?.trim();
  const periodo = periodoDaQuery(query);
  const ordenados = [...comentarios]
    .filter((item) => {
      if (item.status !== 'Pendente' || item.atendimentoId === atendimentoAtual.id) {
        return false;
      }

      if (!passaNoRecorte(item, recorte)) {
        return false;
      }

      if (conversa && item.conversa !== conversa) {
        return false;
      }

      const dia = diaNoFuso(item.iniciadoEm);
      return dia >= periodo.inicio && dia <= periodo.fim;
    })
    .sort((a, b) => {
      const porData = a.iniciadoEm.localeCompare(b.iniciadoEm);

      return porData !== 0
        ? porData
        : a.atendimentoId.localeCompare(b.atendimentoId, 'en');
    });
  const posteriores = ordenados.filter((item) => {
    const porData = item.iniciadoEm.localeCompare(atendimentoAtual.iniciadoEm);

    if (porData !== 0) {
      return porData > 0;
    }

    return item.atendimentoId.localeCompare(atendimentoAtual.id, 'en') > 0;
  });
  const proximo = posteriores[0] ?? ordenados[0];

  return {
    pendentesNoAtendimento: pendentesDeste.length,
    comentarioPendenteId: pendentesDeste[0]?.comentarioId ?? null,
    proximoAtendimentoId: pendentesDeste.length > 0 ? null : (proximo?.atendimentoId ?? null)
  };
}

export function aplicarConsultaDaManutencao(
  registros: readonly RegistroDeAtendimento[],
  recorte: Recorte,
  query: Record<string, string | undefined>
) {
  const periodo = periodoDaQuery(query);

  return registros.filter((item) => {
    if (!item.avaliacaoDoCurador?.comentario) {
      return false;
    }

    if (!passaNoRecorte(item, recorte)) {
      return false;
    }

    if (query.status && (item.comentarioStatus ?? 'Pendente') !== query.status) {
      return false;
    }

    const dia = diaNoFuso(item.iniciadoEm);
    return dia >= periodo.inicio && dia <= periodo.fim;
  });
}
