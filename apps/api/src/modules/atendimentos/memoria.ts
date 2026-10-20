import { randomUUID } from 'node:crypto';
import { buscarPorId as buscarPerfilPorId } from '../perfil/repositorio.js';
import { catalogoDeAtendimentos } from './catalogo.js';
import {
  canonicalizarMotivo,
  chaveCanonicaDoMotivo,
  pontuacaoDeAcentos
} from './catalogo-motivos.js';
import {
  aplicarConsultaDaListagem,
  aplicarConsultaDaManutencao,
  aplicarConsultaDoDashboard,
  consultaDoPercurso
} from './consulta.js';
import { passaNoRecorte } from './filtros.js';
import type { FavoritosDoAtendimento, PortaDeAtendimentos } from './porta.js';
import { resolverDiagnosticoParaAvaliacao } from '../cancelamentos/heuristica.js';
import {
  aprovacaoDaAvaliacao,
  avaliacaoDaIaTemVeredito,
  camposDeMidia,
  criteriosComChave,
  notasDoAtendimento,
  recusaDaAvaliacao,
  recusaDaConferencia,
  type RegistroDeAtendimento
} from './registro.js';

function incorporar(registros: RegistroDeAtendimento[], novo: RegistroDeAtendimento) {
  const motivosExistentes = registros.map((registro) => registro.motivo).filter(Boolean);
  const motivoCanonico = canonicalizarMotivo(novo.motivo, motivosExistentes);
  const atual = registros.find((registro) => registro.id === novo.id);

  if (!atual) {
    registros.push({
      ...novo,
      motivo: motivoCanonico
    });
    return;
  }

  if (novo.motivo !== undefined) {
    atual.motivo = motivoCanonico;
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

  if (novo.notaIa !== undefined) {
    atual.notaIa = novo.notaIa;
  }

  if (novo.notaCurador !== undefined) {
    atual.notaCurador = novo.notaCurador;
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
  const base = catalogoDeAtendimentos();
  const registros: RegistroDeAtendimento[] = [];

  for (const item of base) {
    const motivosExistentes = registros.map((r) => r.motivo).filter(Boolean);
    registros.push({
      ...item,
      motivo: canonicalizarMotivo(item.motivo, motivosExistentes)
    });
  }

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
    async listarMotivos(recorte) {
      const filtrados = recorte
        ? registros.filter((item) => passaNoRecorte(item, recorte))
        : registros;
      const melhoresPorChave = new Map<string, string>();

      for (const item of filtrados) {
        if (!item.motivo || !item.motivo.trim()) {
          continue;
        }
        const motivo = item.motivo.trim();
        const chave = chaveCanonicaDoMotivo(motivo);
        const atual = melhoresPorChave.get(chave);

        if (!atual) {
          melhoresPorChave.set(chave, motivo);
        } else {
          const scoreAtual = pontuacaoDeAcentos(atual);
          const scoreNovo = pontuacaoDeAcentos(motivo);
          if (
            scoreNovo > scoreAtual ||
            (scoreNovo === scoreAtual && motivo.length > atual.length) ||
            (scoreNovo === scoreAtual &&
              motivo.length === atual.length &&
              motivo.localeCompare(atual) > 0)
          ) {
            melhoresPorChave.set(chave, motivo);
          }
        }
      }

      return Array.from(melhoresPorChave.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    async buscarPorId(id) {
      const registro = registros.find((item) => item.id === id);
      if (registro?.avaliacaoDaIa && !registro.avaliacaoDaIa.diagnosticoCancelamento) {
        const diag = resolverDiagnosticoParaAvaliacao(registro);
        if (diag) {
          registro.avaliacaoDaIa.diagnosticoCancelamento = diag;
        }
      }
      return registro;
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
      item.notaIa = entrada.nota;
      const criterios = criteriosComChave(entrada.criterios);

      const diagnosticoCancelamento = entrada.diagnosticoCancelamento
        ? {
            ...entrada.diagnosticoCancelamento,
            origem: entrada.diagnosticoCancelamento.origem ?? ('ia' as const)
          }
        : resolverDiagnosticoParaAvaliacao({
            motivo: item.motivo,
            transcricao: item.transcricao,
            avaliacaoDaIa: {
              nota: entrada.nota,
              aprovacao: aprovacaoDaAvaliacao(entrada.nota, criterios),
              criterios,
              resumo: entrada.resumo ?? undefined,
              falhasIdentificadas: entrada.falhasIdentificadas ?? []
            }
          });

      item.avaliacaoDaIa = {
        nota: entrada.nota,
        aprovacao: aprovacaoDaAvaliacao(entrada.nota, criterios),
        criterios,
        resumo: entrada.resumo ?? undefined,
        falhasIdentificadas: entrada.falhasIdentificadas ?? [],
        ...(diagnosticoCancelamento ? { diagnosticoCancelamento } : {})
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
      item.notaCurador = entrada.nota;
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
    async consultarListagem(recorte, query, modo, perfilId, papel) {
      const itens = aplicarConsultaDaListagem(registros, recorte, query, modo, perfilId, papel);
      return itens.map((item) => {
        const info = resolverFavoritos(favoritos, item.id, perfilId);
        const notas = notasDoAtendimento(item);
        return {
          ...item,
          ...notas,
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
        const notas = notasDoAtendimento(item);
        return {
          ...item,
          ...notas,
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
