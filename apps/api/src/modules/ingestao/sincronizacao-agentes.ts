import {
  administradoraNoNomeDoAgente,
  idsSementeAgentes,
  type Administradora
} from '@hq-crion/contracts/recorte';
import type { PortaDeAtendimentos } from '../atendimentos/porta.js';
import type { PoolSql } from '../atendimentos/postgres.js';
import {
  buscarConversaElevenLabs,
  listarConversasElevenLabs
} from './elevenlabs.js';

let sincronizacaoEmAndamento: Promise<void> | null = null;
let ultimaSincronizacaoMs = 0;
const intervaloMinimoEntreSincronizacoesMs = 15_000;

export async function sincronizarAgentesDosAtendimentos(input: {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  atendimentos: PortaDeAtendimentos;
  pool?: PoolSql;
  log?: { warn: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void };
  force?: boolean;
}): Promise<void> {
  const apiKey = input.apiKey;
  if (!apiKey) {
    return;
  }

  if (sincronizacaoEmAndamento) {
    return sincronizacaoEmAndamento;
  }

  const agora = Date.now();
  if (!input.force && agora - ultimaSincronizacaoMs < intervaloMinimoEntreSincronizacoesMs) {
    return;
  }

  sincronizacaoEmAndamento = (async () => {
    try {
      let pendentes: Array<{ id: string; conversa: string; agenteId: string; administradora: string }> = [];

      if (input.pool) {
        const res = await input.pool.query(
          `SELECT a.id, a.agente_id, COALESCE(a.administradora, ag.administradora) AS administradora
           FROM hq_atendimento a
           JOIN hq_agente_de_voz ag ON ag.id = a.agente_id
           WHERE a.agente_id = ANY($1::text[])`,
          [[...idsSementeAgentes]]
        );
        pendentes = (res.rows as any[]).map((row) => ({
          id: row.id,
          conversa: row.id,
          agenteId: row.agente_id,
          administradora: row.administradora
        }));
      } else {
        const todos = await input.atendimentos.listar();
        pendentes = todos
          .filter((a) => idsSementeAgentes.has(a.agenteId) && (a.conversa || a.id))
          .map((a) => ({
            id: a.id,
            conversa: a.conversa || a.id,
            agenteId: a.agenteId,
            administradora: a.administradora
          }));
      }

      if (pendentes.length === 0) {
        return;
      }

      const conversas = await listarConversasElevenLabs({
        apiKey,
        baseUrl: input.baseUrl ?? 'https://api.elevenlabs.io',
        fetchImpl: input.fetchImpl,
        incluirConcluidas: true
      });

      const mapaConversas = new Map<string, { agent_id: string; agent_name?: string }>();
      for (const c of conversas) {
        if (c.conversation_id && c.agent_id) {
          mapaConversas.set(c.conversation_id, {
            agent_id: c.agent_id,
            agent_name: c.agent_name
          });
        }
      }

      for (const pendente of pendentes) {
        let dadosConversa = mapaConversas.get(pendente.conversa);
        if (!dadosConversa) {
          try {
            const detalhe = await buscarConversaElevenLabs({
              apiKey,
              baseUrl: input.baseUrl ?? 'https://api.elevenlabs.io',
              id: pendente.conversa,
              fetchImpl: input.fetchImpl
            });
            if (detalhe?.agent_id) {
              dadosConversa = {
                agent_id: detalhe.agent_id,
                agent_name: detalhe.agent_name
              };
            }
          } catch {
            // segue para a próxima conversa
          }
        }

        if (dadosConversa?.agent_id) {
          const nomeReal = dadosConversa.agent_name?.trim() || dadosConversa.agent_id;
          const dedicada = administradoraNoNomeDoAgente(nomeReal);

          await input.atendimentos.atualizarAgenteDoAtendimento(
            pendente.id,
            dadosConversa.agent_id,
            nomeReal,
            dedicada
          );
        }
      }

      ultimaSincronizacaoMs = Date.now();
    } catch (error) {
      input.log?.warn?.({ err: error }, 'Sincronização de agentes via ElevenLabs falhou');
    } finally {
      sincronizacaoEmAndamento = null;
    }
  })();

  return sincronizacaoEmAndamento;
}
