import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  agenteCompativelComAdministradora,
  agentesCompativeisComAdministradora,
  agentesDeVoz,
  escreverRecorteNaQuery,
  lerRecorte,
  queryDoRecorte,
  type Administradora,
  type AgenteDeVoz
} from '../../packages/contracts/src/recorte.js';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import { resolverRecorteDaQuery } from '../../apps/api/src/modules/atendimentos/filtros.js';

const raiz = process.cwd();

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

const catalogoExemplo: AgenteDeVoz[] = [
  {
    id: 'agente-affix-dedicado',
    nome: 'Clara Affix Especial',
    administradora: 'Affix',
    administradorasAtendidas: ['Affix']
  },
  {
    id: 'agente-alter-dedicado',
    nome: 'Clara Alter Especial',
    administradora: 'Alter',
    administradorasAtendidas: ['Alter']
  },
  {
    id: 'agente-compartilhado-1',
    nome: 'Clara Roteador Central',
    administradora: null,
    administradorasAtendidas: ['Affix', 'Alter']
  },
  {
    id: 'agente-compartilhado-conectaplan',
    nome: 'Clara Triagem Conecta',
    administradora: null,
    administradorasAtendidas: ['Conectaplan']
  }
];

test('lerRecorte e escreverRecorteNaQuery aceitam agente sem administradora (Todas)', () => {
  // 1. lerRecorte aceita agente sem administradora
  const recorteSemAdm = lerRecorte({ agente: 'affix-0800' });
  assert.deepEqual(recorteSemAdm, {
    administradora: null,
    agente: 'affix-0800'
  });

  // 2. escreverRecorteNaQuery preserva agente quando administradora está em "" (Todas)
  const queryInicial = new URLSearchParams('status=Conclu%C3%ADdo&pagina=2');
  const proxima = escreverRecorteNaQuery(queryInicial, '', 'affix-0800', {
    resetarPagina: true
  });
  assert.equal(proxima.get('agente'), 'affix-0800');
  assert.equal(proxima.get('administradora'), null);
  assert.equal(proxima.get('status'), 'Concluído');
  assert.equal(proxima.get('pagina'), null);

  // 3. queryDoRecorte produz query string apenas com agente
  const qs = queryDoRecorte({ administradora: null, agente: 'affix-0800' });
  assert.equal(qs.get('agente'), 'affix-0800');
  assert.equal(qs.get('administradora'), null);

  // 4. Round-trip entre URL e contrato sem administradora
  const lido = lerRecorte(Object.fromEntries(qs.entries()));
  assert.deepEqual(lido, { administradora: null, agente: 'affix-0800' });
});

test('lerRecorte aceita agentes dinâmicos e recusa apenas combinações incompatíveis', () => {
  // Agente dinâmico fora dos 4 itens estáticos é aceito sem administradora
  const dinamicoSemAdm = lerRecorte({ agente: 'agente-dinamico-123' });
  assert.deepEqual(dinamicoSemAdm, {
    administradora: null,
    agente: 'agente-dinamico-123'
  });

  // Agente dinâmico fora dos 4 itens aceito com administradora quando não incompatível
  const dinamicoComAdm = lerRecorte({
    administradora: 'Affix',
    agente: 'agente-dinamico-123'
  });
  assert.deepEqual(dinamicoComAdm, {
    administradora: 'Affix',
    agente: 'agente-dinamico-123'
  });

  // Agente compartilhado do catálogo aceito com Administradora em que atuou ou qualquer uma
  const compartilhado = lerRecorte(
    { administradora: 'Affix', agente: 'agente-compartilhado-1' },
    catalogoExemplo
  );
  assert.deepEqual(compartilhado, {
    administradora: 'Affix',
    agente: 'agente-compartilhado-1'
  });

  // Agente dedicado do catálogo é aceito com sua própria Administradora
  const dedicadoCerto = lerRecorte(
    { administradora: 'Affix', agente: 'agente-affix-dedicado' },
    catalogoExemplo
  );
  assert.deepEqual(dedicadoCerto, {
    administradora: 'Affix',
    agente: 'agente-affix-dedicado'
  });

  // Incompatível: agente dedicado à Alter filtrado com Affix é recusado
  assert.throws(
    () =>
      lerRecorte(
        { administradora: 'Affix', agente: 'agente-alter-dedicado' },
        catalogoExemplo
      ),
    /Recorte inválido/
  );

  // Incompatível da semente: alter-1 filtrado com Affix é recusado
  assert.throws(
    () => lerRecorte({ administradora: 'Affix', agente: 'alter-1' }),
    /Recorte inválido/
  );
});

