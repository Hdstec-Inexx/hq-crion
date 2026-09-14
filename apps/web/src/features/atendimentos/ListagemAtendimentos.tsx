import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { ListagemResponse } from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import {
  administradoraSchema,
  administradoras,
  agentesDeVoz,
  queryDoRecorte
} from '@hq-crion/contracts/recorte';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { buscarAtendimentos } from './api';

function formatarQuando(iso: string) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(new Date(iso));
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === tipo)?.value ?? '';

  return `${valor('day')}/${valor('month')} ${valor('hour')}:${valor('minute')}`;
}

function formatarNota(nota: number) {
  return nota.toFixed(1).replace('.', ',');
}

export function ListagemAtendimentos() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listagem, setListagem] = useState<ListagemResponse | null>(null);
  const [erro, setErro] = useState<'recorte-invalido' | 'listagem' | null>(null);

  const administradoraNaUrl = searchParams.get('admin') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';
  const administradoraLida = administradoraSchema.safeParse(administradoraNaUrl);
  const agentes = administradoraLida.success
    ? agentesDeVoz.filter((agente) => agente.administradora === administradoraLida.data)
    : [];

  useEffect(() => {
    const controller = new AbortController();

    buscarAtendimentos(searchParams, controller.signal)
      .then((resultado) => {
        if (controller.signal.aborted) {
          return;
        }

        setListagem(resultado);
        setErro(resultado ? null : 'listagem');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setListagem(null);
        setErro(
          error instanceof Error && error.message === 'recorte-invalido'
            ? 'recorte-invalido'
            : 'listagem'
        );
      });

    return () => controller.abort();
  }, [searchParams]);

  function atualizarRecorte(admin: string, agente: string) {
    const recorteQuery = queryDoRecorte({
      administradora: administradoraSchema.safeParse(admin).data ?? null,
      agente: admin && agente ? agente : null
    });
    const proxima = new URLSearchParams(searchParams);
    proxima.delete('admin');
    proxima.delete('agente');
    proxima.delete('pagina');

    for (const [chave, valor] of recorteQuery) {
      proxima.set(chave, valor);
    }

    setSearchParams(proxima, { replace: true });
  }

  function onFiltrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const proxima = new URLSearchParams(searchParams);
    const campos = ['inicio', 'fim', 'status', 'nota', 'motivo', 'conversa', 'curadoria'] as const;

    for (const campo of campos) {
      const valor = String(data.get(campo) ?? '').trim();

      if (valor) {
        proxima.set(campo, valor);
      } else {
        proxima.delete(campo);
      }
    }

    proxima.delete('pagina');
    setSearchParams(proxima);
  }

  function irPara(pagina: number) {
    const proxima = new URLSearchParams(searchParams);
    proxima.set('pagina', String(pagina));
    setSearchParams(proxima);
  }

  const periodoSubmetido = Boolean(searchParams.get('inicio') && searchParams.get('fim'));

  return (
    <div>
      <div className="pagina-head">
        <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
        <div className="recorte">
          <label>
            Administradora
            <select
              value={administradoraNaUrl}
              onChange={(event) => atualizarRecorte(event.target.value, '')}
            >
              <option value="">Todas</option>
              {administradoras.map((administradora) => (
                <option key={administradora} value={administradora}>
                  {administradora}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agente de Voz
            <select
              value={agenteNaUrl}
              disabled={!administradoraNaUrl}
              onChange={(event) => atualizarRecorte(administradoraNaUrl, event.target.value)}
            >
              <option value="">Todos os agentes</option>
              {agentes.map((agente) => (
                <option key={agente.id} value={agente.id}>
                  {agente.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
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
        <select name="status" defaultValue={searchParams.get('status') ?? ''} aria-label="Status">
          <option value="">Status</option>
          <option value="Concluído">Concluído</option>
          <option value="Em andamento">Em andamento</option>
        </select>
        <select name="nota" defaultValue={searchParams.get('nota') ?? ''} aria-label="Nota">
          <option value="">Nota</option>
          <option value="9">9,0</option>
          <option value="8.5">8,5</option>
          <option value="8">8,0</option>
          <option value="7.5">7,5</option>
          <option value="6">6,0</option>
        </select>
        <input
          name="motivo"
          placeholder="Motivo"
          aria-label="Motivo"
          defaultValue={searchParams.get('motivo') ?? ''}
        />
        <input
          name="conversa"
          placeholder="Id da conversa"
          aria-label="Id da conversa"
          defaultValue={searchParams.get('conversa') ?? ''}
        />
        <select
          name="curadoria"
          defaultValue={searchParams.get('curadoria') ?? ''}
          aria-label="Curadoria feita"
        >
          <option value="">Curadoria feita</option>
          <option value="true">Feita</option>
          <option value="false">Não feita</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>
      {erro === 'recorte-invalido' ? (
        <p className="listagem-erro" role="alert">
          Este Recorte não é um par válido de Administradora e Agente de Voz.
        </p>
      ) : null}
      {erro === 'listagem' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar a Listagem de Atendimentos.
        </p>
      ) : null}
      {listagem ? (
        <>
          <div className="listagem-painel">
            {listagem.itens.length === 0 ? (
              <p>Nenhum Atendimento neste Recorte.</p>
            ) : (
              listagem.itens.map((item) => (
                <article className="listagem-linha" key={item.id}>
                  <div>
                    <Link
                      className="listagem-link"
                      to={`/atendimentos/${item.id}${location.search}`}
                    >
                      {item.agente} · {formatarQuando(item.iniciadoEm)}
                    </Link>
                    <div className="listagem-meta">
                      {item.motivo} · {item.status}
                      {item.custo ? ` · ${item.custo}` : ''}
                    </div>
                  </div>
                  <span className="badge-administradora">{item.administradora}</span>
                  <strong>{formatarNota(item.nota)}</strong>
                </article>
              ))
            )}
          </div>
          {listagem.total > listagem.tamanho ? (
            <div className="listagem-paginacao">
              <button
                type="button"
                disabled={listagem.pagina <= 1}
                onClick={() => irPara(listagem.pagina - 1)}
              >
                Anterior
              </button>
              <span>
                Página {listagem.pagina} de {Math.ceil(listagem.total / listagem.tamanho)}
              </span>
              <button
                type="button"
                disabled={listagem.pagina * listagem.tamanho >= listagem.total}
                onClick={() => irPara(listagem.pagina + 1)}
              >
                Próxima
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
