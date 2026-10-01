import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deveRolarAteAFalaAtiva,
  exibirVoltarAoMomentoAtual,
  falaForaDeVista,
  gestoDaRolagem,
  indiceDoTurnoAtivo,
  inicioDaFalaEmSegundos,
  teclaSaltaParaAFala,
  tempoRelativoDaFala
} from '../../apps/web/src/features/atendimentos/transcricao.js';

test('tempo relativo da fala sai de iniciadoEm e do timestamp ISO do turno', () => {
  const tempo = tempoRelativoDaFala({
    quando: '2026-10-01T15:01:05.000Z',
    iniciadoEm: '2026-10-01T15:00:00.000Z'
  });

  assert.equal(tempo.texto, '01:05');
  assert.equal(tempo.titulo, '2026-10-01T15:01:05.000Z');
});

test('relógio já relativo vira mm:ss e não ganha título ISO', () => {
  const tempo = tempoRelativoDaFala({ quando: '0:12', iniciadoEm: '2026-10-01T15:00:00.000Z' });

  assert.equal(tempo.texto, '00:12');
  assert.equal(tempo.titulo, undefined);
});

test('diferença negativa da fala fica em 00:00', () => {
  const tempo = tempoRelativoDaFala({
    quando: '2026-10-01T14:59:00.000Z',
    iniciadoEm: '2026-10-01T15:00:00.000Z'
  });

  assert.equal(tempo.texto, '00:00');
  assert.equal(tempo.titulo, '2026-10-01T14:59:00.000Z');
});

test('fala sem instante utilizável mantém o texto original', () => {
  assert.deepEqual(tempoRelativoDaFala({ quando: '—' }), { texto: '—' });
  assert.deepEqual(tempoRelativoDaFala({ quando: '2026-10-01T15:01:05.000Z' }), {
    texto: '2026-10-01T15:01:05.000Z',
    titulo: '2026-10-01T15:01:05.000Z'
  });
});

test('início da fala em segundos usa o relógio ou a diferença com iniciadoEm', () => {
  assert.equal(inicioDaFalaEmSegundos({ quando: '1:05' }), 65);
  assert.equal(
    inicioDaFalaEmSegundos({
      quando: '2026-10-01T15:01:05.000Z',
      iniciadoEm: '2026-10-01T15:00:00.000Z'
    }),
    65
  );
  assert.equal(inicioDaFalaEmSegundos({ quando: '—' }), undefined);
});

test('turno ativo é a última fala cujo início já passou', () => {
  assert.equal(indiceDoTurnoAtivo([0, 12, 18], 15), 1);
  assert.equal(indiceDoTurnoAtivo([0, 12, 18], 0), 0);
  assert.equal(indiceDoTurnoAtivo([4, 12], 2), -1);
  assert.equal(indiceDoTurnoAtivo([0, 12, 18], 40), 2);
  assert.equal(indiceDoTurnoAtivo([0, 12], Number.NaN), -1);
});

test('gesto do usuário na caixa não é rolagem do programa', () => {
  assert.equal(gestoDaRolagem({ destino: null, anterior: 10, agora: 40 }), 'usuario');
});

test('botão voltar ao momento atual aparece com acompanhamento pausado e fala ativa fora de vista', () => {
  assert.equal(
    exibirVoltarAoMomentoAtual({ acompanhando: false, foraDeVista: true, haFalaAtiva: true }),
    true
  );
  assert.equal(
    exibirVoltarAoMomentoAtual({ acompanhando: true, foraDeVista: true, haFalaAtiva: true }),
    false
  );
  assert.equal(
    exibirVoltarAoMomentoAtual({ acompanhando: false, foraDeVista: false, haFalaAtiva: true }),
    false
  );
  assert.equal(
    exibirVoltarAoMomentoAtual({ acompanhando: false, foraDeVista: true, haFalaAtiva: false }),
    false
  );
});

test('fala ativa fora da caixa de rolagem fica fora de vista', () => {
  assert.equal(falaForaDeVista({ rolagem: 0, visivel: 100, topo: 120, altura: 40 }), true);
  assert.equal(falaForaDeVista({ rolagem: 0, visivel: 100, topo: 40, altura: 30 }), false);
  assert.equal(falaForaDeVista({ rolagem: 200, visivel: 100, topo: 40, altura: 30 }), true);
});

test('rolagem automática só com áudio tocando, acompanhamento ligado e fala ativa', () => {
  assert.equal(
    deveRolarAteAFalaAtiva({ tocando: true, acompanhando: true, haFalaAtiva: true }),
    true
  );
  assert.equal(
    deveRolarAteAFalaAtiva({ tocando: false, acompanhando: true, haFalaAtiva: true }),
    false
  );
  assert.equal(
    deveRolarAteAFalaAtiva({ tocando: true, acompanhando: false, haFalaAtiva: true }),
    false
  );
  assert.equal(
    deveRolarAteAFalaAtiva({ tocando: true, acompanhando: true, haFalaAtiva: false }),
    false
  );
});

test('Enter e espaço saltam a reprodução para a fala', () => {
  assert.equal(teclaSaltaParaAFala('Enter'), true);
  assert.equal(teclaSaltaParaAFala(' '), true);
  assert.equal(teclaSaltaParaAFala('ArrowDown'), false);
});

test('rolagem que se aproxima do destino segue sendo do programa', () => {
  assert.equal(gestoDaRolagem({ destino: 200, anterior: 0, agora: 40 }), 'programa');
  assert.equal(gestoDaRolagem({ destino: 200, anterior: 40, agora: 120 }), 'programa');
  assert.equal(gestoDaRolagem({ destino: 200, anterior: 180, agora: 199 }), 'chegou');
  assert.equal(gestoDaRolagem({ destino: 200, anterior: 80, agora: 20 }), 'usuario');
  assert.equal(gestoDaRolagem({ destino: null, anterior: 0, agora: 40 }), 'usuario');
});
