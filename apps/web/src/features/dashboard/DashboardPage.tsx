import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { Perfil } from '@hq-crion/contracts/perfil';
import {
  destinoDoKpi,
  escreverRecorteNaQuery,
  periodoAteHoje,
  periodoDoDashboard
} from '@hq-crion/contracts/recorte';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { RecorteCascata } from '../recorte/RecorteCascata';
import { buscarDashboard, type DashboardResponse } from './api';
import { formatarValorDoKpi, PaineisDoDashboard } from './PaineisDoDashboard';

export function DashboardPage() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [erro, setErro] = useState<'recorte-invalido' | 'periodo-invalido' | 'dashboard' | null>(
    null
  );

  const administradoraNaUrl = searchParams.get('administradora') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';
  const inicioInformado = searchParams.get('inicio') ?? '';
  const fimInformado = searchParams.get('fim') ?? '';
  const periodoResolvido = periodoDoDashboard({ inicio: inicioInformado, fim: fimInformado });
  const inicioCampo = periodoResolvido?.inicio ?? inicioInformado;
  const fimCampo = periodoResolvido?.fim ?? fimInformado;
  const [inicioRascunho, setInicioRascunho] = useState(inicioCampo);
  const [fimRascunho, setFimRascunho] = useState(fimCampo);

  useEffect(() => {
    setInicioRascunho(inicioCampo);
    setFimRascunho(fimCampo);
  }, [inicioCampo, fimCampo]);

  useEffect(() => {
    const controller = new AbortController();

    buscarDashboard(searchParams, controller.signal)
      .then((resultado) => {
        if (controller.signal.aborted) {
          return;
        }

        setDashboard(resultado);
        setErro(resultado ? null : 'dashboard');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setDashboard(null);
        setErro(
          error instanceof Error && error.message === 'recorte-invalido'
            ? 'recorte-invalido'
            : error instanceof Error && error.message === 'periodo-invalido'
              ? 'periodo-invalido'
              : 'dashboard'
        );
      });

    return () => controller.abort();
  }, [searchParams]);

  function atualizarRecorte(administradora: string, agente: string) {
    setSearchParams(escreverRecorteNaQuery(searchParams, administradora, agente), {
      replace: true
    });
  }

  function onFiltrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const proxima = new URLSearchParams(searchParams);

    for (const campo of ['inicio', 'fim'] as const) {
      const valor = String(data.get(campo) ?? '').trim();

      if (valor) {
        proxima.set(campo, valor);
      } else {
        proxima.delete(campo);
      }
    }

    setSearchParams(proxima);
  }

  function limparPeriodo() {
    const janela = periodoAteHoje(new Date());
    setInicioRascunho(janela.inicio);
    setFimRascunho(janela.fim);
    const proxima = new URLSearchParams(searchParams);
    proxima.delete('inicio');
    proxima.delete('fim');
    setSearchParams(proxima);
  }

  return (
    <div className="dashboard-pagina">
      <div className="pagina-head">
        <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
        <RecorteCascata
          administradora={administradoraNaUrl}
          agente={agenteNaUrl}
          onChange={atualizarRecorte}
        />
      </div>
      <form className="dashboard-periodo" onSubmit={onFiltrar}>
        <label>
          Data inicial
          <input
            name="inicio"
            type="date"
            value={inicioRascunho}
            onChange={(event) => setInicioRascunho(event.target.value)}
          />
        </label>
        <label>
          Data final
          <input
            name="fim"
            type="date"
            value={fimRascunho}
            onChange={(event) => setFimRascunho(event.target.value)}
          />
        </label>
        <button type="submit">Aplicar</button>
        <button type="button" onClick={limparPeriodo}>
          Limpar
        </button>
      </form>
      {erro === 'recorte-invalido' ? (
        <p className="listagem-erro" role="alert">
          Este Recorte não é um par válido de Administradora e Agente de Voz.
        </p>
      ) : null}
      {erro === 'periodo-invalido' ? (
        <p className="listagem-erro" role="alert">
          O período não pôde ser analisado. Confira as datas.
        </p>
      ) : null}
      {erro === 'dashboard' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar o Dashboard.
        </p>
      ) : null}
      {dashboard ? (
        <>
          <div className="dashboard-kpis">
            {dashboard.kpis.map((item) => (
              <Link
                className="dashboard-kpi"
                key={item.id}
                to={destinoDoKpi(dashboard.recorte, dashboard.periodo, item.id)}
              >
                <small>{item.rotulo}</small>
                <strong>{formatarValorDoKpi(item.id, item.valor)}</strong>
                {item.id === 'sla' && item.limiarEmSegundos !== undefined && item.meta !== undefined ? (
                  <em>
                    Tempo de Espera ≤ {item.limiarEmSegundos}s · meta {item.meta}%
                  </em>
                ) : item.meta !== undefined ? (
                  <em>meta {item.meta}%</em>
                ) : null}
              </Link>
            ))}
          </div>
          <PaineisDoDashboard dashboard={dashboard} />
        </>
      ) : null}
    </div>
  );
}
