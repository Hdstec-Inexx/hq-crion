import { tituloDaPagina } from '@hq-crion/contracts/casca';
import {
  categoriasDeCausaCancelamento,
  type PainelDeCancelamentosResponse,
  type PesquisaIaCancelamentoResponse
} from '@hq-crion/contracts/cancelamento';
import type { Administradora } from '@hq-crion/contracts/recorte';
import type { Perfil } from '@hq-crion/contracts/perfil';
import {
  escreverRecorteNaQuery,
  periodoAteHoje,
  periodoDoDashboard
} from '@hq-crion/contracts/recorte';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { RecorteCascata } from '../recorte/RecorteCascata';
import { PaginacaoCompacta } from '../atendimentos/PaginacaoCompacta';
import {
  analisarPassivoDeCancelamentos,
  buscarPainelDeCancelamentos,
  pesquisarCancelamentosComIa
} from './api';

const SUGESTOES_IA = [
  'Quem cancelou e foi para a Hapvida?',
  'O problema do cancelamento é venda mal feita?',
  'Qual o padrão dos cancelamentos no período?'
] as const;

const ITENS_POR_PAGINA = 20;
const EVIDENCIAS_POR_PAGINA = 4;

function formatarPercentual(valor: number) {
  return `${Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',')}%`;
}

function formatarQuando(iso: string) {
  try {
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
  } catch {
    return iso;
  }
}

function destinoDoDetalhe(id: string, search: string, lista: string) {
  const params = new URLSearchParams(search);
  params.set('lista', lista);
  const qs = params.toString();

  return qs ? `/atendimentos/${id}?${qs}` : `/atendimentos/${id}`;
}

function parseAdministradora(valor: string | null): Administradora | undefined {
  if (valor === 'Affix' || valor === 'Alter' || valor === 'Conectaplan') {
    return valor;
  }
  return undefined;
}

function renderizarTrechoComNegrito(texto: string) {
  const partes = texto.split(/(\*\*.*?\*\*)/g);
  return partes.map((parte, idx) => {
    if (parte.startsWith('**') && parte.endsWith('**')) {
      return <strong key={idx}>{parte.slice(2, -2)}</strong>;
    }
    return parte;
  });
}

function RespostaExecutivaFormatada({ texto }: { texto: string }) {
  const blocos = texto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  return (
    <div className="cancelamentos-ia-resposta-texto">
      {blocos.map((bloco, idx) => {
        const linhas = bloco.split('\n').map((l) => l.trim()).filter(Boolean);
        const temLinhasTopicos = linhas.some(
          (l) => l.startsWith('- ') || l.startsWith('* ') || l.startsWith('• ')
        );

        if (temLinhasTopicos) {
          const elementos: React.ReactNode[] = [];
          const bufferTopicos: string[] = [];

          const descarregarBuffer = () => {
            if (bufferTopicos.length > 0) {
              elementos.push(
                <ul key={`ul-${elementos.length}`}>
                  {bufferTopicos.map((topico, tIdx) => (
                    <li key={tIdx}>{renderizarTrechoComNegrito(topico)}</li>
                  ))}
                </ul>
              );
              bufferTopicos.length = 0;
            }
          };

          for (const linha of linhas) {
            if (linha.startsWith('- ') || linha.startsWith('* ') || linha.startsWith('• ')) {
              bufferTopicos.push(linha.replace(/^[-*•]\s*/, ''));
            } else {
              descarregarBuffer();
              elementos.push(
                <p key={`p-${elementos.length}`}>{renderizarTrechoComNegrito(linha)}</p>
              );
            }
          }
          descarregarBuffer();

          return <div key={idx}>{elementos}</div>;
        }

        return <p key={idx}>{renderizarTrechoComNegrito(bloco)}</p>;
      })}
    </div>
  );
}

