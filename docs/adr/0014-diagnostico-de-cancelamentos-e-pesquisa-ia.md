# Diagnóstico de Cancelamentos, Detecção de Venda Mal Feita e Pesquisa por IA via OpenRouter

Status: accepted.

## Contexto e Problema

A operação e a gestão precisam responder rapidamente a perguntas críticas de retenção e perda de clientes nos Atendimentos das Claras (Affix, Alter e Conectaplan):
1. **Identificação de migração para concorrentes específicos** (ex.: identificar o cliente que cancelou e afirmou ter ido para a *Hapvida*, ou mapear quais operadoras concorrentes estão absorvendo a carteira).
2. **Compreensão da causa raiz da perda e validação da hipótese de "Venda Mal Feita"**: muitas vezes o cliente entra em contato por *Reajuste*, *Consulta de carência*, *Boleto* ou *Cancelamento de elegibilidade* e, durante a conversa, solicita o cancelamento porque o corretor/vendedor prometeu carência zero, hospital na rede credenciada ou valor sem coparticipação que não se confirmou. Olhar apenas o campo estático `motivo = 'Cancelamento de elegibilidade'` oculta cancelamentos originados em outros motivos e não responde se a causa foi falha comercial na venda.
3. **Investigação livre sobre transcrições e avaliações**: gestores precisam fazer perguntas abertas em linguagem natural (*"Quem cancelou e foi para a Hapvida? O problema é venda mal feita?"*) e receber tanto uma síntese executiva quanto os links diretos para os Atendimentos que comprovam o padrão.
4. **Custo de inferência de LLM**: a operação utilizava `google/gemini-3.5-flash-lite` ($0.30/1M input e $2.50/1M output). É necessário adotar uma integração via **OpenRouter** com modelo de desempenho equivalente para extração JSON e análise em português, porém significativamente mais econômico (`deepseek/deepseek-v4.1-flash`, a ~$0.028/1M input e $0.12/1M output, com 1M de janela de contexto).

---

## Decisões Arquiteturais e de Design

### 1. Nova Área na Casca Autenticada (`Cancelamentos` — `/cancelamentos`)
- Para não sobrecarregar o `/dashboard` (que é estritamente focado nos KPIs operacionais e na Régua de Avaliação da Clara em grelha travada de 1240px), cria-se uma área dedicada na Casca Autenticada:
  - **Rota**: `/cancelamentos`
  - **Rótulo na faixa lateral**: `Cancelamentos`
  - **Título da página (`h1`)**: `Diagnóstico de Cancelamentos`
  - **Papéis com acesso**: `Admin` e `Gestão` (o papel `Curador` permanece focado na Fila de Curadoria e conferência).
  - **Recorte e Período**: Segue rigorosamente o Recorte em cascata (`Administradora` → `Agente de Voz`) e o Período do Dashboard (mês corrente até hoje quando não informado na URL).
- **Estrutura de 4 blocos na página**:
  1. **KPIs de Cancelamento**:
     - *Cancelamentos Identificados* (contagem e percentual sobre os Atendimentos concluídos do período).
     - *Venda Mal Feita* (contagem e percentual dos cancelamentos com indício de falha na venda/adesão).
     - *Migração para Concorrente* (contagem de menções a concorrentes e destaque do principal concorrente citado, ex.: *Hapvida*).
  2. **Gráficos Interativos Lado a Lado**:
     - *Causas de Cancelamento*: distribuição por categoria (`Venda mal feita / Divergência comercial`, `Migração para concorrente`, `Preço / Reajuste`, `Rede credenciada / Cobertura`, `Insatisfação com atendimento`, `Problema financeiro / Boleto`, `Outros`). Clicar em uma fatia/barra filtra a listagem da tela.
     - *Concorrentes Citados & Detalhamento*: ranking das operadoras/concorrentes mencionados (ex.: `Hapvida`, `Unimed`, `Amil`) e sub-padrões. Clicar em um concorrente filtra imediatamente a listagem pelos Atendimentos que o citaram.
  3. **Pesquisa por IA**:
     - Campo de pergunta livre com atalhos sugeridos (*"Quem cancelou e foi para a Hapvida?"*, *"O problema do cancelamento é venda mal feita?"*, *"Qual o padrão dos cancelamentos no período?"*).
     - Retorna resposta analítica sintetizada pelo modelo (estruturada em parágrafos e tópicos, sem expor identificadores técnicos de código) + lista paginada (4 cards por página) de **Evidências** estritamente pertinentes à pergunta (cards clicáveis que levam a `/atendimentos/:id` exibindo o trecho relevante e o diagnóstico, sem listar cancelamentos alheios quando o recorte perguntado tiver zero ocorrências).
     - Inclui botão exclusivo para `Admin` (**"Analisar passivo com IA"**) que processa via OpenRouter os Atendimentos do período ainda sem diagnóstico persistido no banco.
  4. **Listagem Filtrável de Cancelamentos**:
     - Filtros locais combináveis: Causa de Cancelamento, Venda Mal Feita (`Todos`, `Sim`, `Não`), Concorrente citado e busca textual livre.
     - Cada linha apresenta Administradora, Agente de Voz, data/hora, Motivo original, Causa de Cancelamento, badge de alerta `Venda mal feita` (quando verdadeiro), badge do `Concorrente` (ex.: `Hapvida`), texto do `Diagnóstico` e link para abrir o Atendimento.

