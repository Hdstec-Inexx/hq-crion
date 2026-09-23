import assert from 'node:assert/strict';
import test from 'node:test';
import {
  barraContinuaVisivel,
  reproducaoEmCurso,
  saltoDeTrintaSegundos,
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
      reproducaoEmCurso: true
    }),
    true
  );
});

test('barra não aparece sem áudio, com áudio encerrado ou com o player principal na tela', () => {
  assert.equal(
    barraContinuaVisivel({
      playerPrincipalForaDaTela: true,
      audioPresente: false,
      reproducaoEmCurso: true
    }),
    false
  );
  assert.equal(
    barraContinuaVisivel({
      playerPrincipalForaDaTela: true,
      audioPresente: true,
      reproducaoEmCurso: false
    }),
    false
  );
  assert.equal(
    barraContinuaVisivel({
      playerPrincipalForaDaTela: false,
      audioPresente: true,
      reproducaoEmCurso: true
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

test('velocidade fora da lista cai em 1×', () => {
  assert.equal(velocidadeDoPlayer(1.25), 1.25);
  assert.equal(velocidadeDoPlayer(3), 1);
});
