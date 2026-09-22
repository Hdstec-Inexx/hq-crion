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
