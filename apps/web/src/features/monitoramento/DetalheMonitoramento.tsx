import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { MonitoramentoDetalhe } from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { destinoDaLista, lerRecorte } from '@hq-crion/contracts/recorte';
import { useRef, useState } from 'react';
import { Link, useLocation, useParams, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { buscarDetalheDoMonitoramento } from './api';
import {
  avisoDaTranscricao,
  observarTranscricao,
  textoDaObservacao,
  type ObservacaoDaTranscricao
} from './observacao';
import { abortou, useAtualizacaoAoVivo } from './useAtualizacaoAoVivo';

function listaComRecorte(searchParams: URLSearchParams) {
  try {
    return destinoDaLista(
      lerRecorte({
        administradora: searchParams.get('administradora') ?? undefined,
        agente: searchParams.get('agente') ?? undefined
      }),
      searchParams.get('lista') ?? '/monitoramento'
    );
  } catch {
    return '/monitoramento';
  }
}

const observacaoInicial: ObservacaoDaTranscricao = { transcricao: [], observando: true };

export function DetalheMonitoramento() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [atendimento, setAtendimento] = useState<MonitoramentoDetalhe | null>(null);
  const [erro, setErro] = useState<'nao-encontrado' | 'detalhe' | null>(null);
  const [observacao, setObservacao] = useState<ObservacaoDaTranscricao>(observacaoInicial);
  const carregou = useRef(false);
  const idAtual = useRef(id);
  const [idDaTela, setIdDaTela] = useState(id);
  const volta = listaComRecorte(searchParams);

  if (idDaTela !== id) {
    setIdDaTela(id);
    carregou.current = false;
    setAtendimento(null);
    setErro(null);
    setObservacao(observacaoInicial);
  }

  idAtual.current = id;

  useAtualizacaoAoVivo(observacao.observando, id ?? '', async (signal) => {
    if (!id) {
      return;
    }

    const pedido = id;

    try {
      const resultado = await buscarDetalheDoMonitoramento(id, signal);

      if (signal.aborted || idAtual.current !== pedido) {
        return;
      }

      if (!resultado) {
        if (!carregou.current) {
          setErro('detalhe');
        }

        return;
      }

      carregou.current = true;
      setAtendimento(resultado);
      setErro(null);
      setObservacao((atual) =>
        observarTranscricao(atual, { transcricao: resultado.transcricao, aberto: true })
      );
    } catch (error: unknown) {
      if (signal.aborted || abortou(error) || idAtual.current !== pedido) {
        return;
      }

      if (error instanceof Error && error.message === 'atendimento-nao-encontrado') {
        if (!carregou.current) {
          setAtendimento(null);
          setErro('nao-encontrado');
          setObservacao((atual) => ({ ...atual, observando: false }));
          return;
        }

        setErro(null);
        setObservacao((atual) =>
          observarTranscricao(atual, { transcricao: atual.transcricao, aberto: false })
        );
        return;
      }

      if (!carregou.current) {
        setErro('detalhe');
      }
    }
  });

  const aviso = avisoDaTranscricao({
    observando: observacao.observando,
    quantidade: observacao.transcricao.length
  });

  return (
    <div>
      <div className="pagina-head">
        <div>
          <Link className="voltar-lista" to={volta}>
            Voltar à lista
          </Link>
          <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
        </div>
      </div>
      {erro === 'nao-encontrado' ? (
        <p className="listagem-erro" role="alert">
          Este Atendimento aberto não foi encontrado.
        </p>
      ) : null}
      {erro === 'detalhe' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar o Monitoramento ao Vivo.
        </p>
      ) : null}
      {atendimento ? (
        <>
          <p className="detalhe-resumo">{textoDaObservacao(observacao.observando)}</p>
          <dl className="detalhe-fatos">
            {atendimento.administradora ? (
              <div>
                <dt>Administradora</dt>
                <dd>
                  <BadgeAdministradora
                    administradora={atendimento.administradora}
                    lista={searchParams.get('lista') ?? '/monitoramento'}
                  />
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Agente de Voz</dt>
              <dd>{atendimento.agente}</dd>
            </div>
            <div>
              <dt>Motivo de Contato</dt>
              <dd>{atendimento.motivo}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{atendimento.status}</dd>
            </div>
          </dl>
          <section className="transcricao" aria-label="Transcrição">
            <h2>Transcrição</h2>
            {aviso ? <p className="transcricao-espera">{aviso}</p> : null}
            <div className="transcricao-colunas">
              {observacao.transcricao.map((turno, index) => {
                const doAgente = turno.locutor === 'Agente de Voz';

                return (
                  <article
                    className={`transcricao-turno ${doAgente ? 'is-agente' : 'is-cliente'}`}
                    key={`${turno.quando}-${index}`}
                  >
                    {doAgente ? (
                      <div className="transcricao-celula">
                        <span className="transcricao-trilho" aria-hidden="true" />
                        <div>
                          <div className="transcricao-meta">
                            {atendimento.agente} · {turno.quando}
                          </div>
                          <p>{turno.texto}</p>
                        </div>
                      </div>
                    ) : (
                      <div />
                    )}
                    {doAgente ? (
                      <div />
                    ) : (
                      <div className="transcricao-celula is-cliente">
                        <div>
                          <div className="transcricao-meta">Cliente · {turno.quando}</div>
                          <p>{turno.texto}</p>
                        </div>
                        <span className="transcricao-trilho" aria-hidden="true" />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
