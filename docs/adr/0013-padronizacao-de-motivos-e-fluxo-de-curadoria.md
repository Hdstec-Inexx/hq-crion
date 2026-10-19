# Padronização Dinâmica de Motivos e Restrição Operacional de Curadoria

Status: accepted.

## Contexto e Problema
1. **Filtro de Motivo Estático e Incompatível**: O HQ Crion possuía uma lista hardcoded de 4 motivos (`Boleto`, `Carência`, `Não informado`, `Rede credenciada`) no pacote de contratos e na interface web (`ComboboxMotivo`). Na prática, as chamadas ingeridas via ElevenLabs e n8n contêm motivos reais variados (ex.: `"2 via de boleto"`, `"Alteração Cadastral/transferencia"`). Como o filtro rejeitava qualquer valor fora da lista fixa, a filtragem por motivo falhava e valores válidos não podiam ser selecionados. Além disso, variações ortográficas e de pontuação geravam fragmentação indesejada dos termos.
2. **Vazamento de Atendimentos Curados para Curadores**: Curadores tinham como página inicial `/atendimentos` (que exibia todos os atendimentos sem filtro prévio de curadoria). Atendimentos cuja curadoria já havia sido realizada continuavam visíveis, misturados com os pendentes, gerando retrabalho e ambiguidade no fluxo operacional do Curador.

---

## Decisões Arquiteturais e de Design

### 1. Canonicalização de Motivos por Regex no PostgreSQL e Aplicação
- **Catálogo Base Oficial de Motivos da Clara**:
  O sistema incorpora a lista oficial canônica de motivos que a Clara atende:
  1. *Pagamento no cartão*
  2. *Liberação de atendimento*
  3. *Alteração cadastral de endereço*
  4. *Alteração cadastral de nome e data de nascimento*
  5. *Negociação*
  6. *Consulta de carência*
  7. *Coparticipação e contestação*
  8. *Emissão de documentos: carta de permanência, demonstrativo, extrato de coparticipação e ficha financeira*
  9. *Reemissão de boleto*
  10. *Boleto*
  11. *Reajuste*
  12. *Inclusão de RN/RC*
  13. *Cancelamento de elegibilidade*
  14. *Confirmação de pagamento*
  15. *Boletos não gerados*
  16. *Atraso na liberação do código da carteirinha*

- **Normalização por Expressão Regular**:
  Criação de função canônica que limpa diacríticos (acentos via `unaccent`), remove indicadores ordinais (`ª`, `º`), substitui caracteres não-alfanuméricos (pontuações, barras, traços) por espaços, converte para minúsculas e colapsa múltiplos espaços em branco (`trim(regexp_replace(...))`).
  - *Exemplo*: `"2ª via de boleto"` ou `"2 via de boleto"` são normalizadas e mapeadas; `"Confirmação de Pagamento"` converge para `"Confirmação de pagamento"`.
- **Trigger `BEFORE INSERT OR UPDATE` transparente no PostgreSQL**:
  Na tabela `hq_atendimento`, um trigger intercepta inserções e atualizações de `motivo`.
  1. Primeiro, verifica se o valor normalizado coincide com algum motivo do catálogo base oficial. Se sim, adota o nome canônico oficial.
  2. Caso contrário, verifica se já existe algum outro atendimento na base com a mesma chave canônica normalizada. Se existir, adota o motivo já existente.
  3. Se for um motivo inédito (não pertence ao catálogo base e não possui equivalente similar no banco), ele é gravado e passa a compor as novas opções do filtro.
  - **Compatibilidade com n8n**: O fluxo n8n que executa `salva-atendimento.sql` continua inalterado (mesmos parâmetros `$1..$14`), sem impacto de integração.
- **Paridade em Testes / Memória**:
  Implementação de função correspondente em TypeScript para a porta de repositório em memória (`memoria.ts`).
- **Migração Retroativa**:
  Migração SQL que agrupa os registros históricos em `hq_atendimento` e padroniza seus motivos contra o catálogo canônico e chaves existentes.

### 2. Filtro de Motivos Dinâmico
- **Contratos e Resposta da API**:
  - `ListagemResponse` passa a transportar `motivos: string[]`, contendo a lista ordenada de motivos canônicos distintos presentes no banco.
  - O filtro aceita qualquer motivo válido existente na base.
- **Interface (`BarraDeFiltrosDaListagem` e `ComboboxMotivo`)**:
  - Remoção da lista fixa `motivosDeContato` de 4 itens como fonte da UI.
  - O `ComboboxMotivo` recebe dinamicamente as opções fornecidas pela API, permitindo busca e seleção dos motivos reais.

### 3. Fluxo e Visibilidade Exclusiva para o Perfil Curador
- **Destino Inicial na Casca**:
  - Para o papel `Curador`, o destino inicial (`destinoInicial('Curador')`) passa a ser `/fila-de-curadoria`, priorizando a triagem dos atendimentos pendentes.
- **Ocultação de Atendimentos Curados**:
  - Na rota `/atendimentos`, quando a requisição for autenticada com papel `Curador`, o backend força a restrição `!item.curadoria` (exibindo unicamente atendimentos pendentes).
  - O seletor de "Status da curadoria" na barra de filtros é omitido para o Curador na listagem geral.
  - Atendimentos já curados são consultados exclusivamente através da tela **Minhas Curadorias** (`/minhas-curadorias`).

---

## Critérios de Aceite
1. **Deduplicação de Motivos**: Inserir `"2ª via de boleto"` quando `"2 via de boleto"` já existe persiste o atendimento com `"2 via de boleto"`. Inserir um motivo inédito cria uma nova opção.
2. **Filtro Funcional**: O dropdown de Motivo exibe os motivos reais da base; selecionar um motivo filtra com sucesso a listagem correspondente.
3. **Isolamento de Curadoria para o Curador**:
   - Um usuário logado como `Curador` acessa `/fila-de-curadoria` como tela inicial.
   - Na tela `/atendimentos`, o Curador não visualiza atendimentos com curadoria já realizada.
   - Atendimentos já conferidos aparecem somente em `/minhas-curadorias`.
