import { catalogoDeAtendimentos } from './catalogo.js';
import type { PortaDeLeituraDeAtendimentos } from './porta.js';

export function repositorioEmMemoria(): PortaDeLeituraDeAtendimentos {
  const registros = Object.freeze(catalogoDeAtendimentos());

  return {
    listar() {
      return registros;
    },
    buscarPorId(id) {
      return registros.find((registro) => registro.id === id);
    }
  };
}
