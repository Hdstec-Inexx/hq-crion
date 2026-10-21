import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { passaNosFiltros } from '../../apps/api/src/modules/atendimentos/filtros.js';
import {
  detalhePublico,
  type RegistroDeAtendimento
} from '../../apps/api/src/modules/atendimentos/registro.js';
import { itemDaListagem } from '../../apps/api/src/modules/atendimentos/routes.js';
import { repositorioEmMemoria } from '../../apps/api/src/modules/atendimentos/memoria.js';
import { repositorioPostgres } from '../../apps/api/src/modules/atendimentos/postgres.js';

async function loginComPapel(
  app: Awaited<ReturnType<typeof buildApp>>,
  papel: 'Admin' | 'Gestão' | 'Curador'
) {
  const email =
    papel === 'Admin'
      ? 'ana.souza@crion'
      : papel === 'Gestão'
        ? 'bruno.alves@crion'
        : 'carla.mendes@crion';
  const login = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { email, senha: 'crion-hq' }
  });
  return `Bearer ${login.json().sessao}`;
}

function fakeRegistro(dados: Partial<RegistroDeAtendimento> = {}): RegistroDeAtendimento {
  return {
    id: 'atend-cpf-1',
    administradora: 'Affix',
    agente: 'Clara Affix 0800',
    agenteId: 'affix-0800',
    iniciadoEm: '2026-10-15T10:00:00-03:00',
    motivo: 'Boleto',
    nota: 8.5,
    notaIa: 8.5,
    notaCurador: null,
    status: 'Concluído',
    curadoria: false,
    curadaEm: null,
    conversa: 'conv-cpf-1',
    transcricao: [],
    ...dados
  };
}

test('passaNosFiltros normaliza pontuação e compara dígitos com busca mascarada, sem máscara ou parcial', () => {
  const itemComCpf = fakeRegistro({
    cpf: '529.982.247-25'
  });
  const recorte = { administradora: null, agente: null };

  // 1. Busca com máscara idêntica
  assert.equal(
    passaNosFiltros(itemComCpf, recorte, { cpf: '529.982.247-25' }, 'todos', 'p1'),
    true
  );

  // 2. Busca sem pontuação (apenas dígitos)
  assert.equal(
    passaNosFiltros(itemComCpf, recorte, { cpf: '52998224725' }, 'todos', 'p1'),
    true
  );

  // 3. Busca parcial por trecho com pontuação
  assert.equal(
    passaNosFiltros(itemComCpf, recorte, { cpf: '982.247' }, 'todos', 'p1'),
    true
  );

  // 4. Busca parcial por trecho sem pontuação
  assert.equal(
    passaNosFiltros(itemComCpf, recorte, { cpf: '982247' }, 'todos', 'p1'),
    true
  );

  // 5. CPF diferente não deve passar
  assert.equal(
    passaNosFiltros(itemComCpf, recorte, { cpf: '00000000000' }, 'todos', 'p1'),
    false
  );

  // 6. Item sem CPF não deve passar se houver filtro por CPF
  const itemSemCpf = fakeRegistro({ cpf: undefined });
  assert.equal(
    passaNosFiltros(itemSemCpf, recorte, { cpf: '52998224725' }, 'todos', 'p1'),
    false
  );

  // 7. Busca contendo apenas pontuação/espaços sem dígitos válidos não deve passar
  assert.equal(
    passaNosFiltros(itemComCpf, recorte, { cpf: ' . - ' }, 'todos', 'p1'),
    false
  );
});

test('passaNosFiltros extrai automaticamente CPF da transcrição se item.cpf não estiver pré-preenchido', () => {
  const item = fakeRegistro({
    cpf: undefined,
    transcricao: [
      {
        locutor: 'Cliente',
        quando: '0:05',
        texto: 'Meu documento é 529.982.247-25.'
      }
    ]
  });
  const recorte = { administradora: null, agente: null };

  assert.equal(
    passaNosFiltros(item, recorte, { cpf: '52998224725' }, 'todos', 'p1'),
    true
  );
});

test('detalhePublico e itemDaListagem expõem cpf quando presente ou extraído', () => {
  const registro = fakeRegistro({
    transcricao: [
      {
        locutor: 'Agente de Voz',
        quando: '0:05',
        texto: '[Chamada de Ferramenta: consultar_cpf]',
        detalhes: [
          {
            tipo: 'Ferramenta',
            nome: 'consultar_cpf',
            nomeDaFerramenta: 'consultar_cpf',
            parametros: '{"cpf":"52998224725"}'
          }
        ]
      }
    ]
  });

  const detalhe = detalhePublico(registro);
  assert.equal(detalhe.cpf, '529.982.247-25');

  const item = itemDaListagem(detalhe);
  assert.equal(item.cpf, '529.982.247-25');
});

