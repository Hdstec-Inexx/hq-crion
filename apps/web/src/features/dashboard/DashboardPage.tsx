import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { Perfil } from '@hq-crion/contracts/perfil';
import {
  administradoraSchema,
  destinoDoKpi,
  queryDoRecorte
} from '@hq-crion/contracts/recorte';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { RecorteCascata } from '../recorte/RecorteCascata';
import { buscarDashboard, type DashboardResponse } from './api';

function formatarNota(nota: number) {
  return nota.toFixed(1).replace('.', ',');
}

function formatarKpi(id: DashboardResponse['kpis'][number]['id'], valor: number | null) {
  if (valor === null) {
    return '—';
  }

  if (id === 'notaMedia') {
    return formatarNota(valor);
  }

  if (id === 'aprovacao') {
    return `${Number.isInteger(valor) ? String(valor) : formatarNota(valor)}%`;
  }

  return String(valor);
}

export function DashboardPage() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [erro, setErro] = useState<'recorte-invalido' | 'dashboard' | null>(null);

  const administradoraNaUrl = searchParams.get('administradora') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';
  const periodoSubmetido = Boolean(searchParams.get('inicio') && searchParams.get('fim'));

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
            : 'dashboard'
        );
      });

    return () => controller.abort();
  }, [searchParams]);

  function atualizarRecorte(administradora: string, agente: string) {
    const recorteQuery = queryDoRecorte({
      administradora: administradoraSchema.safeParse(administradora).data ?? null,
      agente: administradora && agente ? agente : null
    });
    const proxima = new URLSearchParams(searchParams);
    proxima.delete('administradora');
    proxima.delete('agente');

    for (const [chave, valor] of recorteQuery) {
      proxima.set(chave, valor);
    }

    setSearchParams(proxima, { replace: true });
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

  const destinoDosKpis = dashboard
    ? destinoDoKpi(
        dashboard.recorte,
        periodoSubmetido ? dashboard.periodo : null
      )
    : '/atendimentos';

  return (
    <div>
      <div className="pagina-head">
        <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
        <RecorteCascata
          administradora={administradoraNaUrl}
          agente={agenteNaUrl}
          onChange={atualizarRecorte}
        />
      </div>
      <form className="listagem-filtros" onSubmit={onFiltrar}>
        <input
          name="inicio"
          type="date"
          aria-label="Início"
          defaultValue={periodoSubmetido ? (searchParams.get('inicio') ?? '') : ''}
          key={`inicio-${searchParams.get('inicio') ?? ''}`}
        />
        <input
          name="fim"
          type="date"
          aria-label="Fim"
          defaultValue={periodoSubmetido ? (searchParams.get('fim') ?? '') : ''}
          key={`fim-${searchParams.get('fim') ?? ''}`}
        />
        <button type="submit">Filtrar</button>
      </form>
      {erro === 'recorte-invalido' ? (
        <p className="listagem-erro" role="alert">
          Este Recorte não é um par válido de Administradora e Agente de Voz.
        </p>
      ) : null}
      {erro === 'dashboard' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar o Dashboard.
        </p>
      ) : null}
      {dashboard ? (
        <div className="dashboard-kpis">
          {dashboard.kpis.map((item) => (
            <Link className="dashboard-kpi" key={item.id} to={destinoDosKpis}>
              <small>{item.rotulo}</small>
              <strong>{formatarKpi(item.id, item.valor)}</strong>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