### 2. Universo de Cancelamentos: Heurística Imediata + Extração Estruturada pela IA
- Um Atendimento pertence ao universo de Cancelamentos quando:
  - Seu `motivo` contém cancelamento (ex.: `Cancelamento de elegibilidade`), **OU**
  - `houve_intencao_cancelamento = true` na Avaliação da IA, **OU**
  - A heurística textual detecta na transcrição, no resumo ou nas falhas identificadas solicitação/intenção de cancelamento, migração declarada pelo cliente para concorrente (ex.: *Hapvida*) ou quebra de expectativa comercial levando a desistência.
- **Regra Estrita para Concorrente Citado (`concorrente_citado`) e `Migração para concorrente`**:
  - Como Affix, Alter e Conectaplan são **Administradoras de Benefícios**, o plano atual do cliente que está sendo cancelado pertence a uma operadora parceira (ex.: *Unimed do Maranhão*, *Assim Saúde*, *Hapvida*).
  - Portanto, `concorrenteCitado` só é preenchido (e a causa só é `Migração para concorrente`) quando **a fala do próprio cliente** declarar explicitamente que está mudando, migrando, trocando ou contratando plano em outra operadora concorrente. Citar a operadora apenas para identificar o plano atual ou perguntar onde solicitar o cancelamento (ex.: *"Seria com vocês ou direto com a Unimed?"*) **não** configura concorrente citado nem migração. Termos ambíguos como *"assim"*, *"alice"*, *"bradesco"*, *"porto seguro"* ou *"são francisco"* exigem qualificador explícito da operadora de saúde e contexto de migração.
- **Abordagem Híbrida (Heurística + Persistência IA)**:
  - Para que a tela funcione instantaneamente sobre o passivo já existente no banco antes mesmo de qualquer reprocessamento pago em lote, o backend aplica um classificador heurístico determinístico como fallback sempre que os campos estruturados da IA estiverem nulos no registro.
  - Quando a IA processa o Atendimento (seja via fluxo do n8n na ingestão ou pelo botão de análise de passivo no HQ), os valores estruturados persistidos em `hq_avaliacao_da_ia` têm precedência.

### 3. Modelo de Dados e Compatibilidade com n8n (`hq_avaliacao_da_ia`)
- Nova migração SQL (`db/migrations/016_diagnostico_de_cancelamento.sql`) adiciona em `hq_avaliacao_da_ia`:
  - `houve_intencao_cancelamento BOOLEAN`
  - `categoria_causa_cancelamento TEXT`
  - `venda_mal_feita BOOLEAN`
  - `concorrente_citado TEXT`
  - `diagnostico_cancelamento TEXT`
  - `evidencia_trecho TEXT`
- A função `persistir_avaliacao_da_ia` é atualizada com parâmetros `DEFAULT NULL` para os novos campos (ou leitura via JSON opcional), garantindo 100% de retrocompatibilidade com chamadas de 5 argumentos e permitindo que `db/n8n/salva-avaliacao.sql` grave os dados de cancelamento.

### 4. Integração com OpenRouter (`deepseek/deepseek-v4.1-flash`)
- O backend (`apps/api/src/plugins/config.ts`) recebe as variáveis opcionais:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL` (default: `'deepseek/deepseek-v4.1-flash'`)
  - `OPENROUTER_BASE_URL` (default: `'https://openrouter.ai/api/v1'`)
- Caso `OPENROUTER_API_KEY` esteja configurada, a Pesquisa por IA e o reprocessamento de passivo executam chamadas HTTP (`fetch`) compatíveis com OpenAI Chat Completions no OpenRouter, enviando o contexto enxuto dos Atendimentos candidatos do Recorte/Período.
- Caso `OPENROUTER_API_KEY` não esteja definida (ex.: ambientes de teste ou dev local sem chave), o motor analítico local responde à Pesquisa por IA e à análise com base nos fatos, transcrições e diagnósticos extraídos, garantindo disponibilidade contínua e testes determinísticos.

### 5. Exibição no Detalhe do Atendimento (`/atendimentos/:id`)
- Em `DetalheAtendimento.tsx`, dentro do `PainelAvaliacao` da IA, quando `avaliacao.diagnosticoCancelamento?.houveIntencaoCancelamento` for verdadeiro, renderiza-se uma seção destacada **"Diagnóstico de Cancelamento"** mostrando:
  - Categoria da causa raiz
  - Indicador de **Venda mal feita** (`Sim` / `Não`)
  - **Concorrente citado** (quando houver, ex.: `Hapvida`)
  - Síntese do diagnóstico explicando o que ocorreu para perder o cliente.
