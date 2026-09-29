import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { escreverRecorteNaQuery } from '@hq-crion/contracts/recorte';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { RecorteCascata } from '../recorte/RecorteCascata';
import { useListaAoVivo } from './listaAoVivo';
import { mensagemDaListaAoVivo, textoDaLinhaAoVivo } from './pulso';

function destinoDoDetalhe(id: string, search: string) {
  const params = new URLSearchParams(search);
  params.set('lista', '/monitoramento');
  const qs = params.toString();

  return qs ? `/monitoramento/${id}?${qs}` : `/monitoramento/${id}`;
}

export function MonitoramentoPage() {
  const perfil = useRouteLoaderData('casca') as Perfil;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const chave = searchParams.toString();
  const estado = useListaAoVivo(chave, searchParams);
  const administradoraNaUrl = searchParams.get('administradora') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';

  function atualizarRecorte(administradora: string, agente: string) {
    setSearchParams(escreverRecorteNaQuery(searchParams, administradora, agente), {
      replace: true
    });
  }

  const aviso = estado.status === 'ready' ? mensagemDaListaAoVivo(estado.data) : null;

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
      {estado.status === 'error' && estado.motivo === 'recorte' ? (
        <p className="listagem-erro" role="alert">
          Este Recorte não é um par válido de Administradora e Agente de Voz.
        </p>
      ) : null}
      {estado.status === 'error' && estado.motivo === 'lista' ? (
        <p className="listagem-erro" role="alert">
          Não foi possível carregar {tituloDaPagina(location.pathname, perfil.papel)}.
        </p>
      ) : null}
      {estado.status === 'ready' ? (
        <div className="listagem-painel">
          {aviso ? (
            <p>{aviso}</p>
          ) : (
            estado.data.itens.map((item) => (
              <article className="listagem-linha" key={item.id}>
                <div>
                  <Link
                    className="listagem-link"
                    to={destinoDoDetalhe(item.id, location.search)}
                  >
                    {textoDaLinhaAoVivo(item)}
                  </Link>
                </div>
                {item.administradora ? (
                  <BadgeAdministradora
                    administradora={item.administradora}
                    lista="/monitoramento"
                  />
                ) : null}
              </article>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
