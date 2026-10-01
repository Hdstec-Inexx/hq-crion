import assert from 'node:assert/strict';
import test from 'node:test';
import {
  barraContinuaVisivel,
  instanteDaBuscaNaOnda,
  posicaoDoAudio,
  reproducaoEmCurso,
  saltoDeTrintaSegundos,
  saltoDeTrintaSegundosParaFrente,
  saltoDeTrintaSegundosParaTras,
  velocidadeDoPlayer,
  velocidadesDoPlayer
} from '../../apps/web/src/features/atendimentos/player.js';

test('Player oferece 0,5×, 1×, 1,25×, 1,5× e 2×', () => {
  assert.deepEqual(velocidadesDoPlayer, [0.5, 1, 1.25, 1.5, 2]);
});

test('barra continua só com player principal fora da tela, áudio presente e reprodução em curso', () => {
  assert.equal(
    barraContinuaVisivel({
      playerPrincipalForaDaTela: true,
      audioPresente: true,
      emCurso: true
    }),
    true
  );
});

test('barra não aparece sem áudio, com áudio encerrado ou com o player principal na tela', () => {
  assert.equal(
    barraContinuaVisivel({
      playerPrincipalForaDaTela: true,
      audioPresente: false,
      emCurso: true
    }),
    false
  );
  assert.equal(
    barraContinuaVisivel({
      playerPrincipalForaDaTela: true,
      audioPresente: true,
      emCurso: false
    }),
    false
  );
  assert.equal(
    barraContinuaVisivel({
      playerPrincipalForaDaTela: false,
      audioPresente: true,
      emCurso: true
    }),
    false
  );
});

test('reprodução em curso é a iniciada que ainda não encerrou', () => {
  assert.equal(reproducaoEmCurso({ iniciada: true, encerrada: false }), true);
  assert.equal(reproducaoEmCurso({ iniciada: false, encerrada: false }), false);
  assert.equal(reproducaoEmCurso({ iniciada: true, encerrada: true }), false);
});

test('salto avança 30 segundos e não passa da duração', () => {
  assert.equal(saltoDeTrintaSegundos(10, 120), 40);
  assert.equal(saltoDeTrintaSegundos(100, 120), 120);
});

test('salto para trás recua 30 segundos e não passa de zero', () => {
  assert.equal(saltoDeTrintaSegundosParaTras(50, 120), 20);
  assert.equal(saltoDeTrintaSegundosParaTras(10, 120), 0);
});

test('salto para frente avança 30 segundos e não passa da duração', () => {
  assert.equal(saltoDeTrintaSegundosParaFrente(10, 120), 40);
  assert.equal(saltoDeTrintaSegundosParaFrente(100, 120), 120);
});

test('saltos permanecem no intervalo da duração mesmo com posição ou duração inválidas', () => {
  assert.equal(saltoDeTrintaSegundosParaTras(-10, 120), 0);
  assert.equal(saltoDeTrintaSegundosParaFrente(200, 120), 120);
  assert.equal(saltoDeTrintaSegundosParaTras(40, 0), 0);
  assert.equal(saltoDeTrintaSegundosParaFrente(40, Number.NaN), 0);
  assert.equal(saltoDeTrintaSegundosParaTras(Number.NaN, 90), 0);
});

test('busca na onda converte o ponto do ponteiro no instante do áudio', () => {
  assert.equal(instanteDaBuscaNaOnda(0, 200, 80), 0);
  assert.equal(instanteDaBuscaNaOnda(50, 200, 80), 20);
  assert.equal(instanteDaBuscaNaOnda(200, 200, 80), 80);
});

test('busca na onda não sai do intervalo quando o ponteiro ou a faixa são inválidos', () => {
  assert.equal(instanteDaBuscaNaOnda(-20, 200, 80), 0);
  assert.equal(instanteDaBuscaNaOnda(260, 200, 80), 80);
  assert.equal(instanteDaBuscaNaOnda(40, 0, 80), 0);
  assert.equal(instanteDaBuscaNaOnda(40, 200, 0), 0);
  assert.equal(instanteDaBuscaNaOnda(Number.NaN, 200, 80), 0);
});

test('velocidade fora da lista cai em 1×', () => {
  assert.equal(velocidadeDoPlayer(1.25), 1.25);
  assert.equal(velocidadeDoPlayer(3), 1);
});

test('posição do áudio ignora NaN e não passa da duração', () => {
  assert.equal(posicaoDoAudio(Number.NaN, 120), 0);
  assert.equal(posicaoDoAudio(40, 120), 40);
  assert.equal(posicaoDoAudio(200, 120), 120);
});
