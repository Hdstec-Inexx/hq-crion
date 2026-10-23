import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  deveAbrirAtendimentoPeloClique,
  deveAbrirAtendimentoPeloTeclado
} from '../../apps/web/src/features/atendimentos/acaoLinhaListagem.js';

test('Abertura do Atendimento ao clicar na linha inteira nas listagens operacionais e Monitoramento ao Vivo (Issue #186)', () => {
  // 1. Lógica isolada de acionamento por clique (deveAbrirAtendimentoPeloClique)
  const celulaGenerica = {
    closest: (sel: string) => (sel.includes('div') || sel.includes('article') ? {} : null)
  };
  const textoMetadados = {
    closest: (sel: string) => null
  };
  const badgeLink = {
    closest: (sel: string) => (sel.includes('a') ? badgeLink : null)
  };
  const textoDentroDoBadge = {
    parentElement: badgeLink
  };
  const linkTextualPrincipal = {
    closest: (sel: string) => (sel.includes('a') ? linkTextualPrincipal : null)
  };
  const botaoFavorito = {
    closest: (sel: string) => (sel.includes('button') ? botaoFavorito : null)
  };
  const iconeDentroDoBotaoFavorito = {
    parentElement: botaoFavorito
  };
  const botaoMarcarResolvido = {
    closest: (sel: string) => (sel.includes('button') ? botaoMarcarResolvido : null)
  };

  // Clique em qualquer área comum da linha deve abrir o atendimento
  assert.equal(deveAbrirAtendimentoPeloClique(celulaGenerica, false), true);
  assert.equal(deveAbrirAtendimentoPeloClique(textoMetadados, false), true);

  // Não deve abrir o atendimento se o usuário realizou seleção de texto na linha
  assert.equal(deveAbrirAtendimentoPeloClique(celulaGenerica, true), false);
  assert.equal(deveAbrirAtendimentoPeloClique(textoMetadados, true), false);

  // Clique direto no badge de Administradora (ou em seus nós internos) não dispara a linha
  assert.equal(deveAbrirAtendimentoPeloClique(badgeLink, false), false);
  assert.equal(deveAbrirAtendimentoPeloClique(textoDentroDoBadge, false), false);

  // Clique direto no botão de Favorito (ou nós internos) não dispara a abertura da linha
  assert.equal(deveAbrirAtendimentoPeloClique(botaoFavorito, false), false);
  assert.equal(deveAbrirAtendimentoPeloClique(iconeDentroDoBotaoFavorito, false), false);

  // Clique direto no botão Marcar Resolvido (Fila de Manutenção) não dispara a abertura da linha
  assert.equal(deveAbrirAtendimentoPeloClique(botaoMarcarResolvido, false), false);

  // Clique no link textual principal não dispara ação duplicada na linha
  assert.equal(deveAbrirAtendimentoPeloClique(linkTextualPrincipal, false), false);

  // 2. Lógica isolada de acionamento por teclado (deveAbrirAtendimentoPeloTeclado)
  const linhaContainer = {
    closest: (sel: string) => linhaContainer
  };

  // Teclas Enter e Espaço na linha focada disparam a abertura
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'Enter',
      target: linhaContainer,
      currentTarget: linhaContainer
    }),
    true
  );
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: ' ',
      target: linhaContainer,
      currentTarget: linhaContainer
    }),
    true
  );
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'Spacebar',
      target: linhaContainer,
      currentTarget: linhaContainer
    }),
    true
  );

  // Outras teclas não disparam a abertura
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'Tab',
      target: linhaContainer,
      currentTarget: linhaContainer
    }),
    false
  );
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'ArrowDown',
      target: linhaContainer,
      currentTarget: linhaContainer
    }),
    false
  );
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'Escape',
      target: linhaContainer,
      currentTarget: linhaContainer
    }),
    false
  );

  // Foco em controles internos (badge, botão favorito, marcar resolvido, link) não intercepta teclado
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'Enter',
      target: badgeLink,
      currentTarget: linhaContainer
    }),
    false
  );
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'Enter',
      target: botaoFavorito,
      currentTarget: linhaContainer
    }),
    false
  );
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'Enter',
      target: botaoMarcarResolvido,
      currentTarget: linhaContainer
    }),
    false
  );
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'Enter',
      target: linkTextualPrincipal,
      currentTarget: linhaContainer
    }),
    false
  );

  const badgeFavoritosFocavel = {
    closest: (sel: string) => (sel.includes('[tabindex="0"]') ? badgeFavoritosFocavel : null)
  };
  assert.equal(
    deveAbrirAtendimentoPeloTeclado({
      key: 'Enter',
      target: badgeFavoritosFocavel,
      currentTarget: linhaContainer
    }),
    false
  );

  // 3. Verificação no código-fonte dos componentes
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');

  // 3.1 ListagemAtendimentos.tsx (cobre Listagem de Atendimentos, Fila de Curadoria, Minhas Curadorias, Curadorias realizadas)
  const listagemTsx = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/ListagemAtendimentos.tsx'),
    'utf8'
  );
  assert.match(listagemTsx, /useNavigate/);
  assert.match(
    listagemTsx,
    /<article[\s\S]*?className="listagem-linha"[\s\S]*?tabIndex=\{0\}/
  );
  assert.match(listagemTsx, /aria-label=\{`Abrir detalhes do atendimento \$\{item\.id\}`\}/);
  assert.match(listagemTsx, /deveAbrirAtendimentoPeloClique\(e\.target,\s*temSelecao\)/);
  assert.match(listagemTsx, /deveAbrirAtendimentoPeloTeclado\(e\)/);
  assert.match(listagemTsx, /abrirAtendimento\(item\.id\)/);
  assert.match(
    listagemTsx,
    /navigate\(destinoDoDetalhe\(id,\s*location\.search,\s*location\.pathname\)\)/
  );

  // 3.2 FavoritosPage.tsx (cobre Favoritos)
  const favoritosTsx = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/FavoritosPage.tsx'),
    'utf8'
  );
  assert.match(favoritosTsx, /useNavigate/);
  assert.match(
    favoritosTsx,
    /<article[\s\S]*?className="listagem-linha"[\s\S]*?tabIndex=\{0\}/
  );
  assert.match(favoritosTsx, /aria-label=\{`Abrir detalhes do atendimento \$\{item\.id\}`\}/);
  assert.match(favoritosTsx, /deveAbrirAtendimentoPeloClique\(e\.target,\s*temSelecao\)/);
  assert.match(favoritosTsx, /deveAbrirAtendimentoPeloTeclado\(e\)/);
  assert.match(favoritosTsx, /abrirAtendimento\(item\.id\)/);
  assert.match(
    favoritosTsx,
    /navigate\(destinoDoDetalhe\(id,\s*location\.search,\s*location\.pathname\)\)/
  );

  // 3.3 FilaDeManutencao.tsx (cobre Fila de Manutenção)
  const manutencaoTsx = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/FilaDeManutencao.tsx'),
    'utf8'
  );
  assert.match(manutencaoTsx, /useNavegacaoLinha/);
  assert.match(
    manutencaoTsx,
    /<article[\s\S]*?className="listagem-linha listagem-linha-manutencao"[\s\S]*?tabIndex=\{0\}/
  );
  assert.match(manutencaoTsx, /aria-label=\{`Abrir detalhes do atendimento \$\{item\.atendimentoId\}`\}/);
  assert.match(manutencaoTsx, /deveAbrirAtendimentoPeloClique\(e\.target,\s*temSelecao\)/);
  assert.match(manutencaoTsx, /deveAbrirAtendimentoPeloTeclado\(e\)/);
  assert.match(manutencaoTsx, /abrirAtendimento\(item\.atendimentoId\)/);
  assert.match(
    manutencaoTsx,
    /navegar\(destinoDoDetalhe\(atendimentoId,\s*location\.search\)\)/
  );

  // 3.4 MonitoramentoPage.tsx (cobre Monitoramento ao Vivo)
  const monitoramentoTsx = readFileSync(
    join(raiz, 'apps/web/src/features/monitoramento/MonitoramentoPage.tsx'),
    'utf8'
  );
  assert.match(monitoramentoTsx, /useNavigate/);
  assert.match(
    monitoramentoTsx,
    /<article[\s\S]*?className="listagem-linha listagem-linha-monitoramento"[\s\S]*?tabIndex=\{0\}/
  );
  assert.match(monitoramentoTsx, /aria-label=\{`Abrir monitoramento ao vivo do atendimento \$\{item\.id\}`\}/);
  assert.match(monitoramentoTsx, /deveAbrirAtendimentoPeloClique\(e\.target,\s*temSelecao\)/);
  assert.match(monitoramentoTsx, /deveAbrirAtendimentoPeloTeclado\(e\)/);
  assert.match(monitoramentoTsx, /abrirMonitoramento\(item\.id\)/);
  assert.match(
    monitoramentoTsx,
    /navigate\(destinoDoDetalhe\(id,\s*location\.search\)\)/
  );

  // 4. Verificação de estilos CSS em listagens.css
  const listagensCss = readFileSync(
    join(raiz, 'apps/web/src/styles/listagens.css'),
    'utf8'
  );
  assert.match(listagensCss, /\.listagem-linha\s*\{[\s\S]*?cursor:\s*pointer;/);
  assert.match(listagensCss, /\.listagem-linha:hover\s*\{[\s\S]*?background-color:/);
  assert.match(listagensCss, /\.listagem-linha:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--cyan\);/);
});
