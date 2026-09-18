import type {
  DashboardResponse,
  IdDoKpi,
  IndicadorDoDashboard
} from '@hq-crion/contracts/dashboard';
import {
  destinoDoDetalheDoDashboard,
  destinoDoPainel
} from '@hq-crion/contracts/recorte';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraficoAnel } from './GraficoAnel';
import { GraficoBarras } from './GraficoBarras';

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
  const destino = (
    indicador: IndicadorDoDashboard,
    extras?: Record<string, string>
  ) => destinoDoPainel(recorte, periodo, indicador, extras);

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
          destinoDaFatia={(motivo) => destino('motivos', { motivo })}
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
              <Link to={destino('acertoPorCriterio', { criteriosAtendidos: item.criterio })}>
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
          destinoDaFatia={(criterio) =>
            destino('naoConformidade', { criteriosNaoAtendidos: criterio })
          }
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
                <Link to={destinoDoDetalheDoDashboard(item.id, recorte, periodo)}>
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