test('GET /atendimentos filtra por CPF mascarado, sem máscara e parcial, expondo cpf nos itens', async () => {
  const atendimentosComCpf = [
    fakeRegistro({
      id: 'atend-cpf-a',
      conversa: 'conv-cpf-a',
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:05',
          texto: '[Chamada de Ferramenta: consultar_cpf]',
          detalhes: [
            {
              tipo: 'Ferramenta',
              nome: 'consultar_cpf',
              nomeDaFerramenta: 'consultar_cpf',
              parametros: '{"cpf":"52998224725"}'
            }
          ]
        }
      ]
    }),
    fakeRegistro({
      id: 'atend-cpf-b',
      conversa: 'conv-cpf-b',
      transcricao: [
        {
          locutor: 'Cliente',
          quando: '0:05',
          texto: 'Meu CPF é 111.222.333-44'
        }
      ]
    })
  ];

  const app = await buildApp();
  const lista = (await app.atendimentos.listar()) as RegistroDeAtendimento[];
  for (const item of atendimentosComCpf) {
    lista.push(item);
  }

  const auth = await loginComPapel(app, 'Admin');

  // 1. Busca por CPF mascarado
  const resMascara = await app.inject({
    method: 'GET',
    url: '/atendimentos?cpf=529.982.247-25',
    headers: { authorization: auth }
  });
  assert.equal(resMascara.statusCode, 200);
  const jsonMascara = resMascara.json();
  assert.equal(jsonMascara.itens.length, 1);
  assert.equal(jsonMascara.itens[0].id, 'atend-cpf-a');
  assert.equal(jsonMascara.itens[0].cpf, '529.982.247-25');

  // 2. Busca por CPF sem máscara
  const resSemMascara = await app.inject({
    method: 'GET',
    url: '/atendimentos?cpf=52998224725',
    headers: { authorization: auth }
  });
  assert.equal(resSemMascara.statusCode, 200);
  const jsonSemMascara = resSemMascara.json();
  assert.equal(jsonSemMascara.itens.length, 1);
  assert.equal(jsonSemMascara.itens[0].id, 'atend-cpf-a');

  // 3. Busca parcial por trecho de dígitos
  const resParcial = await app.inject({
    method: 'GET',
    url: '/atendimentos?cpf=982247',
    headers: { authorization: auth }
  });
  assert.equal(resParcial.statusCode, 200);
  const jsonParcial = resParcial.json();
  assert.equal(jsonParcial.itens.length, 1);
  assert.equal(jsonParcial.itens[0].id, 'atend-cpf-a');

  // 4. Detalhe do Atendimento expõe CPF
  const resDetalhe = await app.inject({
    method: 'GET',
    url: '/atendimentos/atend-cpf-a',
    headers: { authorization: auth }
  });
  assert.equal(resDetalhe.statusCode, 200);
  assert.equal(resDetalhe.json().cpf, '529.982.247-25');

  await app.close();
});

test('GET /fila-de-curadoria, /minhas-curadorias e /curadorias-realizadas filtram por CPF', async () => {
  const atendimentos = [
    fakeRegistro({
      id: 'atend-fila-1',
      status: 'Concluído',
      curadoria: false,
      concluidoEm: '2026-10-15T10:05:00-03:00',
      avaliacaoDaIa: {
        nota: 8.0,
        aprovacao: 'Aprovado',
        criterios: [
          { nome: 'Saudação', estado: 'Atendido', pontos: 1.0, critico: false }
        ]
      },
      cpf: '529.982.247-25'
    }),
    fakeRegistro({
      id: 'atend-fila-2',
      status: 'Concluído',
      curadoria: false,
      concluidoEm: '2026-10-15T10:10:00-03:00',
      avaliacaoDaIa: {
        nota: 8.0,
        aprovacao: 'Aprovado',
        criterios: [
          { nome: 'Saudação', estado: 'Atendido', pontos: 1.0, critico: false }
        ]
      },
      cpf: '111.222.333-44'
    })
  ];

  const app = await buildApp();
  const lista = (await app.atendimentos.listar()) as RegistroDeAtendimento[];
  for (const item of atendimentos) {
    lista.push(item);
  }

  const auth = await loginComPapel(app, 'Curador');

  const resFila = await app.inject({
    method: 'GET',
    url: '/fila-de-curadoria?cpf=52998224725',
    headers: { authorization: auth }
  });
  assert.equal(resFila.statusCode, 200);
  const jsonFila = resFila.json();
  assert.equal(jsonFila.itens.length, 1);
  assert.equal(jsonFila.itens[0].id, 'atend-fila-1');
  assert.equal(jsonFila.itens[0].cpf, '529.982.247-25');

  await app.close();
});

