import { catalogoDeAtendimentos } from './catalogo.js';
import {
  aplicarConsultaDaListagem,
  aplicarConsultaDoDashboard,
  aplicarConsultaDaManutencao
} from './consulta.js';
import type { PortaDeAtendimentos } from './porta.js';

export function repositorioEmMemoria(): PortaDeAtendimentos {
  const registros = Object.freeze(catalogoDeAtendimentos());

  return {
    async listar() {
      return registros;
    },
    async buscarPorId(id) {
      return registros.find((registro) => registro.id === id);
    },
    async salvar() {
      return;
    },
    async consultarListagem(recorte, query, modo, perfilId) {
      return aplicarConsultaDaListagem(registros, recorte, query, modo, perfilId);
    },
    async consultarDashboard(recorte, query) {
      return aplicarConsultaDoDashboard(registros, recorte, query);
    },
    async consultarManutencao(recorte, query) {
      return aplicarConsultaDaManutencao(registros, recorte, query);
    }
  };
}
