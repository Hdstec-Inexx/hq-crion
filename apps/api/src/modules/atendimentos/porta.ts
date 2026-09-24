import type { GravacaoDaAvaliacaoDaIa, CriterioAvaliado } from '@hq-crion/contracts/atendimento';
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

export type PortaDeAtendimentos = {
  listar(): Promise<readonly RegistroDeAtendimento[]>;
  buscarPorId(id: string): Promise<RegistroDeAtendimento | undefined>;
  gravarAvaliacaoDaIa(
    id: string,
    entrada: GravacaoDaAvaliacaoDaIa
  ): Promise<ResultadoDaAvaliacao>;
  conferir(id: string, entrada: EntradaDeConferencia): Promise<ResultadoDaConferencia>;
  resolverComentario(id: string, adminId: string): Promise<ResultadoDoComentario>;
  idsConcluidos(ids: readonly string[]): Promise<ReadonlySet<string>>;
  consultarListagem(
    recorte: Recorte,
    query: Record<string, string | undefined>,
    modo: ModoDaListagem,
    perfilId: string
  ): Promise<RegistroDeAtendimento[]>;
  consultarDashboard(
    recorte: Recorte,
    query: Record<string, string | undefined>
  ): Promise<RegistroDeAtendimento[]>;
  consultarManutencao(
    recorte: Recorte,
    query: Record<string, string | undefined>
  ): Promise<RegistroDeAtendimento[]>;
};
