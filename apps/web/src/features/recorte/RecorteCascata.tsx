import {
  administradoraSchema,
  administradoras,
  agentesDeVoz
} from '@hq-crion/contracts/recorte';

export function RecorteCascata({
  administradora,
  agente,
  onChange
}: {
  administradora: string;
  agente: string;
  onChange: (administradora: string, agente: string) => void;
}) {
  const administradoraLida = administradoraSchema.safeParse(administradora);
  const agentes = administradoraLida.success
    ? agentesDeVoz.filter((item) => item.administradora === administradoraLida.data)
    : [];

  return (
    <div className="recorte">
      <label>
        Administradora
        <select
          value={administradora}
          onChange={(event) => onChange(event.target.value, '')}
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
          disabled={!administradora}
          onChange={(event) => onChange(administradora, event.target.value)}
        >
          <option value="">Todos os agentes</option>
          {agentes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
