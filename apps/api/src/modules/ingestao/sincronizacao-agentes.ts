import {
  administradoraNoNomeDoAgente,
  idsSementeAgentes,
  type Administradora
} from '@hq-crion/contracts/recorte';
import type { PortaDeAtendimentos } from '../atendimentos/porta.js';
import type { PoolSql } from '../atendimentos/postgres.js';
import {
  buscarAgenteElevenLabs,
  buscarConversaElevenLabs,
  listarAgentesElevenLabs,
  listarConversasElevenLabs,
  type AgenteElevenLabs
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
      // 1. Obtém catálogo de agentes da ElevenLabs (/v1/convai/agents)
      let agentesFonte: AgenteElevenLabs[] = [];
      try {
        agentesFonte = await listarAgentesElevenLabs({
          apiKey,
          baseUrl: input.baseUrl ?? 'https://api.elevenlabs.io',
          fetchImpl: input.fetchImpl
        });
      } catch (err) {
        input.log?.warn?.({ err }, 'Falha ao listar agentes na ElevenLabs');
      }

      const mapaAgentes = new Map<string, string>();
      for (const ag of agentesFonte) {
        if (ag.agent_id && ag.name?.trim()) {
          mapaAgentes.set(ag.agent_id, ag.name.trim());
        }
      }

      // 2. Persiste / atualiza agentes no repositório relacional ou memória
      if (input.pool) {
        for (const [agentId, nome] of mapaAgentes.entries()) {
          const dedicada = administradoraNoNomeDoAgente(nome);
          await input.pool.query(
            `INSERT INTO hq_agente_de_voz (id, nome, administradora)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET
               nome = EXCLUDED.nome,
               administradora = EXCLUDED.administradora`,
            [agentId, nome, dedicada]
          );
          if (dedicada) {
            await input.pool.query(
              `UPDATE hq_atendimento
               SET administradora = $2
               WHERE agente_id = $1 AND administradora IS NULL`,
              [agentId, dedicada]
            );
          }
        }

        // Verifica agentes em hq_agente_de_voz cujo nome é o id ou começa com agent_
        const semNomeRes = await input.pool.query(
          `SELECT id FROM hq_agente_de_voz WHERE TRIM(COALESCE(nome, '')) = '' OR LOWER(TRIM(nome)) = LOWER(TRIM(id)) OR LOWER(TRIM(nome)) LIKE 'agent\\_%' ESCAPE '\\'`
        );
        for (const row of semNomeRes.rows as Array<{ id: string }>) {
          let nome = mapaAgentes.get(row.id);
          if (!nome) {
            try {
              const ag = await buscarAgenteElevenLabs({
                apiKey,
                baseUrl: input.baseUrl ?? 'https://api.elevenlabs.io',
                agentId: row.id,
                fetchImpl: input.fetchImpl
              });
              if (ag?.name?.trim()) {
                nome = ag.name.trim();
                mapaAgentes.set(row.id, nome);
              }
            } catch {
              // segue para o próximo
            }
          }
          if (nome) {
            const dedicada = administradoraNoNomeDoAgente(nome);
            await input.pool.query(
              `UPDATE hq_agente_de_voz SET nome = $2, administradora = $3 WHERE id = $1`,
              [row.id, nome, dedicada]
            );
            if (dedicada) {
              await input.pool.query(
                `UPDATE hq_atendimento SET administradora = $2 WHERE agente_id = $1 AND administradora IS NULL`,
                [row.id, dedicada]
              );
            }
          }
        }
      } else {
        const todos = await input.atendimentos.listar();
        for (const a of todos) {
          if (mapaAgentes.has(a.agenteId)) {
            const nomeReal = mapaAgentes.get(a.agenteId)!;
            const dedicada = administradoraNoNomeDoAgente(nomeReal);
            if (a.agente !== nomeReal || (dedicada && !a.administradora)) {
              await input.atendimentos.atualizarAgenteDoAtendimento(
                a.id,
                a.agenteId,
                nomeReal,
                dedicada
              );
            }
          }
        }
      }

      // 3. Atualiza atendimentos que ainda possuem agentes da semente
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

      if (pendentes.length > 0) {
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
            let nomeReal =
              mapaAgentes.get(dadosConversa.agent_id) ||
              dadosConversa.agent_name?.trim();
            if (!nomeReal || nomeReal === dadosConversa.agent_id) {
              try {
                const ag = await buscarAgenteElevenLabs({
                  apiKey,
                  baseUrl: input.baseUrl ?? 'https://api.elevenlabs.io',
                  agentId: dadosConversa.agent_id,
                  fetchImpl: input.fetchImpl
                });
                if (ag?.name?.trim()) {
                  nomeReal = ag.name.trim();
                  mapaAgentes.set(dadosConversa.agent_id, nomeReal);
                }
              } catch {
                // fallback
              }
            }
            nomeReal = nomeReal || dadosConversa.agent_id;
            const dedicada = administradoraNoNomeDoAgente(nomeReal);

            await input.atendimentos.atualizarAgenteDoAtendimento(
              pendente.id,
              dadosConversa.agent_id,
              nomeReal,
              dedicada
            );
          }
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
