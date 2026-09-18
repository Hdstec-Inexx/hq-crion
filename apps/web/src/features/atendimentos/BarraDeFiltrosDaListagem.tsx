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
  const mostra = (campo: CampoVisivelDaListagem) => campos.includes(campo);
  const periodoSubmetido = Boolean(searchParams.get('inicio') && searchParams.get('fim'));

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

  function onFiltrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchParams(queryAposFiltrar(searchParams, new FormData(event.currentTarget)));
  }

  function limparFiltros() {
    setSearchParams(limparFiltrosDaQuery(searchParams));
  }

  return (
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
          {curadores.map((curador) => (
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
  );
}
