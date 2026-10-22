import { useEffect, useState } from 'react';
import {
  administradoraSchema,
  administradoras,
  agentesDeVoz,
  agenteCompativelComAdministradora,
  agentesCompativeisComAdministradora,
  buscarAgenteNoCatalogo,
  type AgenteDeVoz
} from '@hq-crion/contracts/recorte';
import { buscarAgentes } from './api';

export function RecorteCascata({
  administradora,
  agente,
  onChange,
  catalogo: catalogoProp
}: {
  administradora: string;
  agente: string;
  onChange: (administradora: string, agente: string) => void;
  catalogo?: AgenteDeVoz[];
}) {
  const [agentesCarregados, setAgentesCarregados] = useState<AgenteDeVoz[]>(
    catalogoProp ?? agentesDeVoz
  );

  useEffect(() => {
    if (catalogoProp) {
      setAgentesCarregados(catalogoProp);
      return;
    }

    const controller = new AbortController();
    buscarAgentes(controller.signal)
      .then((resultado) => {
        if (resultado && resultado.length > 0) {
          setAgentesCarregados(resultado);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [catalogoProp]);

  const catalogo = catalogoProp ?? agentesCarregados;
  const administradoraLida = administradoraSchema.safeParse(administradora);
  const administradoraValida = administradoraLida.success ? administradoraLida.data : null;

  const agentesVisiveis = agentesCompativeisComAdministradora(catalogo, administradoraValida);

  function onMudarAdministradora(novaAdministradora: string) {
    if (!agente) {
      onChange(novaAdministradora, '');
      return;
    }

    const novaAdministradoraLida = administradoraSchema.safeParse(novaAdministradora);
    const novaAdministradoraValida = novaAdministradoraLida.success
      ? novaAdministradoraLida.data
      : null;

    if (!novaAdministradoraValida) {
      onChange(novaAdministradora, agente);
      return;
    }

    const agenteAtual = buscarAgenteNoCatalogo(agente, catalogo);

    if (
      agenteAtual &&
      agenteCompativelComAdministradora(agenteAtual, novaAdministradoraValida)
    ) {
      onChange(novaAdministradora, agente);
    } else {
      onChange(novaAdministradora, '');
    }
  }

  return (
    <div className="recorte">
      <label>
        Administradora
        <select
          value={administradora}
          onChange={(event) => onMudarAdministradora(event.target.value)}
        >
          <option value="">Todas</option>
          {administradoras.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
      </label>
      <label>
        Agente de Voz
        <select
          value={agente}
          onChange={(event) => onChange(administradora, event.target.value)}
        >
          <option value="">Todos os agentes</option>
          {agentesVisiveis.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