test('agentesCompativeisComAdministradora filtra agentes dedicados e compartilhados atuantes', () => {
  // Com Administradora em "Todas" (null), lista todos os agentes
  const todos = agentesCompativeisComAdministradora(catalogoExemplo, null);
  assert.equal(todos.length, 4);

  // Com Administradora Affix: dedicado Affix + compartilhado que atuou em Affix
  const affix = agentesCompativeisComAdministradora(catalogoExemplo, 'Affix');
  const idsAffix = affix.map((a) => a.id);
  assert.ok(idsAffix.includes('agente-affix-dedicado'));
  assert.ok(idsAffix.includes('agente-compartilhado-1'));
  assert.ok(!idsAffix.includes('agente-alter-dedicado'));
  assert.ok(!idsAffix.includes('agente-compartilhado-conectaplan'));

  // Com Administradora Conectaplan: compartilhado Conectaplan, sem os outros
  const conecta = agentesCompativeisComAdministradora(catalogoExemplo, 'Conectaplan');
  const idsConecta = conecta.map((a) => a.id);
  assert.ok(idsConecta.includes('agente-compartilhado-conectaplan'));
  assert.ok(!idsConecta.includes('agente-affix-dedicado'));
  assert.ok(!idsConecta.includes('agente-alter-dedicado'));
  assert.ok(!idsConecta.includes('agente-compartilhado-1'));
});

test('escreverRecorteNaQuery preserva agente compatível e limpa dedicado a outra Administradora', () => {
  const params = new URLSearchParams();

  // 1. Agente dedicado à Affix com Administradora Affix é preservado
  const q1 = escreverRecorteNaQuery(params, 'Affix', 'affix-0800');
  assert.equal(q1.get('administradora'), 'Affix');
  assert.equal(q1.get('agente'), 'affix-0800');

  // 2. Agente dedicado à Affix ao selecionar Alter é limpo para "" (não gravado)
  const q2 = escreverRecorteNaQuery(params, 'Alter', 'affix-0800');
  assert.equal(q2.get('administradora'), 'Alter');
  assert.equal(q2.get('agente'), null);

  // 3. Agente compartilhado do catálogo ao selecionar Affix é preservado
  const q3 = escreverRecorteNaQuery(params, 'Affix', 'agente-compartilhado-1', {
    catalogo: catalogoExemplo
  });
  assert.equal(q3.get('administradora'), 'Affix');
  assert.equal(q3.get('agente'), 'agente-compartilhado-1');

  // 4. Agente compartilhado ao retornar para "Todas" é preservado na URL
  const q4 = escreverRecorteNaQuery(params, '', 'agente-compartilhado-1', {
    catalogo: catalogoExemplo
  });
  assert.equal(q4.get('administradora'), null);
  assert.equal(q4.get('agente'), 'agente-compartilhado-1');
});