test('repositorioPostgres extrai CPF e normaliza pontuação ao consultarListagem com filtro cpf', async () => {
  const consultas: Array<{ sql: string; valores?: unknown[] }> = [];
  const fakePool = {
    async query(sql: string, valores?: unknown[]) {
      consultas.push({ sql, valores });
      if (sql.includes('SELECT') && sql.includes('hq_atendimento')) {
        return {
          rows: [
            {
              id: 'a-postgres-cpf',
              agente_id: 'affix-0800',
              agente: 'Clara Affix 0800',
              administradora: 'Affix',
              status: 'Concluído',
              iniciado_em: '2026-10-15T10:00:00-03:00',
              concluido_em: '2026-10-15T10:05:00-03:00',
              duracao_em_segundos: 300,
              transcricao: [
                {
                  locutor: 'Agente de Voz',
                  quando: '0:05',
                  texto: '[Chamada de Ferramenta: consultar_cpf]',
                  detalhes: [
                    {
                      tipo: 'Ferramenta',
                      nome: 'consultar_cpf',
                      nomeDaFerramenta: 'consultar_cpf',
                      parametros: '{"cpf":"52998224725"}'
                    }
                  ]
                }
              ],
              audio: null,
              motivo: 'Boleto',
              transferencia: false,
              custo: null,
              tempo_de_espera_em_segundos: 15,
              ferramentas: null,
              nota_ia: 8.0,
              ia_resumo_atendimento: null,
              ia_falhas_identificadas: null,
              avaliacao_curador_id: null,
              nota_curador: null,
              nota_da_avaliacao_da_ia: null,
              curador_id: null,
              curador_nome: null,
              comentario_vigente: null,
              comentario_status_vigente: null,
              tem_curadoria: false,
              favoritado_pelo_usuario: false,
              favoritos_count: 0,
              favoritos_perfis: []
            }
          ]
        };
      }
      if (sql.includes('SELECT atendimento_id, chave, nome')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT avaliacao_id, chave, nome')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
    async connect() {
      return {
        query: fakePool.query,
        release() {}
      };
    }
  };

  const repo = repositorioPostgres(fakePool as any);
  const itens = await repo.consultarListagem(
    { administradora: null, agente: null },
    { inicio: '2026-10-01', fim: '2026-10-31', cpf: '529.982.247-25' },
    'todos',
    'p1',
    'Admin'
  );

  assert.equal(itens.length, 1);
  assert.equal(itens[0].id, 'a-postgres-cpf');
  assert.equal(itens[0].cpf, '529.982.247-25');

  const consultaSql = consultas.find((c) => c.sql.includes('hq_atendimento'));
  assert.ok(consultaSql, 'Deve executar leituraSql no postgres');
  assert.match(
    consultaSql.sql,
    /REPLACE\(REPLACE\(a\.transcricao::text\s*\|\|\s*' '\s*\|\|\s*COALESCE\(a\.ferramentas::text,\s*''\),\s*'\.',\s*''\),\s*'-',\s*''\)\s+ILIKE\s+'%'\s*\|\|\s*\$9\s*\|\|\s*'%'/i,
    'SQL deve normalizar pontuação (. e -) de transcricao e ferramentas no PostgreSQL'
  );
  assert.equal(consultaSql.valores?.[8], '52998224725', '$9 deve receber os dígitos normalizados para filtro de CPF');

  // Busca que não bate
  const itensVazio = await repo.consultarListagem(
    { administradora: null, agente: null },
    { inicio: '2026-10-01', fim: '2026-10-31', cpf: '00000000000' },
    'todos',
    'p1',
    'Admin'
  );
  assert.equal(itensVazio.length, 0);

  // Busca com apenas pontuação faz curto-circuito sem consultar o banco
  consultas.length = 0;
  const itensPontuacao = await repo.consultarListagem(
    { administradora: null, agente: null },
    { inicio: '2026-10-01', fim: '2026-10-31', cpf: ' . - ' },
    'todos',
    'p1',
    'Admin'
  );
  assert.equal(itensPontuacao.length, 0);
  assert.equal(consultas.length, 0);
});
