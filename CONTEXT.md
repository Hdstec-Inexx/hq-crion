# HQ Crion — Qualidade da Clara

Sistema de qualidade que acompanha e avalia os Atendimentos das Claras: uma IA avalia as interações e um Curador humano atua como fallback, gerando insumos para a manutenção contínua dos agentes. Família HQ do GEAP; um único HQ para as três Administradoras; domínio próprio, não clone de marca GEAP nem das Administradoras.

## Language

### Papéis

**Admin**:
Papel com acesso total: gerencia usuários, configura a IA Avaliadora e trabalha a fila de comentários pendentes.

**Gestão**:
Papel de acompanhamento, 100% leitura. Vê dashboards, relatórios, atendimentos com suas avaliações e comentários — sem escrever nem alterar nada.

**Curador**:
Papel que atua como fallback humano da IA Avaliadora. Escolhe da Fila de Curadoria quais atendimentos revisar. Vê Atendimentos de todas as Administradoras.
_Avoid_: Operacional

**Perfil**:
A identidade autenticada no HQ Crion: quem é a pessoa (nome, e-mail) e qual **papel** exerce (Admin, Gestão ou Curador). Não pertence a uma Administradora — o recorte de leitura é filtro de tela, não atributo do Perfil. É o que a casca autenticada consulta para liberar ou bloquear áreas.
_Avoid_: Usuário (ambíguo com conta genérica), sessão (mecanismo de auth, não o conceito de identidade/papel)

**Casca autenticada**:
O enquadramento da UI presente só com Perfil válido: faixa **clara**, colapso em trilho de ícones, áreas do **papel**, nome da pessoa e encerrar sessão. Login e health ficam fora dela. A marca é o logotipo Crion (wordmark); não se repete o nome ao lado nem se usa logo de Administradora. Não há Home de apresentação. Após o login, e ao clicar na marca, a casca abre na **primeira área** do papel (Admin e Gestão: Dashboard; Curador: Atendimentos). `/` autenticado redireciona para essa área. Deep link preserva o destino.

Rótulos curtos na faixa: Dashboard, Atendimentos, Ao vivo, Fila de curadoria, Minhas curadorias / Curadorias realizadas, Manutenção, Usuários, IA Avaliadora, Régua. O `h1` da página usa o termo de domínio (ex.: **Monitoramento ao Vivo**, não “Ao vivo”).
_Avoid_: shell, sidebar, Home (página de apresentação)

### Objeto avaliado

**Administradora**:
Affix, Alter ou Conectaplan — a administradora de benefícios (ANS) que opera uma ou mais Claras. Não isola dados por Perfil: o HQ é único; a leitura consolidada ou recortada é filtro. Na linha da listagem e no detalhe do Atendimento aparece sempre, em badge neutro (nome, sem as cores das três marcas).
_Avoid_: Cliente (papel futuro no GEAP), tenant, operadora (ANS: operadora de plano ≠ administradora), marca da casca

**Clara**:
A linha de Agentes de Voz avaliada neste HQ. Cada Administradora opera uma ou mais Claras (instâncias ElevenLabs).
_Avoid_: Lívia (GEAP), bot, assistente, chatbot

**Agente de Voz**:
Uma instância da Clara, pertencente a uma Administradora. É a unidade do segundo nível do Recorte e o “avaliado” concreto de cada Atendimento.
_Avoid_: bot, assistente, inbox

**Recorte**:
A restrição opcional da leitura, em dois níveis em cascata no header da página: **Administradora**, depois **Agente de Voz** (ou todos os agentes daquela Administradora). “Todas” no primeiro nível é a leitura **consolidada** e desliga o segundo. Vale no dashboard e em todas as listagens. Vive na URL da página: F5 preserva; KPI, badge da linha e “voltar à lista” carregam Administradora e Agente; clique na casca abre a área **sem** Recorte. Não há combinação inválida (Agente de uma Administradora com outra selecionada).
_Avoid_: tenant, workspace, contexto da casca, troca de HQ

**Atendimento**:
Uma interação completa entre um Agente de Voz e um cliente, do início ao fim do contato. Pertence a um Agente de Voz, portanto a uma Administradora. O detalhe mostra fatos, transcrição, player e as duas Avaliações — não um thread de inbox.
_Avoid_: Conversa, ligação, chamada

**Custo**:
O custo do Atendimento na fonte (ElevenLabs), visível só para Admin e Gestão. O Curador não o vê.

**Download de Áudio**:
A exportação do áudio do Atendimento. Só Admin e Gestão. O Curador reproduz no player, sem download.

### Avaliação

**IA Avaliadora**:
A avaliadora primária (LLM) que avalia automaticamente todo Atendimento concluído. Há uma única configuração (prompt, modelo) para todas as Claras.

**Régua de Avaliação**:
O conjunto único de critérios contra o qual todo Atendimento é medido, em todas as Administradoras. Uma Régua só — o dashboard consolidado compara a mesma escala.
_Avoid_: régua por Administradora, régua por Agente

**Avaliação**:
O veredito sobre um Atendimento, produzido pela IA Avaliadora ou pelo Curador. As duas coexistem lado a lado quando ambas existem, sem hierarquia. Enquanto a conferência humana não existir, o painel do Curador não aparece e o da IA ocupa a largura.

### Operação

**Monitoramento ao Vivo**:
A observação em tempo real — somente texto, sem áudio — de Atendimentos ainda abertos. Na casca o rótulo é “Ao vivo”; o nome da área é este.
_Avoid_: Supervisão (implica intervenção), Ao vivo (fora da casca)

**Fila de Curadoria**:
A lista de Atendimentos concluídos e já avaliados pela IA, da qual o Curador escolhe quais revisar (modelo pull). Na casca: “Fila de curadoria”. Sem período informado, observa o **mês civil corrente** (America/Sao_Paulo); a lista vai do mais antigo ao mais novo.

**Listagem de Atendimentos**:
A lista operacional de Atendimentos. Sem período informado, observa o **mês civil corrente** (America/Sao_Paulo), com datas vazias na UI até o operador submeter um intervalo. Demais filtros seguem o GEAP (status, nota, motivo, id da conversa, curadoria feita), além do Recorte.

**Fila de Manutenção**:
A lista de Comentários da conferência — pendentes e resolvidos — da qual o Admin trabalha a manutenção dos Agentes de Voz. Filtro por status e data; cada item liga ao Atendimento de origem. Só o Admin opera a fila. Na casca: “Manutenção”. Recorte igual às outras listagens. Sem período informado, observa o **mês civil corrente** (America/Sao_Paulo).

**Comentário**:
O insumo escrito na conferência do Curador. Entra na Fila de Manutenção como Pendente; o Admin marca Resolvido. Gestão lê o texto no detalhe do Atendimento, sem operar a fila.
