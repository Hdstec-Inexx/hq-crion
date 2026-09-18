import {
  camposVisiveisDaListagem,
  limparFiltrosDaQuery,
  type CampoVisivelDaListagem
} from '@hq-crion/contracts/filtros-listagem';
import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { lerSessao } from '../auth/sessao';
import { buscarRegua } from '../regua/api';
import { ComboboxMotivo } from './ComboboxMotivo';
import { MultiselectCriterios } from './MultiselectCriterios';
import { queryAposFiltrar } from './query-apos-filtrar';
import { SliderNotaDaIaAvaliadora } from './SliderNotaDaIaAvaliadora';

export function BarraDeFiltrosDaListagem({
  caminho,
  curadores
}: {
  caminho: string;
  curadores: { id: string; nome: string }[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [criteriosDaRegua, setCriteriosDaRegua] = useState<string[]>([]);
  const campos = camposVisiveisDaListagem(caminho);
  const campoVisivel = (campo: CampoVisivelDaListagem) => campos.includes(campo);
  const inicioNaQuery = searchParams.get('inicio') ?? '';
  const fimNaQuery = searchParams.get('fim') ?? '';
  const [inicioRascunho, setInicioRascunho] = useState(inicioNaQuery);
  const [fimRascunho, setFimRascunho] = useState(fimNaQuery);

  useEffect(() => {
    setInicioRascunho(inicioNaQuery);
    setFimRascunho(fimNaQuery);
  }, [inicioNaQuery, fimNaQuery]);

  useEffect(() => {
    if (!campoVisivel('criterios')) {
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
  }, [caminho]);

  function onFiltrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchParams(queryAposFiltrar(searchParams, new FormData(event.currentTarget)));
  }

  function limparFiltros() {
    setSearchParams(limparFiltrosDaQuery(searchParams));
  }

  return (
    <form className="listagem-filtros listagem-filtros-pulso" onSubmit={onFiltrar}>
      {campoVisivel('periodo') ? (
        <div className="listagem-filtro-periodo">
          <label>
            Data inicial
            <input
              name="inicio"
              type="date"
              value={inicioRascunho}
              onChange={(event) => {
                const proximo = event.target.value;
                setInicioRascunho(proximo);
                if (!proximo) {
                  setFimRascunho('');
                }
              }}
            />
          </label>
          <span aria-hidden="true" className="listagem-filtro-seta">
            →
          </span>
          <label>
            Data final (opcional)
            <input
              name="fim"
              type="date"
              min={inicioRascunho || undefined}
              disabled={!inicioRascunho}
              value={inicioRascunho ? fimRascunho : ''}
              onChange={(event) => setFimRascunho(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      {campoVisivel('statusAtendimento') ? (
        <label>
          Status do Atendimento
          <select
            name="status"
            defaultValue={searchParams.get('status') ?? ''}
            key={`status-${searchParams.get('status') ?? ''}`}
          >
            <option value="">Todos</option>
            <option value="Concluído">Concluído</option>
            <option value="Em andamento">Em andamento</option>
          </select>
        </label>
      ) : null}
      {campoVisivel('notaIa') ? (
        <SliderNotaDaIaAvaliadora notaIaNaQuery={searchParams.get('notaIa') ?? ''} />
      ) : null}
      {campoVisivel('motivo') ? (
        <ComboboxMotivo valorSubmetido={searchParams.get('motivo') ?? ''} />
      ) : null}
      {campoVisivel('conversa') ? (
        <label>
          ID da conversa
          <input
            name="conversa"
            placeholder="Buscar por ID"
            defaultValue={searchParams.get('conversa') ?? ''}
            key={`conversa-${searchParams.get('conversa') ?? ''}`}
          />
        </label>
      ) : null}
      {campoVisivel('criterios') ? (
        <>
          <MultiselectCriterios
            name="criteriosNaoAtendidos"
            rotulo="Critérios Não Atendidos"
            submetido={searchParams.get('criteriosNaoAtendidos') ?? ''}
            opcoes={criteriosDaRegua}
          />
          <MultiselectCriterios
            name="criteriosAtendidos"
            rotulo="Critérios Atendidos"
            submetido={searchParams.get('criteriosAtendidos') ?? ''}
            opcoes={criteriosDaRegua}
          />
        </>
      ) : null}
      {campoVisivel('statusCuradoria') ? (
        <label>
          Status da curadoria
          <select
            name="statusCuradoria"
            defaultValue={searchParams.get('statusCuradoria') ?? ''}
            key={`statusCuradoria-${searchParams.get('statusCuradoria') ?? ''}`}
          >
            <option value="">Todos</option>
            <option value="feita">Feita</option>
            <option value="pendente">Pendente</option>
          </select>
        </label>
      ) : null}
      {campoVisivel('curador') ? (
        <label>
          Curador
          <select
            name="curador"
            defaultValue={searchParams.get('curador') ?? ''}
            key={`curador-${searchParams.get('curador') ?? ''}`}
          >
            <option value="">Todos</option>
            {curadores.map((curador) => (
              <option key={curador.id} value={curador.id}>
                {curador.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="submit">Filtrar</button>
      {campoVisivel('limpar') ? (
        <button type="button" onClick={limparFiltros}>
          Limpar
        </button>
      ) : null}
    </form>
  );
}
