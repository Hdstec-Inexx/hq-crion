import { tituloDaPagina } from '@hq-crion/contracts/casca';
import type { Perfil } from '@hq-crion/contracts/perfil';
import { escreverRecorteNaQuery } from '@hq-crion/contracts/recorte';
import { Link, useLocation, useRouteLoaderData, useSearchParams } from 'react-router-dom';
import { BadgeAdministradora } from '../recorte/BadgeAdministradora';
import { RecorteCascata } from '../recorte/RecorteCascata';
import { useListaAoVivo } from './listaAoVivo';
import { mensagemDaListaAoVivo } from './pulso';

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
  const { lista: listagem, erro } = useListaAoVivo(chave, searchParams);
  const administradoraNaUrl = searchParams.get('administradora') ?? '';
  const agenteNaUrl = searchParams.get('agente') ?? '';

  function atualizarRecorte(administradora: string, agente: string) {
    setSearchParams(escreverRecorteNaQuery(searchParams, administradora, agente), {
      replace: true
    });
  }

  const aviso = listagem ? mensagemDaListaAoVivo(listagem) : null;

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
        <div className="listagem-painel">
          {aviso ? (
            <p>{aviso}</p>
          ) : (
            listagem.itens.map((item) => (
              <article className="listagem-linha" key={item.id}>
                <div>
                  <Link
                    className="listagem-link"
                    to={destinoDoDetalhe(item.id, location.search)}
                  >
                    {item.agente} · {formatarQuando(item.iniciadoEm)}
                  </Link>
                  <div className="listagem-meta">
                    {item.motivo} · {item.status}
                  </div>
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
