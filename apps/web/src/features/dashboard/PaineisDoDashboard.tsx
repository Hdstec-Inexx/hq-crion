import type { DashboardResponse, IdDoKpi } from '@hq-crion/contracts/dashboard';
import { destinoDoKpi, destinoDoPainel } from '@hq-crion/contracts/recorte';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

function formatarOuTravessao(valor: number | null, formatar: (valor: number) => string) {
  return valor === null ? '—' : formatar(valor);
}

function formatarPercentual(valor: number) {
  return `${Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',')}%`;
}

export function PaineisDoDashboard({ dashboard }: { dashboard: DashboardResponse }) {
  const periodo = dashboard.periodo;
  const recorte = dashboard.recorte;
  const destino = (indicador: string, detalhe?: { motivo?: string; criterio?: string }) =>
    destinoDoPainel(recorte, periodo, { indicador, ...detalhe });

  return (
    <div className="dashboard-paineis">
      <article className="dashboard-painel">
        <Link to={destino('motivos')}>Motivos</Link>
        <GraficoBarras
          dados={dashboard.paineis.motivos.map((item) => ({
            nome: item.motivo,
            valor: item.quantidade
          }))}
        />
        <ul>
          {dashboard.paineis.motivos.map((item) => (
            <li key={item.motivo}>
              <Link to={destino('motivos', { motivo: item.motivo })}>
                {item.motivo} · {item.quantidade}
              </Link>
            </li>
          ))}
        </ul>
      </article>
      <article className="dashboard-painel">
        <Link to={destino('acertoPorCriterio')}>Acerto por Critério</Link>
        <GraficoBarras
          dados={dashboard.paineis.acertoPorCriterio.flatMap((item) =>
            item.percentual === null
              ? []
              : [{ nome: item.criterio, valor: item.percentual }]
          )}
        />
        <ul>
          {dashboard.paineis.acertoPorCriterio.map((item) => (
            <li key={item.criterio}>
              <Link to={destino('acertoPorCriterio', { criterio: item.criterio })}>
                {item.criterio} · {formatarOuTravessao(item.percentual, formatarPercentual)}
              </Link>
            </li>
          ))}
        </ul>
      </article>
      <article className="dashboard-painel">
        <Link to={destino('concordancia')}>Concordância</Link>
        <p>
          Nota {formatarOuTravessao(dashboard.paineis.concordancia.nota, formatarPercentual)}
          {' · '}
          Critérios{' '}
          {formatarOuTravessao(dashboard.paineis.concordancia.criterios, formatarPercentual)}
        </p>
        <GraficoBarras
          dados={dashboard.paineis.concordancia.porCriterio.flatMap((item) =>
            item.percentual === null
              ? []
              : [{ nome: item.criterio, valor: item.percentual }]
          )}
        />
      </article>
      <article className="dashboard-painel">
        <Link to={destino('naoConformidade')}>Critérios de Não Conformidade</Link>
        <GraficoBarras
          dados={dashboard.paineis.naoConformidade.map((item) => ({
            nome: item.criterio,
            valor: item.quantidade
          }))}
        />
        <ul>
          {dashboard.paineis.naoConformidade.map((item) => (
            <li key={item.criterio}>
              <Link to={destino('naoConformidade', { criterio: item.criterio })}>
                {item.criterio} · {item.quantidade}
              </Link>
            </li>
          ))}
        </ul>
      </article>
      <article className="dashboard-painel">
        <Link to={destino('pioresAtendimentos')}>Piores Atendimentos</Link>
        <ul>
          {dashboard.paineis.pioresAtendimentos.length === 0 ? (
            <li>—</li>
          ) : (
            dashboard.paineis.pioresAtendimentos.map((item) => (
              <li key={item.id}>
                <Link to={destinoDoKpi(recorte, periodo, 'pioresAtendimentos')}>
                  {item.id} · {item.nota.toFixed(1).replace('.', ',')}
                </Link>
              </li>
            ))
          )}
        </ul>
      </article>
    </div>
  );
}

function GraficoBarras({ dados }: { dados: { nome: string; valor: number }[] }) {
  if (dados.length === 0) {
    return <p>—</p>;
  }

  return (
    <div className="dashboard-grafico">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="valor" fill="#5ec4be" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function formatarValorDoKpi(id: IdDoKpi, valor: number | null) {
  if (valor === null) {
    return '—';
  }

  if (id === 'notaMediaIa' || id === 'notaMediaCurador') {
    return valor.toFixed(1).replace('.', ',');
  }

  if (
    id === 'aprovacao' ||
    id === 'taxaDeResolvidas' ||
    id === 'sla' ||
    id === 'promessasCumpridas'
  ) {
    return formatarPercentual(valor);
  }

  if (id === 'tma' || id === 'tempoMedioAteResolucao') {
    const minutos = Math.floor(valor / 60);
    const segundos = Math.round(valor % 60);
    return `${minutos}:${String(segundos).padStart(2, '0')}`;
  }

  return String(valor);
}
