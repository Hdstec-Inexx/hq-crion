# Agentes de Voz Compartilhados, Administradora no Atendimento e Sincronização Dinâmica

Status: accepted.

## Contexto e Problema

Originalmente no HQ Crion (ADR 0001 e ADR 0008), o modelo de domínio assumia que cada **Agente de Voz** pertencia estritamente a uma única **Administradora** (Affix, Alter ou Conectaplan). Na tabela `hq_agente_de_voz`, a coluna `administradora` era obrigatória (`NOT NULL`) e a tabela `hq_atendimento` não possuía coluna própria de administradora, inferindo-a via `JOIN hq_agente_de_voz`.

Na operação real de produção com a ElevenLabs:
1. **Agentes Compartilhados**: Múltiplos atendimentos são conduzidos por agentes de voz que operam como roteadores centrais ou triagens compartilhadas entre as três administradoras. Seus nomes na ElevenLabs não contêm o nome de nenhuma Administradora específica (ex.: "Clara Central Router", "Atendente Geral").
2. **Perda de Vínculo de Administradora**: Ao vincular um atendimento a um agente compartilhado, o atendimento perderia sua Administradora se esta dependesse exclusivamente do cadastro do agente.
3. **Novos Identificadores de Agentes**: Novos fluxos ou agentes configurados na fonte ElevenLabs ou no fluxo externo n8n falhavam por violação de chave estrangeira caso o `agent_id` ainda não estivesse cadastrado em `hq_agente_de_voz`.
4. **Catálogo Estático**: O seletor de agentes dependia de 4 itens fixos de demonstração e descartava qualquer agente real coletado da ElevenLabs fora dessa lista.

---

## Decisões Arquiteturais e de Design

### 1. Administradora no Atendimento e Agentes Compartilhados (`hq_atendimento.administradora` e `hq_agente_de_voz.administradora NULL`)
- **Migração SQL (`019_administradora_no_atendimento_e_agentes_compartilhados.sql`)**:
  - Adiciona a coluna `administradora TEXT CHECK (administradora IN ('Affix', 'Alter', 'Conectaplan'))` diretamente na tabela `hq_atendimento` e a popula retroativamente a partir do agente anteriormente vinculado.
  - Torna a coluna `administradora` da tabela `hq_agente_de_voz` anulável (`DROP NOT NULL`), permitindo que agentes compartilhados sejam registrados com `administradora = NULL`.
  - Nas consultas relacionais (`leituraSql`, `comentariosDaFila`, `registrosPendentesDoPercurso`, `listarMotivos` e `consultarFavoritos`), a Administradora do atendimento passa a ser lida de `COALESCE(a.administradora, ag.administradora)`.
  - Cria índices de performance em `hq_atendimento (administradora)` e `hq_atendimento (agente_id, administradora)`.

### 2. Trigger de Auto-Cadastro e Preservação de Administradora
- Define trigger `BEFORE INSERT OR UPDATE ON hq_atendimento`:
  - Garante que `NEW.agente_id` seja automaticamente registrado em `hq_agente_de_voz` caso ainda não exista, evitando erros de chave estrangeira mesmo quando o n8n ou a ingestão enviam um identificador inédito.
  - Preenche `NEW.administradora` a partir da Administradora dedicada do agente caso venha nulo no `INSERT`.
  - Preserva `OLD.administradora` em `UPDATE`s de atendimento, garantindo que vincular um atendimento a um agente compartilhado nunca faça o atendimento perder sua Administradora de origem.

### 3. Ingestão Flexível e Classificação pelo Nome
- Na integração com a ElevenLabs (`atendimentoDaFonteElevenLabs`), todo agente válido da fonte é aceito (deixando de descartar agentes fora dos 4 itens fixos).
- **Regra de Classificação de Domínio**:
  - Quando o nome do agente contém `Affix`, `Alter` ou `Conectaplan`, ele é classificado como dedicado àquela Administradora.
  - Quando o nome não contém o nome de nenhuma Administradora, ele é classificado como um agente compartilhado (`administradora: null`).

### 4. Sincronização Automática em Background e Catálogo Dinâmico
- Rotina em background e sob demanda (`sincronizarAgentesDosAtendimentos`) consulta a API da ElevenLabs para atualizar atendimentos que possuam identificadores de semente para seus `agent_id` e `agent_name` reais, com debounce para proteção contra chamadas concorrentes.
- A API expõe `GET /agentes` e `GET /api/agentes`, retornando o catálogo dinâmico de agentes dos atendimentos presentes no banco (com `id`, `nome`, `administradora` e `administradorasAtendidas`). Agentes fictícios da semente estrutural só são exibidos quando possuem atendimentos salvos ou como fallback quando não há nenhum atendimento registrado.

---

## Consequências

- **Compatibilidade total com o n8n**: O fluxo externo do n8n continua enviando exatamente os mesmos 14 parâmetros posicionais ($1..$14) para `salva-atendimento.sql`, sem qualquer necessidade de refatoração nos nós externos.
- **Isolamento de métricas**: Atendimentos conduzidos por agentes compartilhados continuam sendo contabilizados corretamente nos recortes da Administradora a que pertencem.
