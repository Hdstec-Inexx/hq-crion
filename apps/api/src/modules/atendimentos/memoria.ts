import { catalogoDeAtendimentos } from './catalogo.js';
import {
  aplicarConsultaDaListagem,
  aplicarConsultaDaManutencao,
  aplicarConsultaDoDashboard
} from './consulta.js';
import type { PortaDeAtendimentos } from './porta.js';
import { aprovacaoDaNota, avaliacaoDaIaTemVeredito, recusaDaAvaliacao, recusaDaConferencia } from './registro.js';

export function repositorioEmMemoria(): PortaDeAtendimentos {
  const registros = catalogoDeAtendimentos();

  return {
    async listar() {
      return registros;
    },
    async buscarPorId(id) {
      return registros.find((registro) => registro.id === id);
    },
    async gravarAvaliacaoDaIa(id, entrada) {
      const item = registros.find((registro) => registro.id === id);
      const recusa = recusaDaAvaliacao(item);

      if (recusa || !item) {
        return recusa ?? 'ausente';
      }

      item.nota = entrada.nota;
      item.avaliacaoDaIa = {
        nota: entrada.nota,
        aprovacao: aprovacaoDaNota(entrada.nota),
        criterios: entrada.criterios
      };

      return 'ok';
    },
    async conferir(id, entrada) {
      const item = registros.find((registro) => registro.id === id);
      const recusa = recusaDaConferencia(item);

      if (recusa || !item || !avaliacaoDaIaTemVeredito(item)) {
        return recusa ?? 'indisponivel';
      }

      item.curadoria = true;
      item.curadorDaRevisao = entrada.curador;
      item.avaliacaoDoCurador = {
        nota: entrada.nota,
        aprovacao: aprovacaoDaNota(entrada.nota),
        criterios: entrada.criterios,
        notaDaAvaliacaoDaIa: item.avaliacaoDaIa.nota,
        curador: entrada.curador.nome,
        ...(entrada.comentario ? { comentario: entrada.comentario } : {})
      };

      if (entrada.comentario) {
        item.comentarioStatus = 'Pendente';
      }

      return 'ok';
    },
    async resolverComentario(id) {
      const item = registros.find(
        (registro) => registro.comentarioId === id || registro.id === id
      );

      if (!item?.avaliacaoDoCurador?.comentario) {
        return 'ausente';
      }

      if ((item.comentarioStatus ?? 'Pendente') !== 'Pendente') {
        return 'ja-resolvido';
      }

      item.comentarioStatus = 'Resolvido';
      return item;
    },
    async consultarListagem(recorte, query, modo, perfilId) {
      return aplicarConsultaDaListagem(registros, recorte, query, modo, perfilId);
    },
    async consultarDashboard(recorte, query) {
      return aplicarConsultaDoDashboard(registros, recorte, query);
    },
    async consultarManutencao(recorte, query) {
      return aplicarConsultaDaManutencao(registros, recorte, query);
    }
  };
}