test('RecorteCascata mantém seletor de Agente de Voz sempre habilitado e carrega dinamicamente', () => {
  const arquivoRecorte = readFileSync(
    join(raiz, 'apps/web/src/features/recorte/RecorteCascata.tsx'),
    'utf8'
  );
  const arquivoApi = readFileSync(
    join(raiz, 'apps/web/src/features/recorte/api.ts'),
    'utf8'
  );

  // 1. RecorteCascata NUNCA desabilita o seletor de Agente de Voz
  assert.doesNotMatch(
    arquivoRecorte,
    /disabled=\{!administradora\}/,
    'Não deve desabilitar o Agente de Voz quando Administradora for Todas'
  );
  assert.doesNotMatch(
    arquivoRecorte,
    /disabled=/,
    'Seletor de Agente de Voz deve permanecer sempre habilitado'
  );

  // 2. Carrega dinamicamente a lista de agentes da API
  assert.match(arquivoRecorte, /buscarAgentes/);
  assert.match(arquivoApi, /\/agentes/);
  assert.match(arquivoApi, /catalogoAgentesResponseSchema/);

  // 3. Usa filtragem de agentes compatíveis por administradora
  assert.match(arquivoRecorte, /agentesCompativeisComAdministradora/);
  assert.match(arquivoRecorte, /agenteCompativelComAdministradora/);

  // 4. Validação lógica da compatibilidade em transições:
  const dedicadoAffix = catalogoExemplo[0]; // agente-affix-dedicado
  const dedicadoAlter = catalogoExemplo[1]; // agente-alter-dedicado
  const compartilhado = catalogoExemplo[2]; // agente-compartilhado-1 (Affix, Alter)

  // Em Todas (null), qualquer agente é compatível
  assert.equal(agenteCompativelComAdministradora(dedicadoAffix, null), true);
  assert.equal(agenteCompativelComAdministradora(compartilhado, null), true);

  // Em Affix: dedicado Affix é compatível; dedicado Alter é incompatível
  assert.equal(agenteCompativelComAdministradora(dedicadoAffix, 'Affix'), true);
  assert.equal(agenteCompativelComAdministradora(dedicadoAlter, 'Affix'), false);

  // Em Affix: compartilhado que atuou em Affix é compatível
  assert.equal(agenteCompativelComAdministradora(compartilhado, 'Affix'), true);

  // Em Conectaplan: compartilhado que NÃO atuou em Conectaplan é incompatível
  assert.equal(agenteCompativelComAdministradora(compartilhado, 'Conectaplan'), false);
});