export function CancelamentosPage() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [painel, setPainel] = useState<PainelDeCancelamentosResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [atualizacaoManual, setAtualizacaoManual] = useState(0);
  const [erro, setErro] = useState<
    'recorte-invalido' | 'periodo-invalido' | 'painel' | null
  >(null);

  // Filtros de cabeçalho
  const administradoraNaUrl = searchParams.get('administradora') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';
  const inicioInformado = searchParams.get('inicio') ?? '';
  const fimInformado = searchParams.get('fim') ?? '';
  const periodoResolvido = periodoDoDashboard({
    inicio: inicioInformado,
    fim: fimInformado
  });
  const inicioCampo = periodoResolvido?.inicio ?? inicioInformado;
  const fimCampo = periodoResolvido?.fim ?? fimInformado;
  const [inicioRascunho, setInicioRascunho] = useState(inicioCampo);
  const [fimRascunho, setFimRascunho] = useState(fimCampo);

  // Filtros da listagem / gráficos
  const causaNaUrl = searchParams.get('causa') ?? '';
  const vendaMalFeitaNaUrl = searchParams.get('vendaMalFeita') ?? 'todos';
  const concorrenteNaUrl = searchParams.get('concorrente') ?? '';
  const buscaNaUrl = searchParams.get('busca') ?? '';

  // Rascunhos de input textual com debounce
  const [concorrenteRascunho, setConcorrenteRascunho] = useState(concorrenteNaUrl);
  const [buscaRascunho, setBuscaRascunho] = useState(buscaNaUrl);

  // Paginação local da listagem
  const [paginaAtual, setPaginaAtual] = useState(1);

  // Estado da Pesquisa por IA
  const [perguntaIa, setPerguntaIa] = useState('');
  const [pesquisandoIa, setPesquisandoIa] = useState(false);
  const [resultadoIa, setResultadoIa] =
    useState<PesquisaIaCancelamentoResponse | null>(null);
  const [erroIa, setErroIa] = useState<string | null>(null);
  const [paginaEvidencias, setPaginaEvidencias] = useState(1);

  // Estado de Analisar Passivo
  const [analisandoPassivo, setAnalisandoPassivo] = useState(false);
  const [feedbackPassivo, setFeedbackPassivo] = useState<string | null>(null);
  const [erroPassivo, setErroPassivo] = useState<string | null>(null);

  useEffect(() => {
    setInicioRascunho(inicioCampo);
    setFimRascunho(fimCampo);
  }, [inicioCampo, fimCampo]);

  useEffect(() => {
    setConcorrenteRascunho(concorrenteNaUrl);
  }, [concorrenteNaUrl]);

  useEffect(() => {
    setBuscaRascunho(buscaNaUrl);
  }, [buscaNaUrl]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [causaNaUrl, vendaMalFeitaNaUrl, concorrenteNaUrl, buscaNaUrl]);

  // Debounce para inputs textuais de busca e concorrente
  useEffect(() => {
    const timer = setTimeout(() => {
      const concAtual = (searchParams.get('concorrente') ?? '').trim();
      const buscaAtual = (searchParams.get('busca') ?? '').trim();
      const novoConc = concorrenteRascunho.trim();
      const novaBusca = buscaRascunho.trim();

      if (novoConc !== concAtual || novaBusca !== buscaAtual) {
        const proxima = new URLSearchParams(searchParams);
        if (novoConc) {
          proxima.set('concorrente', novoConc);
        } else {
          proxima.delete('concorrente');
        }

        if (novaBusca) {
          proxima.set('busca', novaBusca);
        } else {
          proxima.delete('busca');
        }

        setSearchParams(proxima, { replace: true });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [concorrenteRascunho, buscaRascunho, searchParams, setSearchParams]);

  // Carrega os dados do painel sempre que a query mudar ou após ação de passivo
  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true);

    const paramsConsulta = new URLSearchParams(searchParams);
    if (!paramsConsulta.has('inicio') && inicioCampo) {
      paramsConsulta.set('inicio', inicioCampo);
    }
    if (!paramsConsulta.has('fim') && fimCampo) {
      paramsConsulta.set('fim', fimCampo);
    }

    buscarPainelDeCancelamentos(paramsConsulta, controller.signal)
      .then((resultado) => {
        if (controller.signal.aborted) {
          return;
        }

        setPainel(resultado);
        setErro(resultado ? null : 'painel');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setPainel(null);
        setErro(
          error instanceof Error && error.message === 'recorte-invalido'
            ? 'recorte-invalido'
            : error instanceof Error && error.message === 'periodo-invalido'
              ? 'periodo-invalido'
              : 'painel'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCarregando(false);
        }
      });

    return () => controller.abort();
  }, [searchParams, atualizacaoManual, inicioCampo, fimCampo]);

  function atualizarRecorte(administradora: string, agente: string) {
    setSearchParams(
      escreverRecorteNaQuery(searchParams, administradora, agente),
      { replace: true }
    );
  }

  function onFiltrarPeriodo(event: FormEvent<HTMLFormElement>) {
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

  function atualizarFiltro(chave: string, valor: string) {
    const proxima = new URLSearchParams(searchParams);
    const limpo = valor.trim();

    if (limpo && limpo !== 'todos') {
      proxima.set(chave, limpo);
    } else {
      proxima.delete(chave);
    }

    setSearchParams(proxima, { replace: true });
  }

  function alternarFiltroCausa(causa: string) {
    if (causaNaUrl === causa) {
      atualizarFiltro('causa', '');
    } else {
      atualizarFiltro('causa', causa);
    }
  }

  function alternarFiltroConcorrente(concorrente: string) {
    if (concorrenteNaUrl.toLowerCase() === concorrente.toLowerCase()) {
      atualizarFiltro('concorrente', '');
    } else {
      atualizarFiltro('concorrente', concorrente);
    }
  }

  function limparFiltrosListagem() {
    const proxima = new URLSearchParams(searchParams);
    proxima.delete('causa');
    proxima.delete('vendaMalFeita');
    proxima.delete('concorrente');
    proxima.delete('busca');
    setConcorrenteRascunho('');
    setBuscaRascunho('');
    setSearchParams(proxima, { replace: true });
  }

  const temFiltroListagemAtivo = Boolean(
    causaNaUrl ||
      (vendaMalFeitaNaUrl && vendaMalFeitaNaUrl !== 'todos') ||
      concorrenteNaUrl ||
      buscaNaUrl
  );

  async function dispararPesquisaIa(perguntaTexto: string) {
    const limpa = perguntaTexto.trim();
    if (!limpa) return;

    setPesquisandoIa(true);
    setErroIa(null);
    setPaginaEvidencias(1);

    try {
      const resp = await pesquisarCancelamentosComIa({
        pergunta: limpa,
        administradora: parseAdministradora(administradoraNaUrl),
        agente: agenteNaUrl || undefined,
        inicio: inicioCampo || undefined,
        fim: fimCampo || undefined
      });
      setResultadoIa(resp);
      setPaginaEvidencias(1);
    } catch (err) {
      setErroIa(
        err instanceof Error ? err.message : 'Não foi possível consultar a IA.'
      );
    } finally {
      setPesquisandoIa(false);
    }
  }

  function onSubmitPesquisaIa(e: FormEvent) {
    e.preventDefault();
    dispararPesquisaIa(perguntaIa);
  }

  function aoClicarSugestao(sugestao: string) {
    setPerguntaIa(sugestao);
    dispararPesquisaIa(sugestao);
  }

  async function dispararAnalisePassivo() {
    setAnalisandoPassivo(true);
    setFeedbackPassivo(null);
    setErroPassivo(null);

    try {
      const resp = await analisarPassivoDeCancelamentos({
        administradora: parseAdministradora(administradoraNaUrl),
        agente: agenteNaUrl || undefined,
        inicio: inicioCampo || undefined,
        fim: fimCampo || undefined
      });
      setFeedbackPassivo(
        `Análise concluída: ${resp.analisados} atendimento(s) avaliado(s) e ${resp.cancelamentosDetectados} cancelamento(s) identificado(s) (${resp.modelo} · ${resp.fonte}).`
      );
      setAtualizacaoManual((t) => t + 1);
    } catch (err) {
      setErroPassivo(
        err instanceof Error
          ? err.message
          : 'Não foi possível analisar o passivo de cancelamentos.'
      );
    } finally {
      setAnalisandoPassivo(false);
    }
  }

  // Itens paginados
  const totalItens = painel?.itens.length ?? 0;
  const totalPaginas = Math.ceil(totalItens / ITENS_POR_PAGINA);
  const indiceInicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const itensPaginados = (painel?.itens ?? []).slice(
    indiceInicio,
    indiceInicio + ITENS_POR_PAGINA
  );

  return (
    <div className="dashboard-pagina cancelamentos-pagina">
      {/* Cabeçalho */}
      <div className="pagina-head">
        <h1>{tituloDaPagina(location.pathname, perfil.papel)}</h1>
        <RecorteCascata
          administradora={administradoraNaUrl}
          agente={agenteNaUrl}
          onChange={atualizarRecorte}
        />
      </div>

      {/* Seletor de Período idêntico ao Dashboard */}
      <form className="dashboard-periodo" onSubmit={onFiltrarPeriodo}>
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

      {/* Mensagens de erro */}
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
      {erro === 'painel' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar o Diagnóstico de Cancelamentos.
        </p>
      ) : null}

      {painel ? (
        <>
          {/* BLOCO 1 — KPIs */}
          <section
            className="dashboard-kpis cancelamentos-kpis"
            aria-label="Indicadores de Cancelamento"
          >
            <div className="dashboard-kpi">
              <small>Cancelamentos Identificados</small>
              <strong>{painel.kpis.totalCancelamentos}</strong>
              <em>
                {formatarPercentual(painel.kpis.percentualCancelamentos)} dos atendimentos ({painel.kpis.totalAtendimentos})
              </em>
            </div>

            <div className="dashboard-kpi">
              <small>Venda Mal Feita</small>
              <strong>{painel.kpis.totalVendaMalFeita}</strong>
              <em>
                {formatarPercentual(painel.kpis.percentualVendaMalFeita)} dos cancelamentos
              </em>
            </div>

            <div className="dashboard-kpi">
              <small>Migração para Concorrente</small>
              <strong>{painel.kpis.totalConcorrencia}</strong>
              <em>
                {painel.kpis.principalConcorrente
                  ? `Principal: ${painel.kpis.principalConcorrente}`
                  : 'Nenhum concorrente citado'}
              </em>
            </div>
          </section>

          {/* BLOCO 2 — Gráficos Interativos */}
          <section
            className="dashboard-paineis cancelamentos-graficos-grid"
            aria-label="Gráficos de Causas e Concorrentes"
          >
            {/* Painel Causas de Cancelamento */}
            <article className="dashboard-painel cancelamentos-painel-causas">
              <header className="cancelamentos-painel-header">
                <h2>Causas de Cancelamento</h2>
                {causaNaUrl ? (
                  <button
                    type="button"
                    className="cancelamentos-tag-limpar"
                    onClick={() => atualizarFiltro('causa', '')}
                    title="Remover filtro de causa"
                  >
                    Filtro: {causaNaUrl} &times;
                  </button>
                ) : null}
              </header>

              {painel.porCausa.length === 0 ? (
                <p className="dashboard-vazio">Nenhum cancelamento no período.</p>
              ) : (
                <ul className="cancelamentos-barras">
                  {painel.porCausa.map((item) => {
                    const isAtivo = causaNaUrl === item.causa;
                    return (
                      <li key={item.causa}>
                        <button
                          type="button"
                          className={`cancelamentos-barra-btn ${isAtivo ? 'is-ativo' : ''}`}
                          onClick={() => alternarFiltroCausa(item.causa)}
                          aria-pressed={isAtivo}
                        >
                          <div className="dashboard-barra-rotulo">
                            <span>{item.causa}</span>
                            <strong>
                              {item.quantidade} ({formatarPercentual(item.percentual)})
                            </strong>
                          </div>
                          <div className="dashboard-barra-trilho">
                            <span style={{ width: `${Math.min(100, item.percentual)}%` }} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>

            {/* Painel Concorrentes Citados */}
            <article className="dashboard-painel cancelamentos-painel-concorrentes">
              <header className="cancelamentos-painel-header">
                <h2>Concorrentes Citados</h2>
                {concorrenteNaUrl ? (
                  <button
                    type="button"
                    className="cancelamentos-tag-limpar"
                    onClick={() => atualizarFiltro('concorrente', '')}
                    title="Remover filtro de concorrente"
                  >
                    Filtro: {concorrenteNaUrl} &times;
                  </button>
                ) : null}
              </header>

              {painel.porConcorrente.length === 0 ? (
                <p className="dashboard-vazio">Nenhum concorrente citado no período.</p>
              ) : (
                <ul className="cancelamentos-ranking-concorrentes">
                  {painel.porConcorrente.map((item, idx) => {
                    const isAtivo =
                      concorrenteNaUrl.toLowerCase() === item.concorrente.toLowerCase();
                    return (
                      <li key={item.concorrente}>
                        <button
                          type="button"
                          className={`cancelamentos-concorrente-btn ${isAtivo ? 'is-ativo' : ''}`}
                          onClick={() => alternarFiltroConcorrente(item.concorrente)}
                          aria-pressed={isAtivo}
                        >
                          <span className="cancelamentos-concorrente-posicao">#{idx + 1}</span>
                          <div className="cancelamentos-concorrente-info">
                            <strong>{item.concorrente}</strong>
                            {item.vendaMalFeitaCount > 0 ? (
                              <span className="cancelamentos-badge-venda">
                                {item.vendaMalFeitaCount} com venda mal feita
                              </span>
                            ) : null}
                          </div>
                          <span className="cancelamentos-concorrente-qtd">
                            <strong>{item.quantidade}</strong> atendimento(s)
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          </section>

          {/* BLOCO 3 — Pesquisa por IA */}
          <section className="cancelamentos-ia-secao" aria-label="Pesquisa por IA">
            <div className="cancelamentos-ia-card">
              <div className="cancelamentos-ia-header">
                <div>
                  <h2>Pesquisa por IA sobre Cancelamentos</h2>
                  <p className="cancelamentos-ia-subtitulo">
                    Consulte perguntas em linguagem natural para diagnosticar o padrão de cancelamentos do período.
                  </p>
                </div>

                {perfil.papel === 'Admin' ? (
                  <button
                    type="button"
                    className="cancelamentos-btn-passivo"
                    onClick={dispararAnalisePassivo}
                    disabled={analisandoPassivo}
                  >
                    {analisandoPassivo ? 'Analisando passivo...' : 'Analisar passivo com IA'}
                  </button>
                ) : null}
              </div>

              {feedbackPassivo ? (
                <div className="cancelamentos-feedback-sucesso" role="status">
                  {feedbackPassivo}
                </div>
              ) : null}

              {erroPassivo ? (
                <div className="cancelamentos-feedback-erro" role="alert">
                  {erroPassivo}
                </div>
              ) : null}

              {/* Sugestões rápidas */}
              <div className="cancelamentos-chips-container">
                <span className="cancelamentos-chips-titulo">Sugestões rápidas:</span>
                <div className="cancelamentos-chips-lista">
                  {SUGESTOES_IA.map((sugestao) => (
                    <button
                      key={sugestao}
                      type="button"
                      className="cancelamentos-chip-btn"
                      onClick={() => aoClicarSugestao(sugestao)}
                    >
                      {sugestao}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formulário de Pergunta */}
              <form className="cancelamentos-ia-form" onSubmit={onSubmitPesquisaIa}>
                <input
                  type="text"
                  className="cancelamentos-ia-input"
                  placeholder="Faça uma pergunta sobre os cancelamentos..."
                  value={perguntaIa}
                  onChange={(e) => setPerguntaIa(e.target.value)}
                  disabled={pesquisandoIa}
                />
                <button
                  type="submit"
                  className="cancelamentos-ia-submit"
                  disabled={pesquisandoIa || !perguntaIa.trim()}
                >
                  {pesquisandoIa ? 'Consultando...' : 'Pesquisar com IA'}
                </button>
              </form>

              {erroIa ? (
                <div className="cancelamentos-feedback-erro" role="alert">
                  {erroIa}
                </div>
              ) : null}

              {/* Exibição da Resposta Executiva e Evidências */}
              {resultadoIa ? (
                <div className="cancelamentos-ia-resultado">
                  <div className="cancelamentos-ia-resposta-box">
                    <div className="cancelamentos-ia-resposta-topo">
                      <h3>Resposta Executiva</h3>
                      <span className="cancelamentos-badge-modelo">
                        {resultadoIa.modelo} · {resultadoIa.fonte}
                      </span>
                    </div>
                    <RespostaExecutivaFormatada texto={resultadoIa.resposta} />
                  </div>

                  {resultadoIa.evidencias.length > 0 ? (
                    <div className="cancelamentos-evidencias-bloco">
                      <h4>Evidências Citadas ({resultadoIa.evidencias.length})</h4>
                      {(() => {
                        const totalEvidencias = resultadoIa.evidencias.length;
                        const totalPaginasEvidencias = Math.ceil(
                          totalEvidencias / EVIDENCIAS_POR_PAGINA
                        );
                        const paginaAtualNormalizada = Math.min(
                          Math.max(1, paginaEvidencias),
                          Math.max(1, totalPaginasEvidencias)
                        );
                        const inicioEv = (paginaAtualNormalizada - 1) * EVIDENCIAS_POR_PAGINA;
                        const evidenciasPaginadas = resultadoIa.evidencias.slice(
                          inicioEv,
                          inicioEv + EVIDENCIAS_POR_PAGINA
                        );

                        return (
                          <>
                            <div className="cancelamentos-evidencias-grid">
                              {evidenciasPaginadas.map((evidencia) => (
                                <Link
                                  key={evidencia.id}
                                  to={destinoDoDetalhe(
                                    evidencia.id,
                                    location.search,
                                    '/cancelamentos'
                                  )}
                                  className="cancelamentos-evidencia-card"
                                >
                                  <div className="cancelamentos-evidencia-cabecalho">
                                    <strong title={`Atendimento #${evidencia.id}`}>
                                      Atendimento #{evidencia.id}
                                    </strong>
                                    {evidencia.administradora ? (
                                      <span className="cancelamentos-badge-adm">
                                        {evidencia.administradora}
                                      </span>
                                    ) : null}
                                  </div>

                                  {evidencia.motivo ? (
                                    <p className="cancelamentos-evidencia-motivo">
                                      <strong>Motivo:</strong> {evidencia.motivo}
                                    </p>
                                  ) : null}

                                  <div className="cancelamentos-evidencia-tags">
                                    {evidencia.categoriaCausa ? (
                                      <span className="cancelamentos-tag-pequena">
                                        {evidencia.categoriaCausa}
                                      </span>
                                    ) : null}
                                    {evidencia.concorrenteCitado ? (
                                      <span className="cancelamentos-tag-pequena is-concorrente">
                                        {evidencia.concorrenteCitado}
                                      </span>
                                    ) : null}
                                    {evidencia.vendaMalFeita ? (
                                      <span className="cancelamentos-tag-pequena is-venda">
                                        Venda mal feita
                                      </span>
                                    ) : null}
                                  </div>

                                  {evidencia.trecho ? (
                                    <blockquote className="cancelamentos-evidencia-citacao">
                                      &ldquo;{evidencia.trecho}&rdquo;
                                    </blockquote>
                                  ) : null}

                                  {evidencia.diagnostico ? (
                                    <p className="cancelamentos-evidencia-diag">
                                      {evidencia.diagnostico}
                                    </p>
                                  ) : null}
                                </Link>
                              ))}
                            </div>

                            {totalPaginasEvidencias > 1 ? (
                              <PaginacaoCompacta
                                pagina={paginaAtualNormalizada}
                                totalPaginas={totalPaginasEvidencias}
                                irPara={setPaginaEvidencias}
                              />
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          {/* BLOCO 4 — Listagem Filtrável de Atendimentos de Cancelamento */}
          <section
            className="cancelamentos-listagem-secao"
            aria-label="Listagem de Cancelamentos"
          >
            <header className="cancelamentos-listagem-header">
              <h2>Atendimentos de Cancelamento ({painel.itens.length})</h2>
            </header>

            {/* Barra de Filtros da Listagem */}
            <div className="cancelamentos-filtros-barra">
              <label>
                Causa
                <select
                  value={causaNaUrl}
                  onChange={(e) => atualizarFiltro('causa', e.target.value)}
                >
                  <option value="">Todas as causas</option>
                  {categoriasDeCausaCancelamento.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Venda Mal Feita
                <select
                  value={vendaMalFeitaNaUrl}
                  onChange={(e) => atualizarFiltro('vendaMalFeita', e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>

              <label>
                Concorrente
                <input
                  type="text"
                  placeholder="Ex: Hapvida..."
                  value={concorrenteRascunho}
                  onChange={(e) => setConcorrenteRascunho(e.target.value)}
                />
              </label>

              <label>
                Busca textual
                <input
                  type="search"
                  placeholder="ID do atendimento, motivo, diagnóstico..."
                  value={buscaRascunho}
                  onChange={(e) => setBuscaRascunho(e.target.value)}
                />
              </label>

              {temFiltroListagemAtivo ? (
                <button
                  type="button"
                  className="cancelamentos-btn-limpar-filtros"
                  onClick={limparFiltrosListagem}
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>

            {/* Tabela de Atendimentos */}
            {painel.itens.length === 0 ? (
              <div className="cancelamentos-vazio-card">
                <p>Nenhum atendimento de cancelamento encontrado com os filtros aplicados.</p>
              </div>
            ) : (
              <>
                <div className="cancelamentos-tabela-container">
                  <table className="cancelamentos-tabela">
                    <thead>
                      <tr>
                        <th>Administradora</th>
                        <th>Agente de Voz</th>
                        <th>Data</th>
                        <th>Motivo original</th>
                        <th>Causa Raiz</th>
                        <th>Alertas</th>
                        <th>Diagnóstico</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensPaginados.map((item) => (
                        <tr key={item.id} className="cancelamentos-tabela-linha">
                          <td>
                            <BadgeAdministradora
                              administradora={item.administradora}
                              lista="/cancelamentos"
                            />
                          </td>
                          <td className="cancelamentos-col-agente">{item.agente}</td>
                          <td className="cancelamentos-col-data">
                            {formatarQuando(item.iniciadoEm)}
                          </td>
                          <td className="cancelamentos-col-motivo">{item.motivo}</td>
                          <td className="cancelamentos-col-causa">
                            <span className="cancelamentos-tag-causa">
                              {item.diagnosticoCancelamento.categoriaCausa ?? 'Não classificada'}
                            </span>
                          </td>
                          <td className="cancelamentos-col-alertas">
                            <div className="cancelamentos-alertas-flex">
                              {item.diagnosticoCancelamento.vendaMalFeita ? (
                                <span className="cancelamentos-badge-alerta-venda">
                                  Venda mal feita
                                </span>
                              ) : null}
                              {item.diagnosticoCancelamento.concorrenteCitado ? (
                                <span className="cancelamentos-badge-alerta-concorrente">
                                  {item.diagnosticoCancelamento.concorrenteCitado}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="cancelamentos-col-diagnostico">
                            <p className="cancelamentos-diagnostico-resumo">
                              {item.diagnosticoCancelamento.diagnostico ?? 'Sem diagnóstico.'}
                            </p>
                          </td>
                          <td className="cancelamentos-col-acoes">
                            <Link
                              to={destinoDoDetalhe(
                                item.id,
                                location.search,
                                '/cancelamentos'
                              )}
                              className="cancelamentos-btn-abrir"
                            >
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPaginas > 1 ? (
                  <PaginacaoCompacta
                    pagina={paginaAtual}
                    totalPaginas={totalPaginas}
                    irPara={setPaginaAtual}
                  />
                ) : null}
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
