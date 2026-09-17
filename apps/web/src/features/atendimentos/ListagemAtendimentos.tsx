import { tituloDaPagina } from '@hq-crion/contracts/casca';
import { custoVisivelPara, type ListagemResponse } from '@hq-crion/contracts/atendimento';
import {
  camposVisiveisDaListagem,
  limparFiltrosDaQuery,
  motivosDeContato,
  type CampoVisivelDaListagem
} from '@hq-crion/contracts/filtros-listagem';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { escreverRecorteNaQuery } from '@hq-crion/contracts/recorte';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { RecorteCascata } from '../recorte/RecorteCascata';
import { buscarRegua } from '../regua/api';
import { lerSessao } from '../auth/sessao';
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

function destinoDoDetalhe(id: string, search: string, lista: string) {
  const params = new URLSearchParams(search);
  params.set('lista', lista);
  const qs = params.toString();

  return qs ? `/atendimentos/${id}?${qs}` : `/atendimentos/${id}`;
}

export function ListagemAtendimentos({
  caminho = '/atendimentos'
}: {
  caminho?: string;
}) {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listagem, setListagem] = useState<ListagemResponse | null>(null);
  const [erro, setErro] = useState<'recorte-invalido' | 'listagem' | null>(null);
  const [criteriosDaRegua, setCriteriosDaRegua] = useState<string[]>([]);
  const campos = camposVisiveisDaListagem(caminho);
  const mostra = (campo: CampoVisivelDaListagem) => campos.includes(campo);

  const administradoraNaUrl = searchParams.get('administradora') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';

  useEffect(() => {
    const controller = new AbortController();

    buscarAtendimentos(caminho, searchParams, controller.signal)
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
  }, [searchParams, caminho]);

  useEffect(() => {
    if (!campos.includes('criterios')) {
      return;
    }

    const sessao = lerSessao();

    if (!sessao) {
      return;
    }

    const controller = new AbortController();
    buscarRegua(sessao, controller.signal)
      .then((regua) => {
        if (!controller.signal.aborted && regua) {
          setCriteriosDaRegua(regua.criterios.map((criterio) => criterio.nome));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCriteriosDaRegua([]);
        }
      });

    return () => controller.abort();
  }, [caminho, campos]);

  function atualizarRecorte(administradora: string, agente: string) {
    setSearchParams(escreverRecorteNaQuery(searchParams, administradora, agente, {
      resetarPagina: true
    }), { replace: true });
  }

  function onFiltrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const proxima = new URLSearchParams(searchParams);
    const simples = [
      'inicio',
      'fim',
      'status',
      'motivo',
      'conversa',
      'notaIa',
      'statusCuradoria',
      'curador'
    ] as const;

    for (const campo of simples) {
      const valor = String(data.get(campo) ?? '').trim();

      if (valor) {
        proxima.set(campo, valor);
      } else {
        proxima.delete(campo);
      }
    }

    for (const campo of ['criteriosAtendidos', 'criteriosNaoAtendidos'] as const) {
      const valores = data
        .getAll(campo)
        .map((valor) => String(valor).trim())
        .filter(Boolean);

      if (valores.length > 0) {
        proxima.set(campo, valores.join(','));
      } else {
        proxima.delete(campo);
      }
    }

    proxima.delete('nota');
    proxima.delete('curadoria');
    proxima.delete('pagina');
    setSearchParams(proxima);
  }

  function limparFiltros() {
    setSearchParams(limparFiltrosDaQuery(searchParams));
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
        <RecorteCascata
          administradora={administradoraNaUrl}
          agente={agenteNaUrl}
          onChange={atualizarRecorte}
        />
      </div>
      <form className="listagem-filtros" onSubmit={onFiltrar}>
        {mostra('periodo') ? (
          <>
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
          </>
        ) : null}
        {mostra('statusAtendimento') ? (
          <select name="status" defaultValue={searchParams.get('status') ?? ''} aria-label="Status do Atendimento">
            <option value="">Status do Atendimento</option>
            <option value="Concluído">Concluído</option>
            <option value="Em andamento">Em andamento</option>
          </select>
        ) : null}
        {mostra('notaIa') ? (
          <input
            name="notaIa"
            type="number"
            step="0.1"
            placeholder="Nota da IA"
            aria-label="Nota da IA"
            defaultValue={searchParams.get('notaIa') ?? ''}
          />
        ) : null}
        {mostra('motivo') ? (
          <select name="motivo" defaultValue={searchParams.get('motivo') ?? ''} aria-label="Motivo">
            <option value="">Motivo</option>
            {motivosDeContato.map((motivo) => (
              <option key={motivo} value={motivo}>
                {motivo}
              </option>
            ))}
          </select>
        ) : null}
        {mostra('conversa') ? (
          <input
            name="conversa"
            placeholder="Id da conversa"
            aria-label="Id da conversa"
            defaultValue={searchParams.get('conversa') ?? ''}
          />
        ) : null}
        {mostra('criterios') ? (
          <>
            <select
              name="criteriosAtendidos"
              multiple
              aria-label="Critérios atendidos"
              defaultValue={searchParams.get('criteriosAtendidos')?.split(',').filter(Boolean) ?? []}
              key={`atendidos-${searchParams.get('criteriosAtendidos') ?? ''}`}
            >
              {criteriosDaRegua.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
            <select
              name="criteriosNaoAtendidos"
              multiple
              aria-label="Critérios não atendidos"
              defaultValue={searchParams.get('criteriosNaoAtendidos')?.split(',').filter(Boolean) ?? []}
              key={`nao-atendidos-${searchParams.get('criteriosNaoAtendidos') ?? ''}`}
            >
              {criteriosDaRegua.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {mostra('statusCuradoria') ? (
          <select
            name="statusCuradoria"
            defaultValue={searchParams.get('statusCuradoria') ?? ''}
            aria-label="Status da curadoria"
          >
            <option value="">Status da curadoria</option>
            <option value="feita">Feita</option>
            <option value="pendente">Pendente</option>
          </select>
        ) : null}
        {mostra('curador') ? (
          <select name="curador" defaultValue={searchParams.get('curador') ?? ''} aria-label="Curador">
            <option value="">Curador</option>
            {listagem?.curadores.map((curador) => (
              <option key={curador.id} value={curador.id}>
                {curador.nome}
              </option>
            ))}
          </select>
        ) : null}
        <button type="submit">Filtrar</button>
        {mostra('limpar') ? (
          <button type="button" onClick={limparFiltros}>
            Limpar
          </button>
        ) : null}
      </form>
      {erro === 'recorte-invalido' ? (
        <p className="listagem-erro" role="alert">
          Este Recorte não é um par válido de Administradora e Agente de Voz.
        </p>
      ) : null}
      {erro === 'listagem' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar {tituloDaPagina(location.pathname, perfil.papel)}.
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
                      to={destinoDoDetalhe(item.id, location.search, location.pathname)}
                    >
                      {item.agente} · {formatarQuando(item.iniciadoEm)}
                    </Link>
                    <div className="listagem-meta">
                      {item.motivo} · {item.status}
                      {custoVisivelPara(perfil.papel) && item.custo ? ` · ${item.custo}` : ''}
                    </div>
                  </div>
                  <BadgeAdministradora
                    administradora={item.administradora}
                    lista={location.pathname}
                  />
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
