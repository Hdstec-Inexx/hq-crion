import assert from 'node:assert/strict';
import test from 'node:test';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import {
  administradoraNoNomeDoAgente,
  agentesDeVoz,
  escreverRecorteNaQuery,
  lerRecorte,
  nomeDeAgenteEstaResolvido
} from '../../packages/contracts/src/recorte.js';
import { atendimentoEstaAvaliado } from '../../apps/api/src/modules/atendimentos/registro.js';
import { buildApp } from '../../apps/api/src/app.js';
import {
  atendimentoDaFonteElevenLabs,
  buscarAgenteElevenLabs,
  listarAgentesElevenLabs,
  type PayloadElevenLabs
} from '../../apps/api/src/modules/ingestao/elevenlabs.js';
import { sincronizarAgentesDosAtendimentos } from '../../apps/api/src/modules/ingestao/sincronizacao-agentes.js';

async function sessaoDe(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string
) {
  const login = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { email, senha: 'crion-hq' }
  });

  return loginResponseSchema.parse(login.json()).sessao;
}

test('classificação de agentes dedicados vs. compartilhados pelo nome', () => {
  // Dedicados
  assert.equal(administradoraNoNomeDoAgente('Clara Affix 0800'), 'Affix');
  assert.equal(administradoraNoNomeDoAgente('Clara Affix WhatsApp'), 'Affix');
  assert.equal(administradoraNoNomeDoAgente('Clara Alter Atendimento'), 'Alter');
  assert.equal(administradoraNoNomeDoAgente('Clara Conectaplan Central'), 'Conectaplan');
  assert.equal(administradoraNoNomeDoAgente('Clara - Conecta Plan -skill'), 'Conectaplan');
  assert.equal(administradoraNoNomeDoAgente('Clara - Affix -skill'), 'Affix');
  assert.equal(administradoraNoNomeDoAgente('Clara - Roteador | Alter'), 'Alter');
  assert.equal(administradoraNoNomeDoAgente('AGENTE AFFIX ESPECIAL'), 'Affix');

  // Compartilhados (sem nome de Administradora)
  assert.equal(administradoraNoNomeDoAgente('Clara Roteador Central'), null);
  assert.equal(administradoraNoNomeDoAgente('Atendente Triagem Geral'), null);
  assert.equal(administradoraNoNomeDoAgente('Clara Recepção'), null);
  assert.equal(administradoraNoNomeDoAgente(''), null);
});

test('ingestão aceita qualquer Agente de Voz válido da fonte e infere administradora', () => {
  const agoraSegundos = Math.floor(Date.now() / 1000);

  // Agente dedicado novo fora da lista fixa de 4
  const payloadDedicado: PayloadElevenLabs = {
    conversation_id: 'conv-novo-dedicado',
    agent_id: 'agente-novo-alter',
    agent_name: 'Clara Alter Atendimento Especial',
    status: 'done',
    start_time_unix_secs: agoraSegundos - 120,
    call_duration_secs: 60
  };

  const atendimentoDedicado = atendimentoDaFonteElevenLabs(payloadDedicado);
  assert.ok(atendimentoDedicado, 'atendimentoDedicado deve ser criado');
  assert.equal(atendimentoDedicado.agenteId, 'agente-novo-alter');
  assert.equal(atendimentoDedicado.agente, 'Clara Alter Atendimento Especial');
  assert.equal(atendimentoDedicado.administradora, 'Alter');

  // Agente compartilhado novo fora da lista fixa de 4
  const payloadCompartilhado: PayloadElevenLabs & { administradora?: 'Affix' } = {
    conversation_id: 'conv-novo-compartilhado',
    agent_id: 'agente-roteador-geral',
    agent_name: 'Clara Roteador Nacional',
    administradora: 'Affix',
    status: 'done',
    start_time_unix_secs: agoraSegundos - 120,
    call_duration_secs: 60
  };

  const atendimentoCompartilhado = atendimentoDaFonteElevenLabs(payloadCompartilhado);
  assert.ok(atendimentoCompartilhado, 'atendimentoCompartilhado deve ser criado');
  assert.equal(atendimentoCompartilhado.agenteId, 'agente-roteador-geral');
  assert.equal(atendimentoCompartilhado.agente, 'Clara Roteador Nacional');
  assert.equal(atendimentoCompartilhado.administradora, 'Affix');
});

