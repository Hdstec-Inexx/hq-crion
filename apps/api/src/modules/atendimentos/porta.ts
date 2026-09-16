import type { RegistroDeAtendimento } from './registro.js';

export type PortaDeLeituraDeAtendimentos = {
  listar(): RegistroDeAtendimento[];
  buscarPorId(id: string): RegistroDeAtendimento | undefined;
};
