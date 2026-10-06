import { tituloDaPagina } from '@hq-crion/contracts/casca';
import {
  caminhoDeMidiaPermitido,
  custoVisivelPara,
  downloadVisivelPara,
  falhasIdentificadasDe,
  notaDerivada,
  seloDaAvaliacao,
  type AtendimentoDetalhe,
  type Avaliacao,
  type AvaliacaoDoCurador,
  type EstadoDoCriterio,
  type PercursoDaFilaDeManutencao
} from '@hq-crion/contracts/atendimento';
import type { Perfil } from '@hq-crion/contracts/perfil';
import type { CriterioDaRegua, ReguaDeAvaliacao } from '@hq-crion/contracts/regua';
import {
  destinoDaFilaDeManutencao,
  destinoDaLista,
  lerRecorte,
  proximoDestinoDoPercurso
} from '@hq-crion/contracts/recorte';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { lerSessao } from '../auth/sessao';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { buscarRegua } from '../regua/api';
import { buscarAtendimento, buscarObjetoDaMidia, buscarPercursoDaFila, gravarConferencia, marcarComentarioResolvido } from './api';
import { ReproducaoDoAtendimento } from './TranscricaoDoAtendimento';

function formatarNota(nota: number) {
  return nota.toFixed(1).replace('.', ',');
}

function formatarPontos(pontos: number) {
  return `${formatarNota(pontos)} pt`;
}

function classeDoEstado(estado: Avaliacao['criterios'][number]['estado']) {
  if (estado === 'Atendido') {
    return 'ok';
  }

  if (estado === 'Não atendido') {
    return 'no';
  }

  return 'na';
}

function listaComRecorte(searchParams: URLSearchParams) {
  try {
    return destinoDaLista(
      lerRecorte({
        administradora: searchParams.get('administradora') ?? undefined,
        agente: searchParams.get('agente') ?? undefined
      }),
      searchParams.get('lista') ?? '/atendimentos'
    );
  } catch {
    return '/atendimentos';
  }
}

