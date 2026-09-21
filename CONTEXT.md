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
O enquadramento da UI presente só com Perfil válido: faixa **clara**, colapso em trilho de ícones, áreas do **papel**, nome da pessoa e encerrar sessão. Login e health ficam fora dela. A marca é o logotipo Crion (wordmark); não se repete o nome ao lado nem se usa logo de Administradora. No trilho recolhido a marca **não** aparece — o clique nela só existe com a faixa aberta. Não há Home de apresentação. Após o login, e ao clicar na marca, a casca abre na **primeira área** do papel (Admin e Gestão: Dashboard; Curador: Atendimentos). `/` autenticado redireciona para essa área. Deep link preserva o destino.

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

**Transferência**:
Fato do Atendimento: a ferramenta de transferência foi executada (contato passado a número ou humano). **Resolvido** neste HQ é o concluído sem Transferência.
_Avoid_: encaminhamento, drop

**Tempo de Espera**:
O intervalo, em segundos, entre a primeira fala do cliente e a segunda fala do Agente de Voz (a primeira fala do agente é a apresentação). Fica ausente quando faltam turnos ou tempos para calcular.
_Avoid_: TME (média), fila, TMA

**TMA**:
A média da duração dos Atendimentos concluídos no Recorte e no período.
_Avoid_: Tempo de Espera, TME

**Tempo Médio até Resolução**:
A média da duração só dos Atendimentos concluídos **sem** Transferência, no Recorte e no período.

**Custo**:
O custo do Atendimento na fonte (ElevenLabs), visível só para Admin e Gestão. O Curador não o vê.

**Download de Áudio**:
A exportação do áudio do Atendimento. Só Admin e Gestão. O Curador reproduz no player, sem download.

### Avaliação

**IA Avaliadora**:
A avaliadora primária (LLM) que avalia automaticamente todo Atendimento concluído. Há uma única configuração (prompt, modelo, temperatura) para todas as Claras.

**Régua de Avaliação**:
O conjunto único de critérios contra o qual todo Atendimento é medido, em todas as Administradoras. Uma Régua só — o dashboard consolidado compara a mesma escala.
_Avoid_: régua por Administradora, régua por Agente

**Avaliação**:
O veredito sobre um Atendimento, produzido pela IA Avaliadora ou pelo Curador. As duas coexistem lado a lado quando ambas existem, sem hierarquia. Enquanto a conferência humana não existir, o painel do Curador não aparece e o da IA ocupa a largura.

**Concordância**:
O alinhamento entre a Avaliação da IA e a do Curador no mesmo Atendimento — por nota e por Critério. Não é um flag gravado: deriva da comparação dos dois vereditos. Por Critério, a taxa é **iguais** sobre **comparáveis**.

**Comparável**:
Um Critério no Atendimento em que IA e Curador são ambos **aplicáveis**. Sem comparáveis não há Concordância naquele Critério.
_Avoid_: par, sample, n genérico

**Igual** (Concordância):
Os dois vereditos **comparáveis** no mesmo Critério têm o mesmo estado.

**Aplicável**:
Um Critério na Avaliação cujo estado não é “Não se aplica”.
_Avoid_: válido, preenchido

**Acerto por Critério**:
A taxa de **Atendido** na Avaliação da IA, naquele Critério, só entre os **aplicáveis** do Recorte e do período. Não é participação no anel.

**Aprovação**:
O percentual de Atendimentos no Recorte e no período cuja nota da IA atinge o limiar da Régua única. Indicador do Dashboard próprio deste HQ; o GEAP não o tem.

### Dashboard

**Dashboard**:
A leitura gerencial (Admin e Gestão) no Recorte e no período. Volume é a contagem de Atendimentos do HQ **dentro** desse Recorte e período — não a listagem global da ElevenLabs. KPIs: volume, TMA, Taxa de Resolvidas, SLA, Nota média IA × Curador, Avaliados IA × Curador, Taxa de Promessas Cumpridas, Tempo Médio até Resolução, **Aprovação**. Painéis: motivos, acerto por Critério, Concordância, Critérios de Não Conformidade, piores Atendimentos. **Motivos** e **Critérios de Não Conformidade** são anéis compactos (~160px, legenda ao lado); fatias e legenda em ordem **decrescente** de quantidade, com cores no índice das fatias visíveis. Hover ou foco na fatia mostra nome, quantidade e **participação** — os mesmos da legenda — e destaca a linha correspondente; toque na fatia navega na hora, sem tooltip. Clique na fatia é o clique da linha da legenda: abre a Listagem com o Motivo ou o Critério daquela fatia (não recorta o Dashboard). Clique no miolo do anel (sem fatia) abre a listagem do painel, sem esse extra. **Acerto por Critério** e **Concordância** por Critério são trilhos de percentual 0–100 no pulso GEAP, todos em painel **claro** Crion (a Concordância não herda o card tinta do GEAP: dois números — Nota e Critérios — mais as barras). Hover ou foco na **barra** (não nos dois números) mostra quantidade: Acerto = atendidos e aplicáveis; Concordância = iguais e comparáveis. Sem aplicáveis ou sem comparáveis a barra é “—”; o hover nomeia a ausência, não zero. Clique na barra de Acerto continua recortando a listagem pelos **Atendidos** daquele Critério; clique na barra de Concordância continua listando Atendimentos com as duas Avaliações, sem recorte por Critério. **Piores Atendimentos** é lista ranqueada (nota da IA + Atendimento), abaixo da Concordância. Grelha: Motivos e Não Conformidade no topo; Concordância e Acerto por Critério na linha seguinte, **com o mesmo rodapé**; Piores Atendimentos abaixo da Concordância. Enquadramento no máximo 1240px, duas colunas iguais, vão 22px; as fatias usam matizes distintos a partir do ciano Crion, não tons da mesma cor. Dois anéis na mesma tela não repetem a mesma ordem de cores. Filtros de listagem (status, curador, critérios, nota, conversa) **não** entram no agregado. Clique em KPI ou painel abre a Listagem de Atendimentos com Recorte, período e o indicador. Sem período na URL, observa o mês civil; a UI do período segue o pulso GEAP (intervalo visível, aplicar, limpar).

