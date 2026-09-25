import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createRequire } from 'node:module';
import { buildApp } from '../../apps/api/src/app.js';
import { reguaUnica } from '../../apps/api/src/modules/regua/regua-unica.js';
import type { EstadoDoCriterio } from '../../packages/contracts/src/atendimento.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';

const databaseUrl = process.env.DATABASE_URL ?? '';
const rodaAceite = databaseUrl.includes('hq_crion_aceite');

if (!rodaAceite) {
  test('suíte de aceite do Atendimento roda com Postgres hq_crion_aceite', { skip: true }, () => {});
} else {
  process.env.NODE_ENV = 'test';
  process.env.DEPOSITO = 'postgres';
  process.env.DATABASE_URL = databaseUrl;

  const { Pool } = createRequire(new URL('../../apps/api/package.json', import.meta.url))('pg') as {
    Pool: new (config: { connectionString: string }) => {
      query(sql: string, valores?: unknown[]): Promise<{ rows: unknown[] }>;
      end(): Promise<void>;
    };
  };
  const pool = new Pool({ connectionString: databaseUrl });
  const fetchOriginal = globalThis.fetch;

  function criterios(
    estado: EstadoDoCriterio = 'Atendido',
    ajuste?: { nome: string; estado: EstadoDoCriterio }
  ) {
    return reguaUnica.criterios.map((criterio) => ({
      nome: criterio.nome,
      estado:
        ajuste?.nome === criterio.nome
          ? ajuste.estado
          : criterio.nome === 'Validação de e-mail'
            ? ('Não se aplica' as const)
            : estado,
      pontos: criterio.valor,
      critico: criterio.critico
    }));
  }

  function conversa(parcial: Record<string, unknown>) {
    return {
      agent_name: 'Clara',
      start_time_unix_secs: Math.floor(Date.now() / 1000),
      transcript: [
        { role: 'agent', message: 'Olá.', time_in_call_secs: 1 },
        { role: 'user', message: 'Preciso de ajuda.', time_in_call_secs: 4 },
        { role: 'agent', message: 'Certo.', time_in_call_secs: 8 }
      ],
      ...parcial
    };
  }

  async function sessaoDe(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, senha: 'crion-hq' }
    });

    assert.equal(login.statusCode, 200, login.body);
    return loginResponseSchema.parse(login.json()).sessao;
  }

  async function limpar() {
    await pool.query(`
      TRUNCATE TABLE
        hq_comentario,
        hq_criterio_da_avaliacao_do_curador,
        hq_avaliacao_do_curador,
        hq_criterio_da_avaliacao_da_ia,
        hq_avaliacao_da_ia,
        hq_atendimento
      RESTART IDENTITY CASCADE
    `);
    await pool.query(`DELETE FROM hq_boot WHERE chave = 'seed'`);
  }

  async function comApp(
    opcoes: {
      skipSeed: boolean;
      conversas?: Record<string, unknown>[];
    },
    executar: (app: Awaited<ReturnType<typeof buildApp>>) => Promise<void>
  ) {
    await limpar();
    process.env.SKIP_SEED = opcoes.skipSeed ? 'true' : 'false';
    process.env.DEPOSITO = 'postgres';
    process.env.NODE_ENV = 'test';

    if (opcoes.conversas) {
      process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ conversations: opcoes.conversas }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })) as typeof fetch;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
      globalThis.fetch = fetchOriginal;
    }

    const app = await buildApp();

    try {
      await executar(app);
    } finally {
      await app.close();
      delete process.env.ELEVENLABS_API_KEY;
      globalThis.fetch = fetchOriginal;
    }
  }

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEPOSITO = 'postgres';
    process.env.SKIP_SEED = 'true';
    delete process.env.ELEVENLABS_API_KEY;
    const app = await buildApp();
    await app.close();
    await limpar();
  });

  after(async () => {
    await pool.end();
  });

  test('SKIP_SEED pula a demonstração e mantém Admin e Régua', async () => {
    await comApp({ skipSeed: true }, async (app) => {
      const admin = await sessaoDe(app, 'bruno.alves@crion');
      const regua = await app.inject({
        method: 'GET',
        url: '/regua',
        headers: { authorization: `Bearer ${admin}` }
      });
      const ausente = await app.inject({
        method: 'GET',
        url: '/atendimentos/a1',
        headers: { authorization: `Bearer ${admin}` }
      });

      assert.equal(regua.statusCode, 200, regua.body);
      assert.equal(regua.json().limiarDeAprovacao, 7);
      assert.ok(regua.json().criterios.length > 0);
      assert.equal(ausente.statusCode, 404);
    });
  });

  test('reingestão atualiza a conversa e preserva o que a fonte não manda de novo', async () => {
    await comApp(
      {
        skipSeed: false,
        conversas: [
          conversa({
            conversation_id: 'a1',
            agent_id: 'affix-0800',
            status: 'done',
            call_duration_secs: 10,
            transcript: [
              { role: 'agent', message: 'Apresentação.', time_in_call_secs: 0 },
              { role: 'user', message: 'transcricao reingerida', time_in_call_secs: 10 },
              { role: 'agent', message: 'Retorno.', time_in_call_secs: 410 }
            ]
          }),
          conversa({
            conversation_id: 'conv-nova',
            agent_id: 'alter-1',
            status: 'done',
            call_duration_secs: 20
          })
        ]
      },
      async (app) => {
        const admin = await sessaoDe(app, 'bruno.alves@crion');
        const curador = await sessaoDe(app, 'carla.mendes@crion');
        const detalheAdmin = await app.inject({
          method: 'GET',
          url: '/atendimentos/a1',
          headers: { authorization: `Bearer ${admin}` }
        });
        const detalheCurador = await app.inject({
          method: 'GET',
          url: '/atendimentos/a1',
          headers: { authorization: `Bearer ${curador}` }
        });
        const nova = await app.inject({
          method: 'GET',
          url: '/atendimentos/conv-nova',
          headers: { authorization: `Bearer ${admin}` }
        });
        const fila = await app.inject({
          method: 'GET',
          url: '/fila-de-curadoria',
          headers: { authorization: `Bearer ${curador}` }
        });
        const dashboard = await app.inject({
          method: 'GET',
          url: '/dashboard?administradora=Affix&agente=affix-0800',
          headers: { authorization: `Bearer ${admin}` }
        });

        assert.equal(detalheAdmin.statusCode, 200, detalheAdmin.body);
        const corpo = detalheAdmin.json();
        assert.equal(corpo.id, 'a1');
        assert.equal(corpo.motivo, 'Rede credenciada');
        assert.equal(corpo.custo, 'R$ 1,42');
        assert.equal('audio' in corpo, false);
        assert.equal('downloadDeAudio' in corpo, false);
        assert.equal(corpo.avaliacaoDaIa.nota, 8.5);
        assert.ok(
          corpo.transcricao.some(
            (turno: { texto: string }) => turno.texto === 'transcricao reingerida'
          )
        );
        assert.equal(detalheCurador.statusCode, 200, detalheCurador.body);
        assert.equal('custo' in detalheCurador.json(), false);
        assert.equal('downloadDeAudio' in detalheCurador.json(), false);
        assert.equal(nova.statusCode, 200, nova.body);
        assert.equal(nova.json().id, 'conv-nova');
        assert.equal('avaliacaoDaIa' in nova.json(), false);
        assert.equal(
          fila.json().itens.some((item: { id: string }) => item.id === 'conv-nova'),
          false
        );

        const kpis = dashboard.json().kpis as { id: string; valor: number | null }[];
        const kpi = (id: string) => kpis.find((item) => item.id === id)?.valor;
        assert.equal(dashboard.statusCode, 200, dashboard.body);
        assert.equal(kpi('tma'), 10);
        assert.equal(kpi('sla'), 0);
        assert.equal(kpi('taxaDeResolvidas'), 100);
        assert.ok(Math.abs((kpi('promessasCumpridas') ?? 0) - (2 / 3) * 100) < 0.001);
      }
    );
  });

  test('a Avaliação da IA substitui o veredito e a conferência acumula revisão', async () => {
    await comApp(
      {
        skipSeed: true,
        conversas: [
          conversa({
            conversation_id: 'conv-ok',
            agent_id: 'affix-0800',
            status: 'done',
            call_duration_secs: 30
          }),
          conversa({
            conversation_id: 'conv-vivo',
            agent_id: 'affix-wa',
            status: 'in-progress'
          }),
          conversa({
            conversation_id: 'conv-mudo',
            agent_id: 'alter-1',
            status: 'done',
            call_duration_secs: 15
          })
        ]
      },
      async (app) => {
        const admin = await sessaoDe(app, 'bruno.alves@crion');
        const curador = await sessaoDe(app, 'carla.mendes@crion');
        const gestao = await sessaoDe(app, 'ana.souza@crion');
        const auth = (sessao: string) => ({ authorization: `Bearer ${sessao}` });
        const veredito = {
          nota: 9,
          criterios: criterios()
        };
        const substituido = {
          nota: 3,
          criterios: criterios('Atendido', { nome: 'Saudação', estado: 'Não atendido' })
        };

        const vivo = await app.inject({
          method: 'POST',
          url: '/atendimentos/conv-vivo/avaliacao-da-ia',
          headers: auth(admin),
          payload: veredito
        });
        const conferenciaVivo = await app.inject({
          method: 'POST',
          url: '/atendimentos/conv-vivo/conferencia',
          headers: auth(curador),
          payload: {
            checklist: criterios(),
            notaDaRegua: 9,
            notaDaAvaliacaoDaIa: 9
          }
        });
        const monitoramento = await app.inject({
          method: 'GET',
          url: '/monitoramento',
          headers: auth(curador)
        });
        const primeiraIa = await app.inject({
          method: 'POST',
          url: '/atendimentos/conv-ok/avaliacao-da-ia',
          headers: auth(admin),
          payload: veredito
        });
        const filaComVeredito = await app.inject({
          method: 'GET',
          url: '/fila-de-curadoria',
          headers: auth(curador)
        });
        const recusaGestao = await app.inject({
          method: 'POST',
          url: '/atendimentos/conv-ok/avaliacao-da-ia',
          headers: auth(gestao),
          payload: veredito
        });
        const conferencia = await app.inject({
          method: 'POST',
          url: '/atendimentos/conv-ok/conferencia',
          headers: auth(curador),
          payload: {
            checklist: criterios(),
            notaDaRegua: 9,
            notaDaAvaliacaoDaIa: 1,
            comentario: 'primeiro'
          }
        });
        const painelAntes = await app.inject({
          method: 'GET',
          url: '/dashboard?administradora=Affix&agente=affix-0800',
          headers: auth(gestao)
        });
        const troca = await app.inject({
          method: 'POST',
          url: '/atendimentos/conv-ok/avaliacao-da-ia',
          headers: auth(admin),
          payload: substituido
        });
        const painelDepois = await app.inject({
          method: 'GET',
          url: '/dashboard?administradora=Affix&agente=affix-0800',
          headers: auth(gestao)
        });
        const filaDepois = await app.inject({
          method: 'GET',
          url: '/fila-de-curadoria',
          headers: auth(curador)
        });
        const segunda = await app.inject({
          method: 'POST',
          url: '/atendimentos/conv-ok/conferencia',
          headers: auth(curador),
          payload: {
            checklist: criterios('Não atendido'),
            notaDaRegua: 4,
            notaDaAvaliacaoDaIa: 1,
            comentario: 'segundo'
          }
        });
        const iaMuda = await app.inject({
          method: 'POST',
          url: '/atendimentos/conv-mudo/avaliacao-da-ia',
          headers: auth(admin),
          payload: veredito
        });
        const silencio = await app.inject({
          method: 'POST',
          url: '/atendimentos/conv-mudo/conferencia',
          headers: auth(curador),
          payload: {
            checklist: criterios(),
            notaDaRegua: 9,
            notaDaAvaliacaoDaIa: 9
          }
        });
        const manutencao = await app.inject({
          method: 'GET',
          url: '/manutencao?status=Pendente',
          headers: auth(admin)
        });
        const gestaoNaFila = await app.inject({
          method: 'GET',
          url: '/manutencao',
          headers: auth(gestao)
        });
        const detalheGestao = await app.inject({
          method: 'GET',
          url: '/atendimentos/conv-ok',
          headers: auth(gestao)
        });
        const curadorNoDetalhe = await app.inject({
          method: 'GET',
          url: '/atendimentos/conv-ok',
          headers: auth(curador)
        });

        assert.equal(vivo.statusCode, 409, vivo.body);
        assert.equal(conferenciaVivo.statusCode, 409, conferenciaVivo.body);
        assert.equal(monitoramento.statusCode, 200, monitoramento.body);
        assert.ok(
          monitoramento.json().itens.some((item: { id: string }) => item.id === 'conv-vivo')
        );
        assert.equal(primeiraIa.statusCode, 200, primeiraIa.body);
        assert.equal(primeiraIa.json().id, 'conv-ok');
        assert.equal(primeiraIa.json().avaliacaoDaIa.aprovacao, 'Aprovado');
        assert.equal(recusaGestao.statusCode, 403);
        assert.ok(
          filaComVeredito.json().itens.some((item: { id: string }) => item.id === 'conv-ok')
        );
        assert.equal(
          filaComVeredito.json().itens.some((item: { id: string }) => item.id === 'conv-vivo'),
          false
        );
        assert.equal(conferencia.statusCode, 200, conferencia.body);
        assert.equal(conferencia.json().avaliacaoDoCurador.notaDaAvaliacaoDaIa, 9);
        assert.equal(conferencia.json().avaliacaoDoCurador.curador, 'Carla Mendes');
        assert.equal(conferencia.json().avaliacaoDoCurador.comentario, 'primeiro');
        assert.equal(painelAntes.statusCode, 200, painelAntes.body);
        assert.equal(painelAntes.json().paineis.concordancia.nota, 100);
        assert.equal(
          painelAntes.json().kpis.find((item: { id: string }) => item.id === 'aprovacao').valor,
          100
        );
        assert.equal(troca.statusCode, 200, troca.body);
        assert.equal(troca.json().avaliacaoDaIa.nota, 3);
        assert.equal(troca.json().avaliacaoDaIa.aprovacao, 'Reprovado');
        assert.equal(
          troca.json().avaliacaoDaIa.criterios.find(
            (criterio: { nome: string }) => criterio.nome === 'Saudação'
          ).estado,
          'Não atendido'
        );
        assert.equal(troca.json().avaliacaoDoCurador.nota, 9);
        assert.equal(troca.json().avaliacaoDoCurador.notaDaAvaliacaoDaIa, 9);
        assert.equal(troca.json().avaliacaoDoCurador.aprovacao, 'Aprovado');
        assert.equal(
          troca.json().avaliacaoDoCurador.criterios.find(
            (criterio: { nome: string }) => criterio.nome === 'Saudação'
          ).estado,
          'Atendido'
        );
        assert.equal(painelDepois.json().paineis.concordancia.nota, 0);
        assert.equal(
          painelDepois.json().kpis.find((item: { id: string }) => item.id === 'aprovacao').valor,
          0
        );
        assert.equal(
          filaDepois.json().itens.some((item: { id: string }) => item.id === 'conv-ok'),
          false
        );
        assert.equal(segunda.statusCode, 200, segunda.body);
        assert.equal(segunda.json().avaliacaoDoCurador.comentario, 'segundo');
        assert.equal(segunda.json().avaliacaoDoCurador.notaDaAvaliacaoDaIa, 3);
        assert.equal(iaMuda.statusCode, 200, iaMuda.body);
        assert.equal(silencio.statusCode, 200, silencio.body);
        assert.equal(silencio.json().avaliacaoDoCurador.comentario, undefined);
        assert.equal(gestaoNaFila.statusCode, 403);
        assert.equal(detalheGestao.statusCode, 200, detalheGestao.body);
        assert.equal(detalheGestao.json().avaliacaoDoCurador.comentario, 'segundo');
        assert.equal('custo' in curadorNoDetalhe.json(), false);
        assert.equal('downloadDeAudio' in curadorNoDetalhe.json(), false);
        assert.equal(curadorNoDetalhe.json().downloadDeAudio, undefined);
        assert.equal('audio' in curadorNoDetalhe.json(), false);

        const pendentes = manutencao.json().itens as {
          id: string;
          atendimentoId: string;
          texto: string;
          status: string;
        }[];
        assert.equal(manutencao.statusCode, 200, manutencao.body);
        assert.deepEqual(
          pendentes.map((item) => item.texto).sort(),
          ['primeiro', 'segundo']
        );
        assert.equal(
          pendentes.some((item) => item.atendimentoId === 'conv-mudo'),
          false
        );
        const primeiro = pendentes.find((item) => item.texto === 'primeiro');
        assert.ok(primeiro);
        const resolucao = await app.inject({
          method: 'POST',
          url: `/manutencao/${primeiro.id}/resolver`,
          headers: auth(admin)
        });
        const ainda = await app.inject({
          method: 'GET',
          url: '/manutencao?status=Pendente',
          headers: auth(admin)
        });
        const resolvidos = await app.inject({
          method: 'GET',
          url: '/manutencao?status=Resolvido',
          headers: auth(admin)
        });

        assert.equal(resolucao.statusCode, 200, resolucao.body);
        assert.equal(resolucao.json().status, 'Resolvido');
        assert.equal(resolucao.json().texto, 'primeiro');
        assert.deepEqual(
          ainda.json().itens.map((item: { texto: string }) => item.texto),
          ['segundo']
        );
        assert.equal(resolvidos.json().itens[0].texto, 'primeiro');
        assert.equal(resolvidos.json().itens[0].status, 'Resolvido');

        const renome = await app.inject({
          method: 'PUT',
          url: '/perfis/perfil-carla',
          headers: auth(admin),
          payload: {
            nome: 'Carla Renomeada',
            email: 'carla.mendes@crion',
            papel: 'Curador'
          }
        });
        const depoisDoNome = await app.inject({
          method: 'GET',
          url: '/atendimentos/conv-ok',
          headers: auth(gestao)
        });
        const realizadas = await app.inject({
          method: 'GET',
          url: '/curadorias-realizadas',
          headers: auth(gestao)
        });

        assert.equal(renome.statusCode, 200, renome.body);
        assert.equal(depoisDoNome.json().avaliacaoDoCurador.curador, 'Carla Mendes');
        assert.equal(
          realizadas.json().curadores.find((pessoa: { id: string }) => pessoa.id === 'perfil-carla')
            .nome,
          'Carla Mendes'
        );

        await app.inject({
          method: 'PUT',
          url: '/perfis/perfil-carla',
          headers: auth(admin),
          payload: {
            nome: 'Carla Mendes',
            email: 'carla.mendes@crion',
            papel: 'Curador'
          }
        });

        const filaFinal = await app.inject({
          method: 'GET',
          url: '/fila-de-curadoria',
          headers: auth(curador)
        });
        assert.equal(
          filaFinal.json().itens.some((item: { id: string }) => item.id === 'conv-ok'),
          false
        );
      }
    );
  });

  test('o depósito recusa custo textual, Transferência ausente, e-mail em outra caixa e Não se aplica indevido', async () => {
    await comApp({ skipSeed: true }, async (app) => {
      const admin = await sessaoDe(app, 'bruno.alves@crion');
      const curador = await sessaoDe(app, 'carla.mendes@crion');

      await pool.query(`
        INSERT INTO hq_atendimento
          (id, agente_id, status, iniciado_em, transcricao, motivo, transferencia, custo, evento_na_fonte_em)
        VALUES
          ('dep-ok', 'affix-0800', 'Concluído', now(), '[]'::jsonb, 'Rede credenciada', false, 1.42, now())
      `);

      await assert.rejects(
        () =>
          pool.query(`
            INSERT INTO hq_atendimento
              (id, agente_id, status, iniciado_em, transcricao, motivo, transferencia, custo, evento_na_fonte_em)
            VALUES
              ('dep-custo', 'affix-0800', 'Concluído', now(), '[]'::jsonb, 'Rede credenciada', false, 'R$ 1,42', now())
          `)
      );
      await assert.rejects(
        () =>
          pool.query(`
            INSERT INTO hq_atendimento
              (id, agente_id, status, iniciado_em, transcricao, motivo, custo, evento_na_fonte_em)
            VALUES
              ('dep-transf', 'affix-0800', 'Concluído', now(), '[]'::jsonb, 'Rede credenciada', 1.10, now())
          `)
      );
      await assert.rejects(
        () =>
          pool.query(`
            INSERT INTO hq_perfil (id, nome, email, senha, papel, ativo)
            VALUES ('perfil-caixa', 'Ana Outra', 'Ana.Souza@crion', 'x', 'Gestão', true)
          `)
      );

      const saudacao = await pool.query(
        `SELECT chave FROM hq_criterio_da_regua WHERE nome = 'Saudação'`
      );
      const chaveSaudacao = (saudacao.rows[0] as { chave: string }).chave;
      await pool.query(
        `INSERT INTO hq_avaliacao_da_ia (atendimento_id, nota) VALUES ('dep-ok', 8)`
      );
      await assert.rejects(() =>
        pool.query(
          `INSERT INTO hq_criterio_da_avaliacao_da_ia
             (atendimento_id, ordem, chave, nome, estado, pontos, critico)
           VALUES ('dep-ok', 1, $1, 'Saudação', 'Não se aplica', 1, false)`,
          [chaveSaudacao]
        )
      );

      const veredito = {
        nota: 9,
        criterios: criterios()
      };
      await app.inject({
        method: 'POST',
        url: '/atendimentos/dep-ok/avaliacao-da-ia',
        headers: { authorization: `Bearer ${admin}` },
        payload: veredito
      });
      const conferencia = await app.inject({
        method: 'POST',
        url: '/atendimentos/dep-ok/conferencia',
        headers: { authorization: `Bearer ${curador}` },
        payload: {
          checklist: criterios(),
          notaDaRegua: 9,
          notaDaAvaliacaoDaIa: 9,
          comentario: 'fechar depois'
        }
      });
      assert.equal(conferencia.statusCode, 200, conferencia.body);
      const fila = await app.inject({
        method: 'GET',
        url: '/manutencao?status=Pendente',
        headers: { authorization: `Bearer ${admin}` }
      });
      const item = (fila.json().itens as { id: string; texto: string }[]).find(
        (comentario) => comentario.texto === 'fechar depois'
      );
      assert.ok(item);
      const resolucao = await app.inject({
        method: 'POST',
        url: `/manutencao/${item.id}/resolver`,
        headers: { authorization: `Bearer ${admin}` }
      });
      assert.equal(resolucao.statusCode, 200, resolucao.body);
      assert.equal(resolucao.json().texto, 'fechar depois');
      assert.equal(resolucao.json().status, 'Resolvido');
      assert.equal(resolucao.json().resolvidoPor, 'Bruno Alves');
      assert.ok(resolucao.json().resolvidoEm);
    });
  });
}