test('Rotas da API com Recorte filtram corretamente por agente sem administradora e por agente compartilhado', async () => {
  const app = await buildApp();

  try {
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');

    // Insere atendimentos de teste para verificar a filtragem
    const agoraIso = new Date().toISOString();
    const atendimento1 = {
      id: 'atend-dedicado-affix-recorte',
      administradora: 'Affix' as const,
      agente: 'Clara Affix 0800',
      agenteId: 'affix-0800',
      conversa: 'conv-affix-recorte-1',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Boleto',
      nota: 9,
      notaIa: 9,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    };
    const atendimento2 = {
      id: 'atend-compartilhado-affix-recorte',
      administradora: 'Affix' as const,
      agente: 'Clara Roteador Geral',
      agenteId: 'roteador-geral-teste',
      conversa: 'conv-comp-affix-recorte',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Dúvida',
      nota: 8,
      notaIa: 8,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    };
    const atendimento3 = {
      id: 'atend-compartilhado-alter-recorte',
      administradora: 'Alter' as const,
      agente: 'Clara Roteador Geral',
      agenteId: 'roteador-geral-teste',
      conversa: 'conv-comp-alter-recorte',
      status: 'Concluído',
      iniciadoEm: agoraIso,
      motivo: 'Reclamação',
      nota: 7,
      notaIa: 7,
      notaCurador: null,
      curadoria: false,
      transcricao: []
    };

    const repoMemoria = app.atendimentos as any;
    if (repoMemoria.listar) {
      const lista = await repoMemoria.listar();
      lista.push(atendimento1, atendimento2, atendimento3);
    }

    // 1. GET /atendimentos apenas com ?agente=<id> (sem administradora)
    const resAtendimentosApenasAgente = await app.inject({
      method: 'GET',
      url: '/atendimentos?agente=roteador-geral-teste',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(resAtendimentosApenasAgente.statusCode, 200);
    const bodyAtendimentosAgente = resAtendimentosApenasAgente.json();
    assert.equal(bodyAtendimentosAgente.recorte.administradora, null);
    assert.equal(bodyAtendimentosAgente.recorte.agente, 'roteador-geral-teste');
    // Deve incluir atendimentos do agente compartilhado em ambas as administradoras
    const idsAgente = bodyAtendimentosAgente.itens.map((it: any) => it.id);
    assert.ok(idsAgente.includes('atend-compartilhado-affix-recorte'));
    assert.ok(idsAgente.includes('atend-compartilhado-alter-recorte'));
    assert.ok(!idsAgente.includes('atend-dedicado-affix-recorte'));

    // 2. GET /atendimentos com administradora e agente compartilhado
    const resAtendimentosAdmEAgente = await app.inject({
      method: 'GET',
      url: '/atendimentos?administradora=Affix&agente=roteador-geral-teste',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(resAtendimentosAdmEAgente.statusCode, 200);
    const bodyAtendimentosAdmEAgente = resAtendimentosAdmEAgente.json();
    const idsAffixAgente = bodyAtendimentosAdmEAgente.itens.map((it: any) => it.id);
    assert.ok(idsAffixAgente.includes('atend-compartilhado-affix-recorte'));
    assert.ok(!idsAffixAgente.includes('atend-compartilhado-alter-recorte'));

    // 3. GET /atendimentos com combinação incompatível deve retornar 400
    const resAtendimentosIncompativel = await app.inject({
      method: 'GET',
      url: '/atendimentos?administradora=Alter&agente=affix-0800',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(resAtendimentosIncompativel.statusCode, 400);

    // 4. GET /dashboard apenas com ?agente=<id>
    const resDashboard = await app.inject({
      method: 'GET',
      url: '/dashboard?agente=affix-0800',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(resDashboard.statusCode, 200);
    const bodyDashboard = resDashboard.json();
    assert.equal(bodyDashboard.recorte.administradora, null);
    assert.equal(bodyDashboard.recorte.agente, 'affix-0800');

    // 5. GET /dashboard com combinação incompatível retorna 400
    const resDashboardIncompativel = await app.inject({
      method: 'GET',
      url: '/dashboard?administradora=Affix&agente=alter-1',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(resDashboardIncompativel.statusCode, 400);

    // 6. GET /cancelamentos apenas com ?agente=<id>
    const resCancelamentos = await app.inject({
      method: 'GET',
      url: '/cancelamentos?agente=affix-0800',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(resCancelamentos.statusCode, 200);
    const bodyCancelamentos = resCancelamentos.json();
    assert.equal(bodyCancelamentos.recorte.administradora, null);
    assert.equal(bodyCancelamentos.recorte.agente, 'affix-0800');

    // 7. GET /cancelamentos com combinação incompatível retorna 400
    const resCancelamentosIncompativel = await app.inject({
      method: 'GET',
      url: '/cancelamentos?administradora=Affix&agente=alter-1',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(resCancelamentosIncompativel.statusCode, 400);

    // 8. GET /fila-de-curadoria apenas com ?agente=<id>
    const resFilaCuradoria = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?agente=affix-0800',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(resFilaCuradoria.statusCode, 200);
    assert.equal(resFilaCuradoria.json().recorte.agente, 'affix-0800');

    // 9. GET /favoritos apenas com ?agente=<id>
    const resFavoritos = await app.inject({
      method: 'GET',
      url: '/favoritos?agente=affix-0800',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resFavoritos.statusCode, 200);
    assert.equal(resFavoritos.json().recorte.agente, 'affix-0800');

    // 10. GET /manutencao apenas com ?agente=<id>
    const resManutencao = await app.inject({
      method: 'GET',
      url: '/manutencao?agente=affix-0800',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resManutencao.statusCode, 200);
    assert.equal(resManutencao.json().recorte.agente, 'affix-0800');

    // 11. GET /monitoramento apenas com ?agente=<id>
    const resMonitoramento = await app.inject({
      method: 'GET',
      url: '/monitoramento?agente=affix-0800',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(resMonitoramento.statusCode, 200);
    assert.equal(resMonitoramento.json().recorte.agente, 'affix-0800');
  } finally {
    await app.close();
  }
});

test('ADR 0016 documenta seletor de agente de voz sempre ativo e filtragem contextual', () => {
  const adr = readFileSync(
    join(raiz, 'docs/adr/0016-seletor-de-agente-de-voz-sempre-ativo-no-recorte.md'),
    'utf8'
  );

  assert.match(adr, /RecorteCascata/i);
  assert.match(adr, /sempre habilitado|sempre ativo/i);
  assert.match(adr, /Todas/i);
  assert.match(adr, /compartilhados/i);
  assert.match(adr, /dedicados/i);
  assert.match(adr, /preservado|preservação/i);
});

test('segurança: parâmetros de agente com comprimento excessivo são rejeitados', () => {
  const agenteGigante = 'a'.repeat(201);
  assert.throws(
    () => lerRecorte({ agente: agenteGigante }),
    /Recorte inválido/
  );

  const query = escreverRecorteNaQuery(new URLSearchParams(), '', agenteGigante);
  assert.equal(query.get('agente'), null, 'agente com mais de 200 caracteres deve ser descartado');
});

test('desempenho: resolverRecorteDaQuery não consulta o banco desnecessariamente', async () => {
  let chamadasAoBanco = 0;
  const mockObterCatalogo = async () => {
    chamadasAoBanco += 1;
    return catalogoExemplo;
  };

  // 1. Sem agente: 0 consultas ao banco
  const r1 = await resolverRecorteDaQuery({ administradora: 'Affix' }, mockObterCatalogo);
  assert.equal(r1?.administradora, 'Affix');
  assert.equal(r1?.agente, null);
  assert.equal(chamadasAoBanco, 0);

  // 2. Sem administradora (Todas): 0 consultas ao banco
  const r2 = await resolverRecorteDaQuery({ agente: 'agente-dinamico-xyz' }, mockObterCatalogo);
  assert.equal(r2?.administradora, null);
  assert.equal(r2?.agente, 'agente-dinamico-xyz');
  assert.equal(chamadasAoBanco, 0);

  // 3. Agente da semente estática: valida em memória com 0 consultas ao banco
  const r3 = await resolverRecorteDaQuery({ administradora: 'Affix', agente: 'affix-0800' }, mockObterCatalogo);
  assert.equal(r3?.administradora, 'Affix');
  assert.equal(r3?.agente, 'affix-0800');
  assert.equal(chamadasAoBanco, 0);

  const r3Invalido = await resolverRecorteDaQuery({ administradora: 'Affix', agente: 'alter-1' }, mockObterCatalogo);
  assert.equal(r3Invalido, undefined);
  assert.equal(chamadasAoBanco, 0);

  // 4. Apenas agente dinâmico com Administradora específica consulta o catálogo
  const r4 = await resolverRecorteDaQuery(
    { administradora: 'Affix', agente: 'agente-affix-dedicado' },
    mockObterCatalogo
  );
  assert.equal(r4?.administradora, 'Affix');
  assert.equal(r4?.agente, 'agente-affix-dedicado');
  assert.equal(chamadasAoBanco, 1);
});

test('desempenho: buscarAgentes implementa cache em memória e reaproveitamento de promessa em voo', () => {
  const codigoApi = readFileSync(
    join(raiz, 'apps/web/src/features/recorte/api.ts'),
    'utf8'
  );

  assert.match(codigoApi, /catalogoCache/);
  assert.match(codigoApi, /promessaEmVoo/);
  assert.match(codigoApi, /limparCacheCatalogoAgentes/);
});