function PainelAvaliacao({
  titulo,
  avaliacao
}: {
  titulo: string;
  avaliacao: Avaliacao | AvaliacaoDoCurador;
}) {
  const aprovado = avaliacao.aprovacao === 'Aprovado';
  const doCurador = 'notaDaAvaliacaoDaIa' in avaliacao;
  const resumo =
    'resumo' in avaliacao && typeof avaliacao.resumo === 'string' ? avaliacao.resumo.trim() : '';
  const falhas = falhasIdentificadasDe(
    'falhasIdentificadas' in avaliacao ? avaliacao.falhasIdentificadas : []
  );

  return (
    <section className="avaliacao-painel" aria-label={titulo}>
      <header className="avaliacao-head">
        <h2>{titulo}</h2>
        <div className={`avaliacao-score${aprovado ? '' : ' is-fail'}`}>
          <strong>{formatarNota(avaliacao.nota)}</strong>
          <span>{avaliacao.aprovacao}</span>
        </div>
      </header>
      {doCurador ? (
        <p className="avaliacao-snapshot">
          Curador: {avaliacao.curador}. Nota da Avaliação da IA no snapshot:{' '}
          {formatarNota(avaliacao.notaDaAvaliacaoDaIa)}
        </p>
      ) : null}
      <div className="criterio-grid">
        {avaliacao.criterios.map((criterio) => {
          const estadoClasse = classeDoEstado(criterio.estado);

          return (
            <article className={`criterio-card is-${estadoClasse}`} key={criterio.nome}>
              <div className="criterio-top">
                <h3>{criterio.nome}</h3>
                <span className="criterio-pontos">{formatarPontos(criterio.pontos)}</span>
              </div>
              {criterio.critico ? <span className="criterio-critico">Crítico</span> : null}
              <span className={`criterio-chip ${estadoClasse}`}>{criterio.estado}</span>
            </article>
          );
        })}
      </div>
      {doCurador && avaliacao.comentario ? (
        <p className="avaliacao-comentario">{avaliacao.comentario}</p>
      ) : null}
      {!doCurador ? (
        <div className="avaliacao-notes">
          <div className="avaliacao-note-col">
            <p className="panel-label">Resumo do Atendimento</p>
            <div className="avaliacao-resumo-scroll">
              <p>{resumo || 'Resumo não informado.'}</p>
            </div>
          </div>
          <div className="avaliacao-note-col">
            <p className="panel-label">Falhas Identificadas</p>
            <div className="avaliacao-falhas-scroll">
              {falhas.length > 0 ? (
                <ul>
                  {falhas.map((falha, index) => (
                    <li key={`${index}:${falha}`}>{falha}</li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma falha identificada.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function conferenciaAberta(
  papel: Perfil['papel'],
  atendimento: AtendimentoDetalhe
) {
  return (
    papel === 'Curador' &&
    atendimento.status === 'Concluído' &&
    Boolean(atendimento.avaliacaoDaIa) &&
    !atendimento.avaliacaoDoCurador
  );
}

function estadosDoCriterioNaConferencia(criterio: Pick<CriterioDaRegua, 'admiteNaoSeAplica'>): EstadoDoCriterio[] {
  return criterio.admiteNaoSeAplica
    ? ['Atendido', 'Não atendido', 'Não se aplica']
    : ['Atendido', 'Não atendido'];
}

function criterioNaRegua(
  regua: ReguaDeAvaliacao,
  criterio: { chave?: string; nome: string }
) {
  const porNome = regua.criterios.find((item) => item.nome === criterio.nome);

  if (!porNome || (criterio.chave && criterio.chave !== porNome.chave)) {
    return undefined;
  }

  return porNome;
}

function FormularioConferencia({
  atendimento,
  onGravada
}: {
  atendimento: AtendimentoDetalhe & { avaliacaoDaIa: Avaliacao };
  onGravada: (detalhe: AtendimentoDetalhe) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [regua, setRegua] = useState<ReguaDeAvaliacao | null>(null);
  const [estados, setEstados] = useState<Record<string, EstadoDoCriterio>>(() =>
    Object.fromEntries(
      atendimento.avaliacaoDaIa.criterios.map((criterio) => [criterio.nome, criterio.estado])
    )
  );
  const resumo =
    typeof atendimento.avaliacaoDaIa.resumo === 'string'
      ? atendimento.avaliacaoDaIa.resumo.trim()
      : '';
  const falhas = falhasIdentificadasDe(atendimento.avaliacaoDaIa.falhasIdentificadas);

  useEffect(() => {
    const sessao = lerSessao();

    if (!sessao) {
      return;
    }

    const controller = new AbortController();

    buscarRegua(sessao, controller.signal)
      .then((resultado) => {
        if (!controller.signal.aborted) {
          setRegua(resultado);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setErro('Não foi possível carregar a Régua.');
        }
      });

    return () => controller.abort();
  }, []);

  const linhas = regua
    ? atendimento.avaliacaoDaIa.criterios.flatMap((criterio) => {
        const daRegua = criterioNaRegua(regua, criterio);

        if (!daRegua) {
          return [];
        }

        return [
          {
            criterio,
            daRegua,
            estado: estados[criterio.nome] ?? criterio.estado
          }
        ];
      })
    : [];
  const checklistCompleto =
    regua !== null && linhas.length === atendimento.avaliacaoDaIa.criterios.length;
  const nota = notaDerivada(
    linhas.map((linha) => ({ estado: linha.estado, pontos: linha.daRegua.valor }))
  );
  const selo = checklistCompleto
    ? seloDaAvaliacao(
        nota,
        regua.limiarDeAprovacao,
        linhas.map((linha) => ({ estado: linha.estado, critico: linha.daRegua.critico }))
      )
    : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const comentario = String(data.get('comentario') ?? '').trim();
    const checklist = atendimento.avaliacaoDaIa.criterios.map((criterio) => ({
      ...(criterio.chave ? { chave: criterio.chave } : {}),
      nome: criterio.nome,
      estado: estados[criterio.nome] ?? criterio.estado
    }));

    setErro(null);
    setEnviando(true);

    try {
      const gravado = await gravarConferencia(atendimento.id, {
        checklist,
        ...(comentario ? { comentario } : {})
      });

      if (!gravado) {
        setErro('A sessão expirou. Entre de novo.');
        return;
      }

      onGravada(gravado);
    } catch {
      setErro('Não foi possível gravar a conferência.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="conferencia-form" onSubmit={onSubmit} aria-label="Conferência humana">
      <h2>Conferência humana</h2>
      <p className="panel-label">Checklist do Curador</p>
      <p>Os estados começam iguais aos da IA. Confirme ou corrija cada Critério.</p>
      <div className="conferencia-lista">
        {linhas.map(({ criterio, daRegua, estado }) => (
          <div className="conferencia-linha" key={criterio.nome}>
            <div className="criterio-top">
              <strong>{criterio.nome}</strong>
              <span className="criterio-pontos">{formatarPontos(daRegua.valor)}</span>
            </div>
            {daRegua.critico ? <span className="criterio-critico">Crítico</span> : null}
            <div className="conferencia-estados">
              {estadosDoCriterioNaConferencia(daRegua).map((opcao) => (
                <label key={opcao}>
                  <input
                    type="radio"
                    name={`estado-${criterio.nome}`}
                    value={opcao}
                    checked={estado === opcao}
                    onChange={() =>
                      setEstados((atual) => ({ ...atual, [criterio.nome]: opcao }))
                    }
                  />
                  {opcao}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {selo ? (
        <div className={`avaliacao-score${selo === 'Aprovado' ? '' : ' is-fail'}`}>
          <strong>{formatarNota(nota)}</strong>
          <span>{selo}</span>
        </div>
      ) : null}
      <p>Nota da Avaliação da IA: {formatarNota(atendimento.avaliacaoDaIa.nota)}</p>
      <div className="avaliacao-notes">
        <div className="avaliacao-note-col">
          <p className="panel-label">Falhas Identificadas</p>
          <div className="avaliacao-falhas-scroll">
            {falhas.length > 0 ? (
              <ul>
                {falhas.map((falha, index) => (
                  <li key={`${index}:${falha}`}>{falha}</li>
                ))}
              </ul>
            ) : (
              <p>Nenhuma falha identificada.</p>
            )}
          </div>
        </div>
        <div className="avaliacao-note-col">
          <p className="panel-label">Resumo do Atendimento</p>
          <div className="avaliacao-resumo-scroll">
            <p>{resumo || 'Resumo não informado.'}</p>
          </div>
        </div>
      </div>
      <label className="conferencia-comentario">
        Comentário da revisão (opcional)
        <textarea name="comentario" rows={3} />
      </label>
      {erro ? (
        <p className="listagem-erro" role="alert">
          {erro}
        </p>
      ) : null}
      <button type="submit" disabled={enviando || !checklistCompleto}>
        Salvar conferência
      </button>
    </form>
  );
}

export function DetalheAtendimento() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [atendimento, setAtendimento] = useState<AtendimentoDetalhe | null>(null);
  const [erro, setErro] = useState<'nao-encontrado' | 'detalhe' | null>(null);
  const [percurso, setPercurso] = useState<PercursoDaFilaDeManutencao | null>(null);
  const [erroResolucao, setErroResolucao] = useState(false);
  const [resolvendo, setResolvendo] = useState(false);
  const vindoDaFila = searchParams.get('lista') === '/manutencao';
  const operaPercurso = perfil.papel === 'Admin' && vindoDaFila;
  const volta = vindoDaFila ? destinoDaFilaDeManutencao(searchParams) : listaComRecorte(searchParams);

  useEffect(() => {
    if (!id) {
      return;
    }

    const controller = new AbortController();

    buscarAtendimento(id, controller.signal)
      .then((resultado) => {
        if (controller.signal.aborted) {
          return;
        }

        setAtendimento(resultado);
        setErro(resultado ? null : 'detalhe');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setAtendimento(null);
        setErro(
          error instanceof Error && error.message === 'atendimento-nao-encontrado'
            ? 'nao-encontrado'
            : 'detalhe'
        );
      });

    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (!operaPercurso || !id) {
      setPercurso(null);
      return;
    }

    const controller = new AbortController();

    buscarPercursoDaFila(id, searchParams, controller.signal)
      .then((resultado) => {
        if (controller.signal.aborted) {
          return;
        }

        setPercurso(resultado);
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        setPercurso(null);
      });

    return () => controller.abort();
  }, [id, operaPercurso, searchParams]);

  async function resolverPendencia() {
    if (!id || !percurso?.comentarioPendenteId || resolvendo) {
      return;
    }

    setErroResolucao(false);
    setResolvendo(true);

    try {
      const gravado = await marcarComentarioResolvido(percurso.comentarioPendenteId);

      if (!gravado) {
        setErroResolucao(true);
        return;
      }

      const seguinte = await buscarPercursoDaFila(id, searchParams);

      if (!seguinte) {
        setErroResolucao(true);
        return;
      }

      if (seguinte.pendentesNoAtendimento > 0) {
        setPercurso(seguinte);
        const atualizado = await buscarAtendimento(id);

        if (atualizado) {
          setAtendimento(atualizado);
        }

        return;
      }

      navigate(
        proximoDestinoDoPercurso({
          atendimentoAtual: id,
          pendentesNoAtendimento: seguinte.pendentesNoAtendimento,
          proximoAtendimentoId: seguinte.proximoAtendimentoId,
          busca: searchParams
        })
      );
    } catch {
      setErroResolucao(true);
    } finally {
      setResolvendo(false);
    }
  }

  async function baixarAudio() {
    const caminho = atendimento?.downloadDeAudio;

    if (!caminho) {
      return;
    }

    const nomeBase = caminho.split('?')[0].split('/').pop() || 'audio.wav';

    if (/^https?:\/\//i.test(caminho)) {
      const link = document.createElement('a');
      link.href = caminho;
      link.download = nomeBase;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const objeto = await buscarObjetoDaMidia(caminho);

    if (!objeto) {
      return;
    }

    const link = document.createElement('a');
    link.href = objeto;
    link.download = nomeBase;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objeto);
  }

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
          Este Atendimento não foi encontrado.
        </p>
      ) : null}
      {erro === 'detalhe' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar o Atendimento.
        </p>
      ) : null}
      {atendimento ? (
        <>
          <dl className="detalhe-fatos">
            <div>
              <dt>Administradora</dt>
              <dd>
                <BadgeAdministradora
                  administradora={atendimento.administradora}
                  lista={searchParams.get('lista') ?? '/atendimentos'}
                />
              </dd>
            </div>
            <div>
              <dt>Agente de Voz</dt>
              <dd>{atendimento.agente}</dd>
            </div>
            <div>
              <dt>Motivo de Contato</dt>
              <dd>{atendimento.motivo}</dd>
            </div>
            {custoVisivelPara(perfil.papel) && atendimento.custo ? (
              <div>
                <dt>Custo</dt>
                <dd>{atendimento.custo}</dd>
              </div>
            ) : null}
          </dl>
          <ReproducaoDoAtendimento
            caminho={atendimento.audio ?? ''}
            turnos={atendimento.transcricao}
            agente={atendimento.agente}
            iniciadoEm={atendimento.iniciadoEm}
            download={
              downloadVisivelPara(perfil.papel) &&
              atendimento.downloadDeAudio &&
              caminhoDeMidiaPermitido(atendimento.downloadDeAudio) ? (
                <button className="audio-download" type="button" onClick={() => void baixarAudio()}>
                  Download de Áudio
                </button>
              ) : null
            }
          >
          {conferenciaAberta(perfil.papel, atendimento) && atendimento.avaliacaoDaIa ? (
            <FormularioConferencia
              atendimento={{ ...atendimento, avaliacaoDaIa: atendimento.avaliacaoDaIa }}
              onGravada={setAtendimento}
            />
          ) : null}
          {!conferenciaAberta(perfil.papel, atendimento) ? (
          <div
            className={`avaliacao-paineis${atendimento.avaliacaoDoCurador ? '' : ' ia-only'}`}
          >
            {atendimento.avaliacaoDaIa ? (
              <PainelAvaliacao titulo="Avaliação da IA" avaliacao={atendimento.avaliacaoDaIa} />
            ) : null}
            {atendimento.avaliacaoDoCurador ? (
              <PainelAvaliacao
                titulo="Avaliação do Curador"
                avaliacao={atendimento.avaliacaoDoCurador}
              />
            ) : null}
          </div>
          ) : null}
          {operaPercurso && percurso?.comentarioPendenteId ? (
            <div className="percurso-da-fila">
              {percurso.textoPendente &&
              percurso.textoPendente !== atendimento.avaliacaoDoCurador?.comentario ? (
                <p className="listagem-comentario">{percurso.textoPendente}</p>
              ) : null}
              {erroResolucao ? (
                <p className="listagem-erro" role="alert">
                  Não foi possível marcar o Comentário como Resolvido.
                </p>
              ) : null}
              <button
                type="button"
                className="listagem-resolver"
                disabled={resolvendo}
                onClick={() => {
                  void resolverPendencia();
                }}
              >
                Marcar Resolvido
              </button>
            </div>
          ) : null}
          </ReproducaoDoAtendimento>
        </>
      ) : null}
    </div>
  );
}
