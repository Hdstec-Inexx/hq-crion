import assert from 'node:assert/strict';
import test from 'node:test';
import { periodoDaListagem, periodoDoDashboard } from '../../packages/contracts/src/recorte.js';

const agora = new Date('2026-10-05T15:00:00-03:00');

test('listagem sem data observa o mês civil inteiro', () => {
  assert.deepEqual(periodoDaListagem({}, agora), {
    inicio: '2026-10-01',
    fim: '2026-10-31'
  });
});

test('listagem só com a inicial observa esse único dia', () => {
  assert.deepEqual(periodoDaListagem({ inicio: '2026-10-05' }, agora), {
    inicio: '2026-10-05',
    fim: '2026-10-05'
  });
});

test('listagem com as duas datas observa o intervalo fechado', () => {
  assert.deepEqual(
    periodoDaListagem({ inicio: '2020-01-01', fim: '2021-01-01' }, agora),
    { inicio: '2020-01-01', fim: '2021-01-01' }
  );
});

test('listagem recusa só a final, inicial posterior à final, mais de um ano e data inválida', () => {
  assert.equal(periodoDaListagem({ fim: '2026-10-05' }, agora), undefined);
  assert.equal(
    periodoDaListagem({ inicio: '2026-10-06', fim: '2026-10-05' }, agora),
    undefined
  );
  assert.equal(
    periodoDaListagem({ inicio: '2020-01-01', fim: '2021-01-02' }, agora),
    undefined
  );
  assert.equal(
    periodoDaListagem({ inicio: '2020-01-01', fim: 'nao-e-data' }, agora),
    undefined
  );
  assert.equal(periodoDaListagem({ inicio: '2026-02-31' }, agora), undefined);
  assert.equal(
    periodoDaListagem({ inicio: '2026-13-01', fim: '2026-13-02' }, agora),
    undefined
  );
});

test('dashboard sem data vai do dia 1 até hoje', () => {
  assert.deepEqual(periodoDoDashboard({}, agora), {
    inicio: '2026-10-01',
    fim: '2026-10-05'
  });
});

test('dashboard sem uma das datas completa com a janela até hoje e recusa par inválido', () => {
  assert.deepEqual(periodoDoDashboard({ inicio: '2026-10-03' }, agora), {
    inicio: '2026-10-03',
    fim: '2026-10-05'
  });
  assert.deepEqual(periodoDoDashboard({ fim: '2026-10-04' }, agora), {
    inicio: '2026-10-01',
    fim: '2026-10-04'
  });
  assert.equal(periodoDoDashboard({ inicio: '2026-10-06' }, agora), undefined);
  assert.equal(
    periodoDoDashboard({ inicio: '2020-01-01', fim: '2021-01-02' }, agora),
    undefined
  );
});
