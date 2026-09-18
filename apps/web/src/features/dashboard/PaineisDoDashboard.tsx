import type {
  DashboardResponse,
  IdDoKpi,
  IndicadorDoDashboard
} from '@hq-crion/contracts/dashboard';
import { destinoDoKpi, destinoDoPainel } from '@hq-crion/contracts/recorte';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { coresDoAnel, fatiasVisiveisDoAnel } from './coresDoAnel';

function formatarOuTravessao(valor: number | null, formatar: (valor: number) => string) {
  return valor === null ? '—' : formatar(valor);
}

function formatarPercentual(valor: number) {
  return `${Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',')}%`;
}

function usePrefereMenosMovimento() {
  const [reduzir, setReduzir] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const atualizar = () => setReduzir(media.matches);
    atualizar();
    media.addEventListener('change', atualizar);
    return () => media.removeEventListener('change', atualizar);
  }, []);

  return reduzir;
}

export function PaineisDoDashboard({ dashboard }: { dashboard: DashboardResponse }) {
  const periodo = dashboard.periodo;
  const recorte = dashboard.recorte;
  const reduzirMovimento = usePrefereMenosMovimento();
  const destino = (indicador: IndicadorDoDashboard) =>
    destinoDoPainel(recorte, periodo, indicador);

  return (
    <div className="dashboard-paineis">
      <article className="dashboard-painel">
        <Link to={destino('motivos')}>Motivos</Link>
        <GraficoAnel
          dados={dashboard.paineis.motivos.map((item) => ({
            nome: item.motivo,
            valor: item.quantidade
          }))}
          destino={destino('motivos')}
          deslocamento={0}
          rotulo="Gráfico de Motivos"
          vazio="Nenhum Motivo no período."
          reduzirMovimento={reduzirMovimento}
        />
      </article>
      <article className="dashboard-painel">
        <Link to={destino('acertoPorCriterio')}>Acerto por Critério</Link>
        <GraficoBarras
          dados={dashboard.paineis.acertoPorCriterio.flatMap((item) =>
            item.percentual === null
              ? []
              : [{ nome: item.criterio, valor: item.percentual }]
          )}
          destino={destino('acertoPorCriterio')}
          reduzirMovimento={reduzirMovimento}
        />
        <ul>
          {dashboard.paineis.acertoPorCriterio.map((item) => (
            <li key={item.criterio}>
              <Link to={destino('acertoPorCriterio')}>
                {item.criterio} · {formatarOuTravessao(item.percentual, formatarPercentual)}
              </Link>
            </li>
          ))}
        </ul>
      </article>
      <article className="dashboard-painel dashboard-painel-concordancia">
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
          destino={destino('concordancia')}
          reduzirMovimento={reduzirMovimento}
        />
      </article>
      <article className="dashboard-painel">
        <Link to={destino('naoConformidade')}>Critérios de Não Conformidade</Link>
        <GraficoAnel
          dados={dashboard.paineis.naoConformidade.map((item) => ({
            nome: item.criterio,
            valor: item.quantidade
          }))}
          destino={destino('naoConformidade')}
          deslocamento={1}
          rotulo="Gráfico de Critérios de Não Conformidade"
          vazio="Nenhum Critério com Não Conformidade no período."
          reduzirMovimento={reduzirMovimento}
        />
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

function GraficoAnel({
  dados,
  destino,
  deslocamento,
  rotulo,
  vazio,
  reduzirMovimento
}: {
  dados: { nome: string; valor: number }[];
  destino: string;
  deslocamento: number;
  rotulo: string;
  vazio: string;
  reduzirMovimento: boolean;
}) {
  const navigate = useNavigate();
  const fatias = fatiasVisiveisDoAnel(dados);

  if (fatias.length === 0) {
    return <p className="dashboard-vazio">{vazio}</p>;
  }

  const cores = coresDoAnel(dados.length, deslocamento);
  const indiceDaFatia = new Map(dados.map((item, indice) => [item.nome, indice]));
  const total = fatias.reduce((soma, item) => soma + item.valor, 0);

  return (
    <div className="dashboard-anel">
      <button
        aria-label={rotulo}
        className="dashboard-anel-frame"
        onClick={() => navigate(destino)}
        type="button"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fatias}
              dataKey="valor"
              innerRadius="58%"
              isAnimationActive={!reduzirMovimento}
              nameKey="nome"
              outerRadius="100%"
              stroke="none"
            >
              {fatias.map((item) => (
                <Cell fill={cores[indiceDaFatia.get(item.nome) ?? 0]} key={item.nome} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </button>
      <ul className="dashboard-anel-legenda">
        {dados.map((item, indice) => {
          const parcela = total === 0 ? 0 : (item.valor / total) * 100;
          return (
            <li key={item.nome}>
              <Link to={destino}>
                <span
                  className="dashboard-anel-swatch"
                  style={{ background: cores[indice] }}
                />
                <span>{item.nome}</span>
                <strong>
                  {item.valor.toLocaleString('pt-BR')} ({parcela.toFixed(0)}%)
                </strong>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GraficoBarras({
  dados,
  destino,
  reduzirMovimento
}: {
  dados: { nome: string; valor: number }[];
  destino: string;
  reduzirMovimento: boolean;
}) {
  const navigate = useNavigate();

  if (dados.length === 0) {
    return <p>—</p>;
  }

  return (
    <button className="dashboard-grafico" onClick={() => navigate(destino)} type="button">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar
            dataKey="valor"
            fill="#5ec4be"
            isAnimationActive={!reduzirMovimento}
            radius={[0, 6, 6, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </button>
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
