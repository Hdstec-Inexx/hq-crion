import {
  fraseDoHoverDeAcertoPorCriterio,
  fraseDoHoverDeConcordanciaPorCriterio,
  type DashboardResponse,
  type IdDoKpi,
  type IndicadorDoDashboard
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
      <article className="dashboard-painel dashboard-painel-motivos">
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
      <article className="dashboard-painel dashboard-painel-nao-conformidade">
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
      <article className="dashboard-painel dashboard-painel-concordancia">
        <Link to={destino('concordancia')}>Concordância</Link>
        <div className="dashboard-concordancia-resumo">
          <article>
            <small>Nota</small>
            <strong>
              {formatarOuTravessao(dashboard.paineis.concordancia.nota, formatarPercentual)}
            </strong>
          </article>
          <article>
            <small>Critérios</small>
            <strong>
              {formatarOuTravessao(dashboard.paineis.concordancia.criterios, formatarPercentual)}
            </strong>
          </article>
        </div>
        <GraficoBarras
          dados={dashboard.paineis.concordancia.porCriterio.map((item) => ({
            nome: item.criterio,
            valor: item.percentual,
            frase: fraseDoHoverDeConcordanciaPorCriterio(item)
          }))}
          destinoDaBarra={() => destino('concordancia')}
          vazio="Nenhuma Concordância por Critério no período."
        />
      </article>
      <article className="dashboard-painel dashboard-painel-acerto">
        <Link to={destino('acertoPorCriterio')}>Acerto por Critério</Link>
        <GraficoBarras
          dados={dashboard.paineis.acertoPorCriterio.map((item) => ({
            nome: item.criterio,
            valor: item.percentual,
            frase: fraseDoHoverDeAcertoPorCriterio(item)
          }))}
          destinoDaBarra={(criterio) =>
            destino('acertoPorCriterio', { criteriosAtendidos: criterio })
          }
          vazio="Nenhum Critério no período."
        />
      </article>
      <article className="dashboard-painel dashboard-painel-piores">
        <Link to={destino('pioresAtendimentos')}>Piores Atendimentos</Link>
        {dashboard.paineis.pioresAtendimentos.length === 0 ? (
          <p className="dashboard-vazio">Nenhum Atendimento no período.</p>
        ) : (
          <ol className="dashboard-piores">
            {dashboard.paineis.pioresAtendimentos.map((item) => (
              <li key={item.id}>
                <strong>{item.nota.toFixed(1).replace('.', ',')}</strong>
                <div>
                  <Link to={destinoDoDetalheDoDashboard(item.id, recorte, periodo)}>
                    Atendimento {item.id}
                  </Link>
                  <span>Nota da IA Avaliadora</span>
                </div>
              </li>
            ))}
          </ol>
        )}
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
