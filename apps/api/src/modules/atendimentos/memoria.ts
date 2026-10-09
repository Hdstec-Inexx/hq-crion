import { randomUUID } from 'node:crypto';
import { buscarPorId as buscarPerfilPorId } from '../perfil/repositorio.js';
import { catalogoDeAtendimentos } from './catalogo.js';
import {
  aplicarConsultaDaListagem,
  aplicarConsultaDaManutencao,
  aplicarConsultaDoDashboard,
  consultaDoPercurso
} from './consulta.js';
import type { PortaDeAtendimentos } from './porta.js';
import {
  aprovacaoDaAvaliacao,
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
  const favoritos: Array<{
    id: string;
    perfilId: string;
    atendimentoId: string;
    favoritadoEm: string;
  }> = [];

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
    async favoritar(atendimentoId, perfilId) {
      const item = registros.find((registro) => registro.id === atendimentoId);

      if (!item) {
        return 'ausente';
      }

      const jaExiste = favoritos.some(
        (fav) => fav.atendimentoId === atendimentoId && fav.perfilId === perfilId
      );

      if (!jaExiste) {
        favoritos.push({
          id: randomUUID(),
          perfilId,
          atendimentoId,
          favoritadoEm: new Date().toISOString()
        });
      }

      return 'ok';
    },
    async desfavoritar(atendimentoId, perfilId) {
      const item = registros.find((registro) => registro.id === atendimentoId);

      if (!item) {
        return 'ausente';
      }

      const indice = favoritos.findIndex(
        (fav) => fav.atendimentoId === atendimentoId && fav.perfilId === perfilId
      );

      if (indice !== -1) {
        favoritos.splice(indice, 1);
      }

      return 'ok';
    },
    async obterFavoritos(atendimentoId, perfilId) {
      const item = registros.find((registro) => registro.id === atendimentoId);

      if (!item) {
        return undefined;
      }

      const doAtendimento = favoritos
        .filter((fav) => fav.atendimentoId === atendimentoId)
        .sort((a, b) => b.favoritadoEm.localeCompare(a.favoritadoEm));

      const perfis = doAtendimento.map((fav) => ({
        id: fav.perfilId,
        nome: buscarPerfilPorId(fav.perfilId)?.nome ?? fav.perfilId
      }));

      const favoritadoPeloUsuario = perfilId
        ? doAtendimento.some((fav) => fav.perfilId === perfilId)
        : false;

      return {
        favoritadoPeloUsuario,
        favoritos: {
          count: perfis.length,
          perfis
        }
      };
    },
    async gravarTranscricao(id, transcricao) {
      const item = registros.find((registro) => registro.id === id);

      if (!item) {
        return;
      }

      item.transcricao = transcricao.map((turno) => ({
        locutor: turno.locutor,
        quando: turno.quando,
        texto: turno.texto,
        ...(turno.detalhes?.length
          ? { detalhes: turno.detalhes.map((detalhe) => ({ ...detalhe })) }
          : {})
      }));
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
      const criterios = criteriosComChave(entrada.criterios);
      item.avaliacaoDaIa = {
        nota: entrada.nota,
        aprovacao: aprovacaoDaAvaliacao(entrada.nota, criterios),
        criterios,
        resumo: entrada.resumo ?? undefined,
        falhasIdentificadas: entrada.falhasIdentificadas ?? []
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
      const criterios = criteriosComChave(entrada.criterios);
      item.avaliacaoDoCurador = {
        nota: entrada.nota,
        aprovacao: aprovacaoDaAvaliacao(entrada.nota, criterios),
        criterios,
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
