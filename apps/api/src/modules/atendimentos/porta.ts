import type {
  GravacaoDaAvaliacaoDaIa,
  CriterioAvaliado,
  PercursoDaFilaDeManutencao,
  TurnoDaTranscricao
} from '@hq-crion/contracts/atendimento';
import type { Papel } from '@hq-crion/contracts/perfil';
import type { Recorte } from '@hq-crion/contracts/recorte';
import type { ModoDaListagem } from './filtros.js';
import type { CuradorDaRevisao, RegistroDeAtendimento } from './registro.js';

export type EntradaDeConferencia = {
  curador: CuradorDaRevisao;
  nota: number;
  criterios: CriterioAvaliado[];
  comentario?: string;
};

export type ResultadoDaAvaliacao = 'ok' | 'ausente' | 'em-andamento';
export type ResultadoDaConferencia = 'ok' | 'ausente' | 'indisponivel';
export type ResultadoDoComentario = RegistroDeAtendimento | 'ausente' | 'ja-resolvido';

export type FavoritosDoAtendimento = {
  favoritadoPeloUsuario: boolean;
  favoritos: {
    count: number;
    perfis: Array<{ id: string; nome: string }>;
  };
};

export type CuradorDoFiltro = {
  id: string;
  nome: string;
};

export type ResultadoFavoritos = {
  itens: RegistroDeAtendimento[];
  curadores: CuradorDoFiltro[];
};

export type PortaDeAtendimentos = {
  listar(): Promise<readonly RegistroDeAtendimento[]>;
  buscarPorId(id: string): Promise<RegistroDeAtendimento | undefined>;
  gravarTranscricao(id: string, transcricao: readonly TurnoDaTranscricao[]): Promise<void>;
  gravarAvaliacaoDaIa(
    id: string,
    entrada: GravacaoDaAvaliacaoDaIa
  ): Promise<ResultadoDaAvaliacao>;
  conferir(id: string, entrada: EntradaDeConferencia): Promise<ResultadoDaConferencia>;
  resolverComentario(id: string, adminId: string): Promise<ResultadoDoComentario>;
  favoritar(atendimentoId: string, perfilId: string): Promise<'ok' | 'ausente'>;
  desfavoritar(atendimentoId: string, perfilId: string): Promise<'ok' | 'ausente'>;
  obterFavoritos(atendimentoId: string, perfilId: string): Promise<FavoritosDoAtendimento | undefined>;
  obterFavoritosPorAtendimentos(
    atendimentoIds: readonly string[],
    perfilId: string
  ): Promise<Map<string, FavoritosDoAtendimento>>;
  idsConcluidos(ids: readonly string[]): Promise<ReadonlySet<string>>;
  idsPersistidos(ids: readonly string[]): Promise<ReadonlySet<string>>;
  consultarListagem(
    recorte: Recorte,
    query: Record<string, string | undefined>,
    modo: ModoDaListagem,
    perfilId: string
  ): Promise<RegistroDeAtendimento[]>;
  consultarFavoritos(
    recorte: Recorte,
    query: Record<string, string | undefined>,
    perfil: { id: string; papel: Papel }
  ): Promise<ResultadoFavoritos>;
  consultarDashboard(
    recorte: Recorte,
    query: Record<string, string | undefined>
  ): Promise<RegistroDeAtendimento[]>;
  consultarManutencao(
    recorte: Recorte,
    query: Record<string, string | undefined>
  ): Promise<RegistroDeAtendimento[]>;
  consultarPercursoDaManutencao(
    atendimentoId: string,
    recorte: Recorte,
    query: Record<string, string | undefined>
  ): Promise<PercursoDaFilaDeManutencao | 'ausente'>;
};
