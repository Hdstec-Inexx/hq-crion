import { tituloDaPagina } from '@hq-crion/contracts/casca';
import { custoVisivelPara, type ListagemResponse } from '@hq-crion/contracts/atendimento';
import { formatarCpf } from '@hq-crion/contracts/cpf';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { escreverRecorteNaQuery } from '@hq-crion/contracts/recorte';
import { useEffect, useState } from 'react';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { RecorteCascata } from '../recorte/RecorteCascata';
import {
  deveAbrirAtendimentoPeloClique,
  deveAbrirAtendimentoPeloTeclado,
  useNavegacaoLinha
} from './acaoLinhaListagem';
import { buscarAtendimentos } from './api';
import { BarraDeFiltrosDaListagem } from './BarraDeFiltrosDaListagem';
import { BadgeFavoritos } from './BadgeFavoritos';
import { BotaoFavorito } from './BotaoFavorito';
import { PaginacaoCompacta } from './PaginacaoCompacta';
import { formatarQuando } from './formatar-quando';

function formatarNota(nota: number) {
  return nota.toFixed(1).replace('.', ',');
}

const semCuradores: { id: string; nome: string }[] = [];
const semMotivos: string[] = [];

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
  const navigate = useNavegacaoLinha();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listagem, setListagem] = useState<ListagemResponse | null>(null);
  const [erro, setErro] = useState<'recorte-invalido' | 'periodo-invalido' | 'listagem' | null>(
    null
  );

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
            : error instanceof Error && error.message === 'periodo-invalido'
              ? 'periodo-invalido'
              : 'listagem'
        );
      });

    return () => controller.abort();
  }, [searchParams, caminho]);

  function atualizarRecorte(administradora: string, agente: string) {
    setSearchParams(escreverRecorteNaQuery(searchParams, administradora, agente, {
      resetarPagina: true
    }), { replace: true });
  }

  function irPara(pagina: number) {
    const proxima = new URLSearchParams(searchParams);
    proxima.set('pagina', String(pagina));
    setSearchParams(proxima);
  }

  function alternarFavorito(id: string, novoEstado: boolean) {
    setListagem((atual) => {
      if (!atual) {
        return atual;
      }
      return {
        ...atual,
        itens: atual.itens.map((it) =>
          it.id === id ? { ...it, favoritadoPeloUsuario: novoEstado } : it
        )
      };
    });
  }

  function abrirAtendimento(id: string) {
    navigate(destinoDoDetalhe(id, location.search, location.pathname));
  }

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
      <BarraDeFiltrosDaListagem
        caminho={caminho}
        curadores={listagem?.curadores ?? semCuradores}
        motivos={listagem?.motivos ?? semMotivos}
        papel={perfil.papel}
      />
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
                <article
                  className="listagem-linha"
                  key={item.id}
                  tabIndex={0}
                  aria-label={`Abrir detalhes do atendimento ${item.id}`}
                  onClick={(e) => {
                    const selecao = window.getSelection?.();
                    const temSelecao = Boolean(
                      selecao && selecao.toString().trim().length > 0
                    );
                    if (!deveAbrirAtendimentoPeloClique(e.target, temSelecao)) {
                      return;
                    }
                    abrirAtendimento(item.id);
                  }}
                  onKeyDown={(e) => {
                    if (!deveAbrirAtendimentoPeloTeclado(e)) {
                      return;
                    }
                    if (e.key === ' ' || e.key === 'Spacebar') {
                      e.preventDefault();
                    }
                    abrirAtendimento(item.id);
                  }}
                >
                  <div>
                    <Link
                      className="listagem-link"
                      to={destinoDoDetalhe(item.id, location.search, location.pathname)}
                    >
                      {item.agente} · {formatarQuando(item.iniciadoEm)}
                    </Link>
                    <div className="listagem-meta">
                      {item.motivo} · {item.status}
                      {item.cpf ? ` · CPF: ${formatarCpf(item.cpf)}` : ''}
                      {custoVisivelPara(perfil.papel) && item.custo ? ` · ${item.custo}` : ''}
                      {item.curadoria && item.curadaEm ? ` · Data da Curadoria: ${formatarQuando(item.curadaEm)}` : ''}
                    </div>
                  </div>
                  <BadgeAdministradora
                    administradora={item.administradora}
                    lista={location.pathname}
                  />
                  {perfil.papel === 'Curador' ? (
                    <BotaoFavorito
                      atendimentoId={item.id}
                      favoritado={item.favoritadoPeloUsuario ?? false}
                      onToggle={(novo) => alternarFavorito(item.id, novo)}
                    />
                  ) : (
                    <BadgeFavoritos
                      count={item.favoritosCount}
                      perfis={item.favoritosPerfis}
                    />
                  )}
                  <div className="listagem-notas">
                    <span className="listagem-nota">IA: {formatarNota(item.notaIa)}</span>
                    {item.curadoria && item.notaCurador !== null && item.notaCurador !== undefined ? (
                      <span className="listagem-nota">Curador: {formatarNota(item.notaCurador)}</span>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
          {listagem.total > listagem.tamanho ? (
            <PaginacaoCompacta
              pagina={listagem.pagina}
              totalPaginas={Math.ceil(listagem.total / listagem.tamanho)}
              irPara={irPara}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
