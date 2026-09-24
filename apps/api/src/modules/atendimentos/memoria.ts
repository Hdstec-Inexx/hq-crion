import { catalogoDeAtendimentos } from './catalogo.js';
import {
  aplicarConsultaDaListagem,
  aplicarConsultaDaManutencao,
  aplicarConsultaDoDashboard,
  consultaDoPercurso
} from './consulta.js';
import type { PortaDeAtendimentos } from './porta.js';
import {
  aprovacaoDaNota,
  avaliacaoDaIaTemVeredito,
  camposDeMidia,
  criteriosComChave,
  recusaDaAvaliacao,
  recusaDaConferencia,
  type RegistroDeAtendimento
} from './registro.js';

function incorporar(registros: RegistroDeAtendimento[], novo: RegistroDeAtendimento) {
  const atual = registros.find((registro) => registro.id === novo.id);

  if (!atual) {
    registros.push(novo);
    return;
  }

  if (novo.transcricao.length > 0) {
    atual.transcricao = novo.transcricao;
  }

  if (atual.status !== 'Concluído') {
    atual.status = novo.status;
  }

  if (novo.duracaoEmSegundos !== undefined) {
    atual.duracaoEmSegundos = novo.duracaoEmSegundos;
  }

  if (novo.tempoDeEsperaEmSegundos !== undefined) {
    atual.tempoDeEsperaEmSegundos = novo.tempoDeEsperaEmSegundos;
  }

  if (novo.transferencia !== undefined) {
    atual.transferencia = novo.transferencia;
  }

  if (novo.custo) {
    atual.custo = novo.custo;
  }

  if (novo.audio) {
    Object.assign(atual, camposDeMidia(novo.audio));
  }
}

export function repositorioEmMemoria(
  ingeridos: readonly RegistroDeAtendimento[] = []
): PortaDeAtendimentos {
  const registros = catalogoDeAtendimentos();

  for (const ingerido of ingeridos) {
    incorporar(registros, ingerido);
  }

  return {
    async listar() {
      return registros;
    },
    async buscarPorId(id) {
      return registros.find((registro) => registro.id === id);
    },
    async idsConcluidos(ids) {
      const pedidos = new Set(ids);
      return new Set(
        registros
          .filter((registro) => pedidos.has(registro.id) && registro.status === 'Concluído')
          .map((registro) => registro.id)
      );
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
        criterios: criteriosComChave(entrada.criterios)
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
        criterios: criteriosComChave(entrada.criterios),
        notaDaAvaliacaoDaIa: item.avaliacaoDaIa.nota,
        curador: entrada.curador.nome,
        ...(entrada.comentario ? { comentario: entrada.comentario } : {})
      };

      if (entrada.comentario) {
        item.comentarioStatus = 'Pendente';
        item.comentarioId = item.id;
      }

      return 'ok';
    },
    async resolverComentario(id, adminId) {
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
      item.comentarioResolvidoPorId = adminId;
      item.comentarioResolvidoEm = new Date().toISOString();
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
    },
    async consultarPercursoDaManutencao(atendimentoId, recorte, query) {
      const atual = registros.find((registro) => registro.id === atendimentoId);

      if (!atual) {
        return 'ausente' as const;
      }

      return consultaDoPercurso(registros, atual, recorte, query);
    }
  };
}
