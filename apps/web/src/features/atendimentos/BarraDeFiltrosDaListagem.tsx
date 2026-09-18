import {
  camposVisiveisDaListagem,
  limparFiltrosDaQuery,
  motivosDeContato,
  type CampoVisivelDaListagem
} from '@hq-crion/contracts/filtros-listagem';
import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { lerSessao } from '../auth/sessao';
import { buscarRegua } from '../regua/api';
import { queryAposFiltrar } from './query-apos-filtrar';
import { SliderNotaDaIaAvaliadora } from './SliderNotaDaIaAvaliadora';

function SelectCriterios({
  name,
  rotulo,
  submetido,
  opcoes
}: {
  name: 'criteriosAtendidos' | 'criteriosNaoAtendidos';
  rotulo: string;
  submetido: string;
  opcoes: string[];
}) {
  return (
    <select
      name={name}
      multiple
      aria-label={rotulo}
      defaultValue={submetido.split(',').filter(Boolean)}
      key={`${name}-${submetido}`}
    >
      {opcoes.map((nome) => (
        <option key={nome} value={nome}>
          {nome}
        </option>
      ))}
    </select>
  );
}

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
  const periodoSubmetido = Boolean(searchParams.get('inicio') && searchParams.get('fim'));

  useEffect(() => {
    if (!camposVisiveisDaListagem(caminho).includes('criterios')) {
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
    <form className="listagem-filtros" onSubmit={onFiltrar}>
      {campoVisivel('periodo') ? (
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
      {campoVisivel('statusAtendimento') ? (
        <select name="status" defaultValue={searchParams.get('status') ?? ''} aria-label="Status do Atendimento">
          <option value="">Status do Atendimento</option>
          <option value="Concluído">Concluído</option>
          <option value="Em andamento">Em andamento</option>
        </select>
      ) : null}
      {campoVisivel('notaIa') ? (
        <SliderNotaDaIaAvaliadora notaIaNaQuery={searchParams.get('notaIa') ?? ''} />
      ) : null}
      {campoVisivel('motivo') ? (
        <select name="motivo" defaultValue={searchParams.get('motivo') ?? ''} aria-label="Motivo">
          <option value="">Motivo</option>
          {motivosDeContato.map((motivo) => (
            <option key={motivo} value={motivo}>
              {motivo}
            </option>
          ))}
        </select>
      ) : null}
      {campoVisivel('conversa') ? (
        <input
          name="conversa"
          placeholder="Id da conversa"
          aria-label="Id da conversa"
          defaultValue={searchParams.get('conversa') ?? ''}
        />
      ) : null}
      {campoVisivel('criterios') ? (
        <>
          <SelectCriterios
            name="criteriosAtendidos"
            rotulo="Critérios atendidos"
            submetido={searchParams.get('criteriosAtendidos') ?? ''}
            opcoes={criteriosDaRegua}
          />
          <SelectCriterios
            name="criteriosNaoAtendidos"
            rotulo="Critérios não atendidos"
            submetido={searchParams.get('criteriosNaoAtendidos') ?? ''}
            opcoes={criteriosDaRegua}
          />
        </>
      ) : null}
      {campoVisivel('statusCuradoria') ? (
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
      {campoVisivel('curador') ? (
        <select name="curador" defaultValue={searchParams.get('curador') ?? ''} aria-label="Curador">
          <option value="">Curador</option>
          {curadores.map((curador) => (
            <option key={curador.id} value={curador.id}>
              {curador.nome}
            </option>
          ))}
        </select>
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
