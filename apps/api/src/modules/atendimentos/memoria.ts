import { randomUUID } from 'node:crypto';
import { buscarPorId as buscarPerfilPorId } from '../perfil/repositorio.js';
import { catalogoDeAtendimentos } from './catalogo.js';
import {
  aplicarConsultaDaListagem,
  aplicarConsultaDaManutencao,
  aplicarConsultaDoDashboard,
  consultaDoPercurso
} from './consulta.js';
import type { FavoritosDoAtendimento, PortaDeAtendimentos } from './porta.js';
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

function resolverFavoritos(
  favoritos: Array<{ id: string; perfilId: string; atendimentoId: string; favoritadoEm: string }>,
  atendimentoId: string,
  perfilId: string
): FavoritosDoAtendimento {
  const doAtendimento = favoritos
    .filter((fav) => fav.atendimentoId === atendimentoId)
    .sort((a, b) => b.favoritadoEm.localeCompare(a.favoritadoEm));

  const perfis = doAtendimento.map((fav) => ({
    id: fav.perfilId,
    nome: buscarPerfilPorId(fav.perfilId)?.nome ?? fav.perfilId
  }));

  return {
    favoritadoPeloUsuario: perfilId
      ? doAtendimento.some((fav) => fav.perfilId === perfilId)
      : false,
    favoritos: {
      count: perfis.length,
      perfis
    }
  };
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

      return resolverFavoritos(favoritos, atendimentoId, perfilId);
    },
    async obterFavoritosPorAtendimentos(atendimentoIds, perfilId) {
      const mapa = new Map<string, FavoritosDoAtendimento>();

      for (const id of atendimentoIds) {
        const item = registros.find((r) => r.id === id);
        if (!item) {
          continue;
        }

        mapa.set(id, resolverFavoritos(favoritos, id, perfilId));
      }

      return mapa;
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
    async idsPersistidos(ids) {
      const pedidos = new Set(ids);
      return new Set(
        registros
          .filter((registro) => pedidos.has(registro.id))
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
      const itens = aplicarConsultaDaListagem(registros, recorte, query, modo, perfilId);
      return itens.map((item) => {
        const info = resolverFavoritos(favoritos, item.id, perfilId);
        return {
          ...item,
          favoritadoPeloUsuario: info.favoritadoPeloUsuario,
          favoritosCount: info.favoritos.count,
          favoritosPerfis: info.favoritos.perfis.map((p) => p.nome)
        };
      });
    },
    async consultarFavoritos(recorte, query, perfil) {
      const { passaNoRecorte } = await import('./filtros.js');
      const conversa = typeof query.conversa === 'string' ? query.conversa.trim() : '';
      const perfilFiltro = typeof query.curador === 'string' ? query.curador.trim() : '';

      const mapearItem = (item: RegistroDeAtendimento) => {
        const info = resolverFavoritos(favoritos, item.id, perfil.id);
        return {
          ...item,
          favoritadoPeloUsuario: perfil.papel === 'Curador' ? true : info.favoritadoPeloUsuario,
          favoritosCount: info.favoritos.count,
          favoritosPerfis: info.favoritos.perfis.map((p) => p.nome)
        };
      };

      if (perfil.papel === 'Curador') {
        // Apenas favoritados por ele, ordenados por favoritadoEm DESC
        const meusFavoritos = favoritos
          .filter((fav) => fav.perfilId === perfil.id)
          .sort((a, b) => b.favoritadoEm.localeCompare(a.favoritadoEm));

        const itens: RegistroDeAtendimento[] = [];
        for (const fav of meusFavoritos) {
          const item = registros.find((r) => r.id === fav.atendimentoId);
          if (!item) continue;
          if (!passaNoRecorte(item, recorte)) continue;
          if (conversa && item.conversa !== conversa && item.id !== conversa) continue;

          itens.push(mapearItem(item));
        }

        return { itens, curadores: [] };
      }

      // Curadores disponíveis para filtro (Admin e Gestão)
      const curadoresMap = new Map<string, string>();
      for (const fav of favoritos) {
        const p = buscarPerfilPorId(fav.perfilId);
        if (p) {
          curadoresMap.set(p.id, p.nome);
        } else {
          curadoresMap.set(fav.perfilId, fav.perfilId);
        }
      }
      const curadores = Array.from(curadoresMap.entries())
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      // Admin e Gestão: deduplicados que possuem ao menos 1 marcação ativa, ordenados por MAX(favoritado_em) DESC
      const agrupadosPorAtendimento = new Map<string, { maxFavoritadoEm: string; perfilIds: Set<string> }>();
      for (const fav of favoritos) {
        const atual = agrupadosPorAtendimento.get(fav.atendimentoId);
        if (!atual) {
          agrupadosPorAtendimento.set(fav.atendimentoId, {
            maxFavoritadoEm: fav.favoritadoEm,
            perfilIds: new Set([fav.perfilId])
          });
        } else {
          if (fav.favoritadoEm > atual.maxFavoritadoEm) {
            atual.maxFavoritadoEm = fav.favoritadoEm;
          }
          atual.perfilIds.add(fav.perfilId);
        }
      }

      // Ordenar por maxFavoritadoEm DESC
      const ordenados = Array.from(agrupadosPorAtendimento.entries()).sort(
        (a, b) => b[1].maxFavoritadoEm.localeCompare(a[1].maxFavoritadoEm)
      );

      const itens: RegistroDeAtendimento[] = [];
      for (const [atendimentoId, meta] of ordenados) {
        if (perfilFiltro && !meta.perfilIds.has(perfilFiltro)) {
          continue;
        }

        const item = registros.find((r) => r.id === atendimentoId);
        if (!item) continue;
        if (!passaNoRecorte(item, recorte)) continue;
        if (conversa && item.conversa !== conversa && item.id !== conversa) continue;

        itens.push(mapearItem(item));
      }

      return { itens, curadores };
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