test('par Administradora e Agente incompatíveis é rejeitado por lerRecorte', () => {
  // Agente dedicado com sua Administradora correta
  assert.deepEqual(lerRecorte({ administradora: 'Affix', agente: 'affix-0800' }), {
    administradora: 'Affix',
    agente: 'affix-0800'
  });

  // Agente dedicado com Administradora incompatível deve ser rejeitado
  assert.throws(() => lerRecorte({ administradora: 'Affix', agente: 'alter-1' }));
  assert.throws(() => lerRecorte({ administradora: 'Conectaplan', agente: 'affix-wa' }));
});

test('GET /agentes e /api/agentes exigem autenticação e retornam 401', async () => {
  const app = await buildApp();

  try {
    const res1 = await app.inject({ method: 'GET', url: '/agentes' });
    assert.equal(res1.statusCode, 401);

    const res2 = await app.inject({ method: 'GET', url: '/api/agentes' });
    assert.equal(res2.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('GET /agentes retorna catálogo dinâmico de agentes dos atendimentos avaliados', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const res = await app.inject({
      method: 'GET',
      url: '/agentes',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(res.statusCode, 200);
    const lista = res.json();
    assert.ok(Array.isArray(lista), 'deve retornar array de agentes');
    assert.ok(lista.length > 0, 'deve conter agentes');

    for (const item of lista) {
      assert.ok(typeof item.id === 'string' && item.id.length > 0);
      assert.ok(typeof item.nome === 'string' && item.nome.length > 0);
      assert.ok(item.administradora === null || ['Affix', 'Alter', 'Conectaplan'].includes(item.administradora));
      assert.ok(Array.isArray(item.administradorasAtendidas));
    }
  } finally {
    await app.close();
  }
});

test('sincronização via ElevenLabs atualiza agente mantendo intacta a Administradora do atendimento', async () => {
  const app = await buildApp();

  try {
    // 1. Cadastra um atendimento de teste com agente da semente e administradora Affix
    const atendimentoOriginal = {
      id: 'atend-teste-sync-1',
      administradora: 'Affix' as const,
      agente: 'Clara Affix 0800',
      agenteId: 'affix-0800',
      conversa: 'conv-sync-teste-1',
      status: 'Concluído',
      iniciadoEm: new Date().toISOString(),
      motivo: 'Boleto',
      nota: 8,
      notaIa: 8,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    };

    // Inserir via repositório em memória
    const listaRegistros = (app.atendimentos as any).listar;
    if (listaRegistros) {
      const atendimentos = await app.atendimentos.listar();
      (atendimentos as any[]).push(atendimentoOriginal);
    }

    // 2. Mock do fetchImpl da ElevenLabs retornando o agente real compartilhado
    const fetchMock = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/v1/convai/conversations')) {
        return new Response(
          JSON.stringify({
            conversations: [
              {
                conversation_id: 'conv-sync-teste-1',
                agent_id: 'real-router-agent-99',
                agent_name: 'Clara Central Router'
              }
            ],
            has_more: false
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    // 3. Executa a sincronização
    await sincronizarAgentesDosAtendimentos({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.elevenlabs.io',
      fetchImpl: fetchMock as any,
      atendimentos: app.atendimentos
    });

    // 4. Verifica que o atendimento foi atualizado com o agente real e manteve a Administradora Affix
    const atualizado = await app.atendimentos.buscarPorId('atend-teste-sync-1');
    assert.ok(atualizado, 'atendimento deve existir');
    assert.equal(atualizado.agenteId, 'real-router-agent-99');
    assert.equal(atualizado.agente, 'Clara Central Router');
    assert.equal(atualizado.administradora, 'Affix'); // preservada!

    // 5. Verifica que o catálogo dinâmico de agentes agora inclui o novo agente compartilhado
    // e oculta os 4 da semente sem atendimentos reais
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const resAgentes = await app.inject({
      method: 'GET',
      url: '/agentes',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const listaAgentes = resAgentes.json();
    const agenteSincronizado = listaAgentes.find((ag: any) => ag.id === 'real-router-agent-99');
    assert.ok(agenteSincronizado, 'agente sincronizado deve constar no catálogo');
    assert.equal(agenteSincronizado.administradora, null); // compartilhado
    assert.deepEqual(agenteSincronizado.administradorasAtendidas, ['Affix']);
  } finally {
    await app.close();
  }
});

test('agentes de atendimentos salvos aparecem no catálogo dinâmico mesmo na presença de agentes novos', async () => {
  const app = await buildApp();

  try {
    const agoraIso = new Date().toISOString();
    const listaRegistros = (app.atendimentos as any).listar;
    if (listaRegistros) {
      const atendimentos = await app.atendimentos.listar();
      (atendimentos as any[]).push({
        id: 'atend-affix-salvo',
        administradora: 'Affix' as const,
        agente: 'Clara Affix Especial',
        agenteId: 'affix-especial-salvo',
        conversa: 'conv-affix-salvo',
        status: 'Concluído',
        iniciadoEm: agoraIso,
        motivo: 'Boleto',
        nota: 8,
        notaIa: 8,
        notaCurador: null,
        curadoria: false,
        transcricao: []
      });
      (atendimentos as any[]).push({
        id: 'atend-novo-skill',
        administradora: 'Conectaplan' as const,
        agente: 'Clara - Conecta Plan -skill',
        agenteId: 'conecta-plan-skill-id',
        conversa: 'conv-conecta-skill',
        status: 'Concluído',
        iniciadoEm: agoraIso,
        motivo: 'Boleto',
        nota: 9,
        notaIa: 9,
        notaCurador: null,
        curadoria: false,
        transcricao: []
      });
    }

    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const res = await app.inject({
      method: 'GET',
      url: '/agentes',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(res.statusCode, 200);
    const lista = res.json();
    const ids = lista.map((item: any) => item.id);
    assert.ok(ids.includes('affix-especial-salvo'), 'agente salvo affix-especial-salvo deve constar no catálogo');
    assert.ok(ids.includes('conecta-plan-skill-id'), 'agente novo conecta-plan-skill-id deve constar no catálogo');
    assert.ok(!ids.includes('affix-0800'), 'agente semente padrão affix-0800 deve ser ocultado na presença de agentes reais');
    const conectaSkill = lista.find((item: any) => item.id === 'conecta-plan-skill-id');
    assert.equal(conectaSkill.administradora, 'Conectaplan');
  } finally {
    await app.close();
  }
});

test('sincronização via ElevenLabs atualiza agentes que estão com ID em vez do nome e oculta agentes padrão', async () => {
  const app = await buildApp();

  try {
    const agoraIso = new Date().toISOString();
    const listaRegistros = (app.atendimentos as any).listar;
    if (listaRegistros) {
      const atendimentos = await app.atendimentos.listar();
      // Atendimento cujo agente foi salvo apenas com o id (ex.: agent_0101kn4pk9d4efet4ka1nt92e5mp)
      (atendimentos as any[]).push({
        id: 'atend-com-id-apenas',
        administradora: null,
        agente: 'agent_0101kn4pk9d4efet4ka1nt92e5mp',
        agenteId: 'agent_0101kn4pk9d4efet4ka1nt92e5mp',
        conversa: 'conv-com-id-apenas',
        status: 'Concluído',
        iniciadoEm: agoraIso,
        motivo: 'Boleto',
        nota: 8,
        notaIa: 8,
        notaCurador: null,
        curadoria: false,
        transcricao: []
      });
    }

    const fetchMock = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/v1/convai/agents')) {
        return new Response(
          JSON.stringify({
            agents: [
              {
                agent_id: 'agent_0101kn4pk9d4efet4ka1nt92e5mp',
                name: 'Clara - Affix - Atendimento WhatsApp'
              }
            ],
            has_more: false
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    await sincronizarAgentesDosAtendimentos({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.elevenlabs.io',
      fetchImpl: fetchMock as any,
      atendimentos: app.atendimentos,
      force: true
    });

    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const res = await app.inject({
      method: 'GET',
      url: '/agentes',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(res.statusCode, 200);
    const lista = res.json();
    const agenteAtualizado = lista.find((ag: any) => ag.id === 'agent_0101kn4pk9d4efet4ka1nt92e5mp');
    assert.ok(agenteAtualizado, 'agente deve constar no catálogo');
    assert.equal(agenteAtualizado.nome, 'Clara - Affix - Atendimento WhatsApp');
    assert.equal(agenteAtualizado.administradora, 'Affix');
    // Agentes padrão devem ser ocultados pois temos agente real
    const ids = lista.map((item: any) => item.id);
    assert.ok(!ids.includes('affix-0800'), 'agente semente não deve aparecer');
    assert.ok(!ids.includes('alter-1'), 'agente semente não deve aparecer');
  } finally {
    await app.close();
  }
});

test('consultas de Atendimento e Manutenção preservam filtro por Administradora com agentes compartilhados', async () => {
  const app = await buildApp();

  try {
    const agoraIso = new Date().toISOString();
    // Atendimento conduzido por agente compartilhado para a Administradora Affix
    const atendimentoCompartilhadoAffix = {
      id: 'atend-comp-affix',
      administradora: 'Affix' as const,
      agente: 'Clara Roteador Geral',
      agenteId: 'roteador-geral',
      conversa: 'conv-comp-affix',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Boleto',
      nota: 8.0,
      notaIa: 8.0,
      notaCurador: 8.0,
      curadoria: true,
      transcricao: [],
      avaliacaoDoCurador: {
        nota: 8.0,
        notaDaAvaliacaoDaIa: 8.0,
        curador: 'Curador Teste',
        aprovacao: 'Aprovado' as const,
        criterios: [{ nome: 'Resolução da demanda', estado: 'Atendido' as const, pontos: 1.5, critico: true }],
        comentario: 'Comentário sobre atendimento compartilhado'
      },
      comentarioStatus: 'Pendente' as const
    };

    const atendimentos = await app.atendimentos.listar();
    (atendimentos as any[]).push(atendimentoCompartilhadoAffix);

    const sessao = await sessaoDe(app, 'ana.souza@crion');

    // 1. Consulta /atendimentos com administradora=Affix deve retornar o atendimento
    const resAtendimentosAffix = await app.inject({
      method: 'GET',
      url: '/atendimentos?administradora=Affix',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(resAtendimentosAffix.statusCode, 200);
    const idsAffix = resAtendimentosAffix.json().itens.map((item: any) => item.id);
    assert.ok(idsAffix.includes('atend-comp-affix'), 'atendimento compartilhado deve aparecer no recorte de Affix');

    // 2. Consulta /atendimentos com administradora=Alter NÃO deve retornar o atendimento de Affix
    const resAtendimentosAlter = await app.inject({
      method: 'GET',
      url: '/atendimentos?administradora=Alter',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(resAtendimentosAlter.statusCode, 200);
    const idsAlter = resAtendimentosAlter.json().itens.map((item: any) => item.id);
    assert.equal(idsAlter.includes('atend-comp-affix'), false, 'atendimento de Affix não deve aparecer no recorte de Alter');

    // 3. Consulta /manutencao com administradora=Affix deve retornar o comentário (requer Admin)
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const resManutencaoAffix = await app.inject({
      method: 'GET',
      url: '/manutencao?administradora=Affix',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resManutencaoAffix.statusCode, 200);
    const idsManutencao = resManutencaoAffix.json().itens.map((item: any) => item.atendimentoId);
    assert.ok(idsManutencao.includes('atend-comp-affix'), 'comentário do atendimento compartilhado deve aparecer na fila de Affix');

    // 4. Favorita o atendimento compartilhado como Curador e consulta /favoritos
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const resFav = await app.inject({
      method: 'POST',
      url: '/atendimentos/atend-comp-affix/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(resFav.statusCode, 200);

    const resFavoritosAffix = await app.inject({
      method: 'GET',
      url: '/favoritos?administradora=Affix',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(resFavoritosAffix.statusCode, 200);
    const idsFavoritosAffix = resFavoritosAffix.json().itens.map((item: any) => item.id);
    assert.ok(idsFavoritosAffix.includes('atend-comp-affix'), 'favorito do atendimento compartilhado deve aparecer em Affix');

    const resFavoritosAlter = await app.inject({
      method: 'GET',
      url: '/favoritos?administradora=Alter',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(resFavoritosAlter.statusCode, 200);
    const idsFavoritosAlter = resFavoritosAlter.json().itens.map((item: any) => item.id);
    assert.equal(idsFavoritosAlter.includes('atend-comp-affix'), false, 'favorito de Affix não deve aparecer em Alter');
  } finally {
    await app.close();
  }
});

test('ADR 0015 documenta agentes compartilhados, administradora no atendimento e sincronização', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const adrPath = join(process.cwd(), 'docs/adr/0015-agentes-de-voz-compartilhados-e-administradora-no-atendimento.md');
  assert.ok(existsSync(adrPath), 'ADR 0015 deve existir');

  const conteudo = readFileSync(adrPath, 'utf8');
  assert.match(conteudo, /Agentes de Voz Compartilhados/i);
  assert.match(conteudo, /hq_atendimento\.administradora/i);
  assert.match(conteudo, /019_administradora_no_atendimento_e_agentes_compartilhados\.sql/i);
  assert.match(conteudo, /salva-atendimento\.sql/i);
});

test('nomeDeAgenteEstaResolvido valida critérios de nome próprio resolvido', () => {
  // Inválidos: nulos ou vazios
  assert.equal(nomeDeAgenteEstaResolvido('agent_1', null), false);
  assert.equal(nomeDeAgenteEstaResolvido('agent_1', undefined), false);
  assert.equal(nomeDeAgenteEstaResolvido('agent_1', ''), false);
  assert.equal(nomeDeAgenteEstaResolvido('agent_1', '   '), false);
  assert.equal(nomeDeAgenteEstaResolvido('', 'Clara Teste'), false);

  // Inválidos: nome igual ao id (case-insensitive)
  assert.equal(nomeDeAgenteEstaResolvido('agent_abc', 'agent_abc'), false);
  assert.equal(nomeDeAgenteEstaResolvido('AGENT_ABC', 'agent_abc'), false);
  assert.equal(nomeDeAgenteEstaResolvido('agent_abc', 'AGENT_ABC'), false);
  assert.equal(nomeDeAgenteEstaResolvido('roteador-1', 'roteador-1'), false);
  assert.equal(nomeDeAgenteEstaResolvido('roteador-1', 'ROTEADOR-1'), false);
  assert.equal(nomeDeAgenteEstaResolvido('roteador-1', '  roteador-1  '), false);

  // Inválidos: iniciados pelo prefixo técnico agent_ (case-insensitive)
  assert.equal(nomeDeAgenteEstaResolvido('id-qualquer', 'agent_0101kn4pk9d4efet4ka1nt92e5mp'), false);
  assert.equal(nomeDeAgenteEstaResolvido('id-qualquer', 'Agent_0101kn4pk9d4efet4ka1nt92e5mp'), false);
  assert.equal(nomeDeAgenteEstaResolvido('id-qualquer', 'AGENT_0101kn4pk9d4efet4ka1nt92e5mp'), false);
  assert.equal(nomeDeAgenteEstaResolvido('id-qualquer', '  agent_teste'), false);

  // Válidos: nomes humanos resolvidos
  assert.equal(nomeDeAgenteEstaResolvido('affix-0800', 'Clara Affix 0800'), true);
  assert.equal(nomeDeAgenteEstaResolvido('agent_0101kn4pk9d4efet4ka1nt92e5mp', 'Clara Central Router'), true);
  assert.equal(nomeDeAgenteEstaResolvido('roteador-geral', 'Clara Roteador Geral'), true);
});

test('atendimentoEstaAvaliado reconhece avaliações da IA e do Curador', () => {
  // Não avaliado: recém-ingerido da fonte com nota 0 e sem veredito
  assert.equal(
    atendimentoEstaAvaliado({
      nota: 0,
      notaIa: 0,
      notaCurador: null,
      curadoria: false,
      avaliacaoDaIa: undefined,
      avaliacaoDoCurador: undefined
    }),
    false
  );

  // Avaliado pela IA com critérios/veredito
  assert.equal(
    atendimentoEstaAvaliado({
      nota: 8.5,
      notaIa: 8.5,
      notaCurador: null,
      curadoria: false,
      avaliacaoDaIa: {
        nota: 8.5,
        aprovacao: 'Aprovado',
        criterios: [
          { nome: 'Resolução da demanda', estado: 'Atendido', pontos: 1.5, critico: true }
        ]
      }
    }),
    true
  );

  // Avaliado pela IA mesmo com nota 0 (reprovado em todos os critérios)
  assert.equal(
    atendimentoEstaAvaliado({
      nota: 0,
      notaIa: 0,
      notaCurador: null,
      curadoria: false,
      avaliacaoDaIa: {
        nota: 0,
        aprovacao: 'Reprovado',
        criterios: [
          { nome: 'Resolução da demanda', estado: 'Não atendido', pontos: 0, critico: true }
        ]
      }
    }),
    true
  );

  // Avaliado com notaIa positiva mesmo sem objeto completo
  assert.equal(
    atendimentoEstaAvaliado({
      nota: 8.0,
      notaIa: 8.0,
      curadoria: false
    }),
    true
  );

  // Avaliado pelo Curador (curadoria true)
  assert.equal(
    atendimentoEstaAvaliado({
      nota: 7.0,
      notaIa: 0,
      notaCurador: 7.0,
      curadoria: true
    }),
    true
  );

  // Avaliado com objeto avaliacaoDoCurador
  assert.equal(
    atendimentoEstaAvaliado({
      nota: 0,
      curadoria: false,
      avaliacaoDoCurador: {
        nota: 6.0,
        notaDaAvaliacaoDaIa: 0,
        curador: 'Curador Humano',
        aprovacao: 'Reprovado',
        criterios: []
      } as any
    }),
    true
  );
});

test('listarAgentes exclui agentes com ID bruto ou sem Atendimento avaliado e inclui após resolução e avaliação', async () => {
  const app = await buildApp();

  try {
    const agoraIso = new Date().toISOString();
    const listaRegistros = (app.atendimentos as any).listar;
    assert.ok(listaRegistros, 'repositório em memória deve expor listar');
    const atendimentos = await app.atendimentos.listar();

    // 1. Agente com ID bruto (agent_...) mesmo com atendimento avaliado (nota 8) deve ser EXCLUÍDO
    (atendimentos as any[]).push({
      id: 'atend-bruto-avaliado',
      administradora: 'Affix' as const,
      agente: 'agent_0101kn4pk9d4efet4ka1nt92e5mp',
      agenteId: 'agent_0101kn4pk9d4efet4ka1nt92e5mp',
      conversa: 'conv-bruto-avaliado',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Boleto',
      nota: 8,
      notaIa: 8,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    });

    // 2. Agente cujo nome é igual ao próprio id (case-insensitive) mesmo com atendimento avaliado deve ser EXCLUÍDO
    (atendimentos as any[]).push({
      id: 'atend-nome-igual-id',
      administradora: 'Alter' as const,
      agente: 'clara-sem-resolucao',
      agenteId: 'CLARA-SEM-RESOLUCAO',
      conversa: 'conv-nome-igual-id',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Boleto',
      nota: 8,
      notaIa: 8,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    });

    // 3. Agente com nome resolvido, mas cujos atendimentos NÃO foram avaliados (nota 0, sem IA nem curadoria) deve ser EXCLUÍDO
    (atendimentos as any[]).push({
      id: 'atend-nome-resolvido-sem-avaliacao',
      administradora: 'Conectaplan' as const,
      agente: 'Clara Conectaplan Nova',
      agenteId: 'conecta-nova-sem-avaliacao',
      conversa: 'conv-sem-avaliacao',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Boleto',
      nota: 0,
      notaIa: 0,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    });

    // 4. Agente compartilhado resolvido com atendimentos avaliados em Affix e NÃO avaliados em Alter
    // Deve refletir administradorasAtendidas = ['Affix']
    (atendimentos as any[]).push({
      id: 'atend-comp-avaliado-affix',
      administradora: 'Affix' as const,
      agente: 'Clara Roteador Híbrido',
      agenteId: 'roteador-hibrido-id',
      conversa: 'conv-comp-affix-av',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Boleto',
      nota: 8.5,
      notaIa: 8.5,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    });
    (atendimentos as any[]).push({
      id: 'atend-comp-nao-avaliado-alter',
      administradora: 'Alter' as const,
      agente: 'Clara Roteador Híbrido',
      agenteId: 'roteador-hibrido-id',
      conversa: 'conv-comp-alter-sem-av',
      status: 'Em andamento',
      iniciadoEm: agoraIso,
      motivo: 'Boleto',
      nota: 0,
      notaIa: 0,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    });

    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const res = await app.inject({
      method: 'GET',
      url: '/agentes',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(res.statusCode, 200);
    const catalogo = res.json();
    const ids = catalogo.map((ag: any) => ag.id);

    // Exclusões verificadas:
    assert.equal(ids.includes('agent_0101kn4pk9d4efet4ka1nt92e5mp'), false, 'agente com id técnico deve ser excluído');
    assert.equal(ids.includes('CLARA-SEM-RESOLUCAO'), false, 'agente com nome igual ao id deve ser excluído');
    assert.equal(ids.includes('conecta-nova-sem-avaliacao'), false, 'agente sem atendimento avaliado deve ser excluído');

    // Inclusão verificada:
    assert.equal(ids.includes('roteador-hibrido-id'), true, 'agente nomeado e avaliado deve estar no catálogo');
    const agenteHibrido = catalogo.find((ag: any) => ag.id === 'roteador-hibrido-id');
    assert.equal(agenteHibrido.nome, 'Clara Roteador Híbrido');
    assert.deepEqual(agenteHibrido.administradorasAtendidas, ['Affix'], 'administradorasAtendidas deve incluir apenas atendimentos avaliados');

    // Agentes padrão da semente devem ser ocultados na presença do agente real
    assert.equal(ids.includes('affix-0800'), false);
    assert.equal(ids.includes('alter-1'), false);
  } finally {
    await app.close();
  }
});

test('listarAgentes retorna fallback da semente quando nenhum agente cumprir os critérios de avaliação e nome', async () => {
  const { repositorioEmMemoria } = await import('../../apps/api/src/modules/atendimentos/memoria.js');

  // 1. Repositório vazio: retorna semente padrão
  const repoVazio = repositorioEmMemoria([]);
  const catalogoVazio = await repoVazio.listarAgentes();
  assert.equal(catalogoVazio.length, 4);
  const idsVazio = catalogoVazio.map((a) => a.id);
  assert.ok(idsVazio.includes('affix-0800'));
  assert.ok(idsVazio.includes('affix-wa'));
  assert.ok(idsVazio.includes('alter-1'));
  assert.ok(idsVazio.includes('conecta-1'));

  // 2. Repositório contendo apenas agentes com id técnico ou não avaliados: deve acionar fallback
  const agoraIso = new Date().toISOString();
  const repoComAgentesInvalidos = repositorioEmMemoria([
    {
      id: 'atend-nao-avaliado',
      administradora: 'Affix',
      agente: 'Clara Affix Especial',
      agenteId: 'affix-especial-sem-av',
      conversa: 'conv-1',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Boleto',
      nota: 0,
      notaIa: 0,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    },
    {
      id: 'atend-com-id-tecnico',
      administradora: 'Alter',
      agente: 'agent_0101kn4pk9d4efet4ka1nt92e5mp',
      agenteId: 'agent_0101kn4pk9d4efet4ka1nt92e5mp',
      conversa: 'conv-2',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Boleto',
      nota: 8.5,
      notaIa: 8.5,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    }
  ]);

  const catalogoFallback = await repoComAgentesInvalidos.listarAgentes();
  assert.equal(catalogoFallback.length, 4, 'deve retornar fallback da semente com 4 agentes');
  const idsFallback = catalogoFallback.map((a) => a.id);
  assert.ok(idsFallback.includes('affix-0800'));
  assert.ok(idsFallback.includes('alter-1'));

  // 3. Assim que um agente válido (nome resolvido e atendimento avaliado) é inserido, semente é ocultada
  const atendimentos = (await repoComAgentesInvalidos.listar()) as any[];
  atendimentos.push({
    id: 'atend-valido',
    administradora: 'Conectaplan',
    agente: 'Clara Conectaplan Oficial',
    agenteId: 'conecta-oficial-id',
    conversa: 'conv-valida',
    status: 'Concluído',
    iniciadoEm: agoraIso,
    motivo: 'Dúvida',
    nota: 9,
    notaIa: 9,
    notaCurador: null,
    curadoria: false,
    transcricao: []
  });

  const catalogoComValido = await repoComAgentesInvalidos.listarAgentes();
  assert.equal(catalogoComValido.length, 1, 'deve retornar exclusivamente o agente válido');
  assert.equal(catalogoComValido[0].id, 'conecta-oficial-id');
  assert.equal(catalogoComValido[0].nome, 'Clara Conectaplan Oficial');
  assert.equal(catalogoComValido[0].administradora, 'Conectaplan');
  assert.deepEqual(catalogoComValido[0].administradorasAtendidas, ['Conectaplan']);
});
