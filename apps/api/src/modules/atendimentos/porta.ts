import type { Recorte } from '@hq-crion/contracts/recorte';
import type { ModoDaListagem } from './filtros.js';
import type { RegistroDeAtendimento } from './registro.js';

export type PortaDeAtendimentos = {
  listar(): Promise<readonly RegistroDeAtendimento[]>;
  buscarPorId(id: string): Promise<RegistroDeAtendimento | undefined>;
  salvar(registro: RegistroDeAtendimento): Promise<void>;
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
