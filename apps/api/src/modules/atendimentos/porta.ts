import type { RegistroDeAtendimento } from './registro.js';

export type PortaDeLeituraDeAtendimentos = {
  listar(): readonly RegistroDeAtendimento[];
  buscarPorId(id: string): RegistroDeAtendimento | undefined;
};
