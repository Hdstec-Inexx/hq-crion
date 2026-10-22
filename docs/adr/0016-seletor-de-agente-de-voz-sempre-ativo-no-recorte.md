# Seletor de Agente de Voz Sempre Ativo no Recorte e Filtragem por Agentes Dedicados e Compartilhados

Status: accepted.

## Contexto e Problema

Originalmente no HQ Crion (ADR 0005), o modelo de **Recorte** em cascata na URL previa que a seleção de `"Todas"` como **Administradora** desabilitava o segundo seletor (**Agente de Voz**), e que apenas quatro agentes estáticos de demonstração estavam previstos no contrato.

Com a evolução para persistência e sincronização de agentes de voz reais da ElevenLabs (ADR 0015), o sistema passou a contar com agentes dedicados a administradoras específicas (como `Clara Affix 0800`) e agentes compartilhados entre administradoras (como `Clara Central Router`), expondo o catálogo dinâmico de agentes avaliados em `GET /agentes`.

No entanto:
1. Usuários com papéis de **Admin**, **Gestão** e **Curador** necessitam acompanhar a qualidade e analisar métricas de agentes específicos (tanto dedicados quanto compartilhados) em toda a operação, independentemente da Administradora.
2. Com o segundo seletor desabilitado em `"Todas"`, era impossível filtrar páginas com **Recorte** (Dashboard, Cancelamentos, Listagens, Filas de Curadoria e Manutenção, Favoritos e Monitoramento ao Vivo) por um agente sem antes escolher uma Administradora específica.
3. Ao alternar a Administradora, o agente anteriormente selecionado era descartado incondicionalmente, mesmo quando compatível com a nova seleção (como agentes compartilhados ou ao retornar para `"Todas"`).

---

## Decisões Arquiteturais e de Design

### 1. Seletor de Agente de Voz Sempre Ativo (`RecorteCascata`)
- O componente `RecorteCascata` remove qualquer atributo `disabled` do seletor de **Agente de Voz**, mantendo-o sempre habilitado, inclusive quando **Administradora** estiver em `"Todas"` (`""`).
- O seletor consome dinamicamente a API de catálogo de agentes (`GET /agentes`), populando-se com todos os agentes que possuem atendimentos registrados no banco (tanto operacionais dinâmicos quanto sementes que possuam atendimentos salvos) e recorrendo à lista semente apenas como fallback preventivo quando a base estiver vazia.

### 2. Filtragem Contextual por Administradora
- **Administradora em `"Todas"`**: O seletor de Agente de Voz lista todos os agentes avaliados da operação (dedicados e compartilhados). Selecionar um agente atualiza a URL para `?agente=<id>` e filtra a leitura consolidada da operação por aquele agente.
- **Administradora Específica (`Affix`, `Alter` ou `Conectaplan`)**: O seletor de Agente de Voz lista os agentes dedicados àquela Administradora e os agentes compartilhados que atuaram nela (`administradorasAtendidas.includes(administradora)`).

### 3. Preservação de Agente Compatível na Transição de Administradora
- Ao alterar a **Administradora** com um **Agente de Voz** já selecionado:
  - Se o agente for compatível com a nova Administradora (ex.: retorno para `"Todas"`, agente dedicado da nova Administradora ou agente compartilhado atuante), o agente selecionado é **preservado** na URL.
  - Se o agente for dedicado exclusivamente a outra Administradora ou um agente compartilhado sem atendimentos na nova seleção, o agente é redefinido para `"Todos os agentes"` (`""`).

### 4. Flexibilização dos Contratos e Rotas da API
- As funções de contrato `lerRecorte` e `escreverRecorteNaQuery` passam a aceitar `?agente=<id>` sem a presença de `administradora`, aceitam identificadores dinâmicos fora dos 4 itens da semente e recusam apenas pares comprovadamente incompatíveis (agente dedicado de uma Administradora filtrado sob outra Administradora).
- Todas as rotas de backend com suporte a Recorte (`/dashboard`, `/cancelamentos`, `/atendimentos`, `/fila-de-curadoria`, `/minhas-curadorias`, `/curadorias-realizadas`, `/favoritos`, `/monitoramento` e `/manutencao`) validam a query contra o catálogo de agentes e filtram adequadamente quando apenas `agente` é informado ou quando `administradora` e `agente` (dedicado ou compartilhado) são informados.

---

## Consequências

- **Visibilidade Transversal**: Admin, Gestão e Curador podem analisar o comportamento de agentes de voz específicos em toda a base de atendimentos da operação.
- **Continuidade de Navegação**: Preservar o agente compatível ao trocar de administradora reduz atrito na interface e respeita o modelo mental do usuário.
- **Retrocompatibilidade**: URLs existentes com `administradora` e `agente` continuam funcionando integralmente e round-trips de URL preservam o estado exato da aplicação.