**SLA**:
Percentual, no Dashboard e no Recorte/período, dos Atendimentos concluídos no HQ cujo Tempo de Espera está dentro do prazo (≤ **150 segundos**). Sem Tempo de Espera mensurável não conta como dentro do prazo. Meta de referência: **80%**.
_Avoid_: inatividade, TME como card

**Taxa de Resolvidas**:
Percentual de Atendimentos concluídos no Recorte e no período **sem** Transferência.

**Taxa de Promessas Cumpridas**:
Percentual de ferramentas executadas com sucesso no Recorte e no período. O rótulo é o do pulso GEAP; o fato é sucesso de ferramentas, não “promessa verbal ao cliente”.

**Avaliados (IA × Curador)**:
Quantos Atendimentos concluídos no Recorte e no período têm Avaliação da IA e quantos têm conferência do Curador.

**Participação**:
A quantidade da fatia visível do anel (Motivo ou Critério de Não Conformidade) como percentual do total dessas fatias. Inteiro. Não é o percentual 0–100 das barras.
_Avoid_: pct, o mesmo sentido de Acerto ou Concordância

### Operação

**Monitoramento ao Vivo**:
A observação em tempo real — somente texto, sem áudio — de Atendimentos ainda abertos. Na casca o rótulo é “Ao vivo”; o nome da área é este.
_Avoid_: Supervisão (implica intervenção), Ao vivo (fora da casca)

**Filtro de Nota da IA**:
Nas listagens o controle chama-se **Nota da IA Avaliadora**. Recorta pela **nota exata** da Avaliação da IA (0 a 10, passo 0,5). Zero ou ausente = sem recorte.
_Avoid_: Nota mínima, limiar ≥, passo 0,1, Nota da Avaliação da IA (conceito GEAP de calibração do avaliador — este HQ não o usa no filtro)

**Fila de Curadoria**:
A lista de Atendimentos concluídos e já avaliados pela IA, da qual o Curador escolhe quais revisar (modelo pull). Na casca: “Fila de curadoria”. Sem período informado, observa o **mês civil corrente** (America/Sao_Paulo); a lista vai do mais antigo ao mais novo. Filtros: Recorte, período, id da conversa, motivo, **Filtro de Nota da IA**, Limpar — o mesmo recorte operacional da fila GEAP, sem critérios nem curador.

**Listagem de Atendimentos**:
A lista operacional de Atendimentos. Sem período informado, observa o **mês civil corrente** (America/Sao_Paulo), com datas vazias na UI até o operador submeter um intervalo. Recorte no header. Filtros da página: período, id da conversa, motivo, **Critérios Não Atendidos** e **Critérios Atendidos** (dois multi-selects compactos da Régua), status da curadoria (realizada/pendente), curador, **Filtro de Nota da IA**, Limpar — e **Status** do Atendimento (Concluído / Em andamento). Não usa o booleano “Curadoria feita”.

**Minhas Curadorias / Curadorias realizadas**:
Listas de Atendimentos já conferidos. Filtros como no GEAP: Recorte, período, id da conversa, motivo, **Critérios Não Atendidos** e **Critérios Atendidos**, **Filtro de Nota da IA**, Limpar; curador só em Curadorias realizadas (não em Minhas).

**Fila de Manutenção**:
A lista de Comentários da conferência — pendentes e resolvidos — da qual o Admin trabalha a manutenção dos Agentes de Voz. Filtro por status e data; cada item liga ao Atendimento de origem. Só o Admin opera a fila. Na casca: “Manutenção”. Recorte igual às outras listagens. Sem período informado, observa o **mês civil corrente** (America/Sao_Paulo).

**Comentário**:
O insumo escrito na conferência do Curador. Entra na Fila de Manutenção como Pendente; o Admin marca Resolvido. Gestão lê o texto no detalhe do Atendimento, sem operar a fila.
