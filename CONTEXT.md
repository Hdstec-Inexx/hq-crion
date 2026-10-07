# HQ Crion — Qualidade da Clara

Sistema de qualidade que acompanha e avalia os Atendimentos das Claras: uma IA avalia as interações e um Curador humano atua como fallback, gerando insumos para a manutenção contínua dos agentes. Família HQ do GEAP; um único HQ para as três Administradoras; domínio próprio, não clone de marca GEAP nem das Administradoras.

## Language

### Papéis

**Admin**:
Papel com acesso total: gerencia Perfis, configura a IA Avaliadora e trabalha a fila de comentários pendentes.

**Gestão**:
Papel de acompanhamento, 100% leitura. Vê dashboards, relatórios, atendimentos com suas avaliações e comentários — sem escrever nem alterar nada.

**Curador**:
Papel que atua como fallback humano da IA Avaliadora. Escolhe da Fila de Curadoria quais atendimentos revisar. Vê Atendimentos de todas as Administradoras.
_Avoid_: Operacional

**Perfil**:
A identidade autenticada no HQ Crion: quem é a pessoa (nome, e-mail), a **Senha** com que autentica, e qual **papel** exerce (Admin, Gestão ou Curador). Não pertence a uma Administradora — o recorte de leitura é filtro de tela, não atributo do Perfil. É o que a casca autenticada consulta para liberar ou bloquear áreas. **Desativado**, permanece na lista e nas curadorias já feitas, mas não autentica. O último Admin ativo não se desativa.
_Avoid_: Usuário (ambíguo com conta genérica), sessão (mecanismo de auth, não o conceito de identidade/papel)

**Senha**:
A credencial do Perfil. O Admin a define na criação e pode substituí-la depois, sem alterar nome, e-mail ou papel. Perfil Desativado não autentica, mesmo com Senha definida.
_Avoid_: password, senha padrão

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

**Período**:
A janela de leitura em dias civis (America/Sao_Paulo). Nas listagens, sem data é o mês civil corrente, do dia 1 ao último, com os campos vazios; só a inicial é esse único dia; as duas datas são o intervalo fechado. No Dashboard as duas datas são exigidas e os campos mostram a janela: sem data na URL, vai do dia 1 do mês corrente até hoje. A final pode no máximo um ano depois da inicial. Só a final, inicial posterior à final, ou mais de um ano não é Período — a leitura não acontece.
_Avoid_: fim aberto, range

**Atendimento**:
Uma interação completa entre um Agente de Voz e um cliente, do início ao fim do contato. Pertence a um Agente de Voz, portanto a uma Administradora. O detalhe mostra fatos, transcrição, player e as duas Avaliações — não um thread de inbox. A transcrição inclui fala e Chamada de Ferramenta com seu Detalhe da Ferramenta. Chamada que ficou só como texto entre colchetes, ou Detalhe já salvo só com o veredito, ainda não está completa: se a fonte ainda tem a conversa e nela a chamada estruturada, quem abre o Atendimento vê a linha e o Detalhe, com parâmetros e resposta, e os colchetes saem da leitura. Conversa que só traz os colchetes na fala, sem a chamada estruturada, não tem Detalhe, e a transcrição permanece como foi salva. Se a fonte não tem mais a conversa, a transcrição também permanece como foi salva.
_Avoid_: Conversa, ligação, chamada

**Chamada de Ferramenta**:
O registro, na transcrição, de uma execução que a fonte chamou. É **Procedimento** ou **Ferramenta**, e é o lugar do **Detalhe da Ferramenta**. Chamada que a fonte marca como não executada não entra. Fica na fala do turno da chamada, depois do que foi dito. Turno sem fala entra só com essa chamada.
_Avoid_: tool call, execução, promessa

**Procedimento**:
A Chamada de Ferramenta que a fonte marca como início ou fim de procedimento, ou cujo conteúdo traz id ou nome de procedimento. O nome é o do procedimento; até ele chegar, vale o identificador que a fonte já mandou. Na linha, o Agente de Voz iniciou ou encerrou o procedimento. Nome e id no detalhe são de procedimento.
_Avoid_: ferramenta, workflow

**Ferramenta**:
A Chamada de Ferramenta que não é Procedimento. Na linha, o Agente de Voz iniciou a ferramenta, pelo nome dela. Nome e id no detalhe são de ferramenta.
_Avoid_: procedimento, tool

**Detalhe da Ferramenta**:
O que a Chamada enviou e o que a fonte devolveu: parâmetros, resposta, nome, id e o veredito Sucesso ou Falha. Parâmetros são o JSON enviado na chamada. O bloco de parâmetros aparece quando esse JSON existe; JSON vazio aparece vazio. Resposta é o corpo que voltou; em Falha, é o corpo de erro ou a mensagem de erro. O bloco de resposta aparece quando esse corpo existe. Na chamada concluída os dois estão no detalhe. O veredito acompanha os dois; sozinho, o detalhe não está completo. Raciocínio e tempo de execução entram quando a fonte os mandou. O resultado completa esse mesmo detalhe. Admin, Gestão e Curador leem o detalhe no Atendimento e no Monitoramento ao Vivo.
_Avoid_: payload, log da API

**Resultado da Ferramenta**:
O veredito dentro do Detalhe da Ferramenta: Sucesso ou Falha. Não é uma fala do turno. Sem o retorno da fonte, a transcrição não inventa Falha. Com id da chamada, completa essa chamada. No Procedimento, sem esse id, completa a chamada do mesmo identificador de procedimento: id do procedimento, senão o índice, senão o nome. Na Ferramenta, sem id da chamada, completa a chamada ainda sem veredito e de mesmo nome, a mais antiga. Esgotada a regra, vale essa mais antiga pelo nome de ferramenta. Sem chamada correspondente, não há veredito.
_Avoid_: promessa cumprida, retorno da API, payload

**Transferência**:
Fato do Atendimento: a ferramenta `transfer_to_number` foi executada (contato passado a número ou humano). Outro nome não é Transferência. Chamada que a fonte marca como não executada não é Transferência e não tem detalhe. Fato ausente também não é Transferência. **Resolvido** neste HQ é o concluído em que a Transferência não é verdadeira. Na transcrição e no Monitoramento ao Vivo é Ferramenta: a chamada executada tem Detalhe da Ferramenta, e dá para abri-lo, com o mesmo pareamento das outras Ferramentas. Não é Procedimento.
_Avoid_: encaminhamento, drop

**Tempo de Espera**:
O intervalo, em segundos, entre a primeira fala do cliente e a segunda fala do Agente de Voz (a primeira fala do agente é a apresentação). Turno que só tem Chamada de Ferramenta não é fala. Fica ausente quando faltam turnos ou tempos para calcular.
_Avoid_: TME (média), fila, TMA

**TMA**:
A média da duração dos Atendimentos concluídos no Recorte e no período.
_Avoid_: Tempo de Espera, TME

**Tempo Médio até Resolução**:
A média da duração dos **Resolvidos** no Recorte e no período.

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
O veredito sobre um Atendimento, produzido pela IA Avaliadora ou pelo Curador. As duas coexistem lado a lado quando ambas existem, sem hierarquia. A da IA é gerada para todo Atendimento concluído e carrega checklist de critérios, nota, **Resumo do Atendimento** e **Falhas Identificadas**. A nota do Curador é a soma dos pontos da Régua nos Critérios cujo estado não é **Não atendido**; **Não se aplica** conserva os pontos. O Curador não a digita. O selo **Aprovado**, na IA e no Curador, exige nota no limiar da Régua e nenhum Critério crítico em **Não atendido**; fora disso o selo é **Reprovado**. Sem Avaliação do Curador, o painel da IA ocupa a largura — exceto na Conferência aberta, em que esse painel sai. Gravada a Conferência, os dois painéis ficam lado a lado.
_Avoid_: Nota da Régua (número digitado na Conferência)

**Conferência**:
O ato único do Curador que produz a Avaliação do Curador. O formulário se chama **Conferência humana**, com o rótulo **Checklist do Curador** e a orientação de que os estados começam iguais aos da IA para confirmar ou corrigir cada Critério. Cada linha mostra o nome, o peso em pontos e, se for o caso, **crítico**; o estado é **Atendido**, **Não atendido** ou, só quando a Régua admite, **Não se aplica**. O selo recalcula a nota e **Aprovado** ou **Reprovado** a cada correção, no tratamento visual da Crion. Abaixo, em leitura, a nota da IA, as **Falhas Identificadas** e o **Resumo do Atendimento**; o **Comentário** é o único texto que o Curador escreve, com o rótulo “Comentário da revisão (opcional)”. O botão é “Salvar conferência”. Não se repete. Enquanto o formulário está aberto, o painel da Avaliação da IA não aparece.
_Avoid_: reavaliação, histórico de revisão, Conferência da Avaliação da IA, Nota da Avaliação da IA editável

**Resumo do Atendimento**:
A síntese textual do contato gerada pela IA Avaliadora, descrevendo o objetivo do cliente e o desfecho da interação. Exibida na caixa de notas da Avaliação da IA, em container com rolagem própria, e em leitura na Conferência. Sem parágrafo, a caixa permanece, com a frase “Resumo não informado.” O Curador não a reescreve.
_Avoid_: Sinopse, descrição, resumo da chamada, resumo da Conferência

**Falhas Identificadas**:
A lista de desvios, falhas de conduta e não conformidades operacionais identificadas pela IA Avaliadora no Atendimento. Exibida na caixa de notas da Avaliação da IA ao lado do Resumo do Atendimento, em container com rolagem própria, e em leitura na Conferência. Lista vazia permanece, com a frase “Nenhuma falha identificada.” O Curador não a reescreve; o que ele acrescenta é o **Comentário**.
_Avoid_: Erros, apontamentos, bugs, falhas da Conferência

**Concordância**:
O alinhamento entre a Avaliação da IA e a do Curador no mesmo Atendimento — por nota e por Critério. Não é um flag gravado: deriva da comparação dos dois vereditos. Por Critério, a taxa é **iguais** sobre **comparáveis**. Por nota, compara a nota gravada pela IA com a soma do Curador. Critérios **iguais** podem conviver com notas discordantes, quando a nota da IA não é a soma da Régua.

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
O percentual de Atendimentos no Recorte e no período cujo selo da IA é **Aprovado**: a nota gravada pela IA atinge o limiar da Régua e nenhum Critério crítico está **Não atendido**. Indicador do Dashboard próprio deste HQ; a GEAP não tem a taxa, e o critério é o do selo dela. O clique no KPI lista esses Atendimentos.
_Avoid_: taxa só pela nota, nota do Curador

### Dashboard

**Dashboard**:
A leitura gerencial (Admin e Gestão) no Recorte e no período. Volume é a contagem de Atendimentos do HQ **dentro** desse Recorte e período — não a listagem global da ElevenLabs. KPIs: volume, TMA, Taxa de Resolvidas, SLA, Nota média IA × Curador, Avaliados IA × Curador, Taxa de Promessas Cumpridas, Tempo Médio até Resolução, **Aprovação**. Painéis: motivos, acerto por Critério, Concordância, Critérios de Não Conformidade, piores Atendimentos. **Motivos** e **Critérios de Não Conformidade** são anéis compactos (~160px, legenda ao lado); fatias e legenda em ordem **decrescente** de quantidade, com cores no índice das fatias visíveis. Hover ou foco na fatia mostra nome, quantidade e **participação** — os mesmos da legenda — e destaca a linha correspondente; toque na fatia navega na hora, sem tooltip. Clique na fatia é o clique da linha da legenda: abre a Listagem com o Motivo ou o Critério daquela fatia (não recorta o Dashboard). Clique no miolo do anel (sem fatia) abre a listagem do painel, sem esse extra. **Acerto por Critério** e **Concordância** por Critério são trilhos de percentual 0–100 no pulso GEAP, todos em painel **claro** Crion (a Concordância não herda o card tinta do GEAP: dois números — Nota e Critérios — mais as barras). Hover ou foco na **barra** (não nos dois números) mostra quantidade: Acerto = atendidos e aplicáveis; Concordância = iguais e comparáveis. Sem aplicáveis ou sem comparáveis a barra é “—”; o hover nomeia a ausência, não zero. Clique na barra de Acerto continua recortando a listagem pelos **Atendidos** daquele Critério; clique na barra de Concordância continua listando Atendimentos com as duas Avaliações, sem recorte por Critério. **Piores Atendimentos** é lista ranqueada (nota da IA + Atendimento), abaixo da Concordância. Grelha: Motivos e Não Conformidade no topo; Concordância e Acerto por Critério na linha seguinte, **com o mesmo rodapé**; Piores Atendimentos abaixo da Concordância. Enquadramento no máximo 1240px, duas colunas iguais, vão 22px; as fatias usam matizes distintos a partir do ciano Crion, não tons da mesma cor. Dois anéis na mesma tela não repetem a mesma ordem de cores. Filtros de listagem (status, curador, critérios, nota, conversa) **não** entram no agregado. Clique em KPI ou painel abre a Listagem de Atendimentos com Recorte, o Período fechado que o Dashboard está observando e o indicador. Sem data na URL, esse clique leva do dia 1 até hoje, não o mês civil inteiro. Limpar tira as datas da URL e a tela volta a essa janela até hoje.

**SLA**:
Percentual, no Dashboard e no Recorte/período, dos Atendimentos concluídos no HQ cujo Tempo de Espera está dentro do prazo (≤ **150 segundos**). Sem Tempo de Espera mensurável não conta como dentro do prazo. Meta de referência: **80%**.
_Avoid_: inatividade, TME como card

**Taxa de Resolvidas**:
Percentual de **Resolvidos** sobre os Atendimentos concluídos no Recorte e no período. No card o percentual permanece visível; hover ou foco mostra a quantidade de Resolvidos (“N resolvidas sem transferência”) e some no repouso.

**Taxa de Promessas Cumpridas**:
Percentual de Chamadas de Ferramenta com Sucesso no Recorte e no período — Procedimento e Ferramenta. O rótulo é o do pulso GEAP; o fato é esse sucesso, não promessa verbal ao cliente.

**Avaliados (IA × Curador)**:
Quantos Atendimentos concluídos no Recorte e no período têm Avaliação da IA e quantos têm conferência do Curador.

**Participação**:
A quantidade da fatia visível do anel (Motivo ou Critério de Não Conformidade) como percentual do total dessas fatias. Inteiro. Não é o percentual 0–100 das barras.
_Avoid_: pct, o mesmo sentido de Acerto ou Concordância

### Operação

**Monitoramento ao Vivo**:
A observação em tempo real — somente texto, sem áudio — de Atendimentos ainda abertos, no pulso do GEAP. Observação recebida é a lista: as linhas entram e não há frase de falha de carga. Essa frase só existe quando a área não tem lista nenhuma — distinta de Recorte vazio e de fonte não configurada. A lista se atualiza enquanto a área está visível; se uma atualização falha, permanece a última lista boa. O detalhe mostra a transcrição que a fonte já devolveu — fala e Chamada de Ferramenta com seu Detalhe da Ferramenta — sem cortar o início. Chamada já executada entra com o Detalhe, mesmo que a observação comece no meio do contato. A linha da chamada entra na hora. O veredito pode chegar antes da resposta; a resposta completa esse mesmo detalhe. Quando a chamada se conclui na tela, o Detalhe tem parâmetros e resposta. Fala nova entra só se ainda não está na tela. Correção da fala troca o que foi dito e conserva a Chamada e o Detalhe já naquele turno. Sem transcrição ainda, espera a próxima fala. Quando o contato acaba, a observação encerra e o texto permanece. Na leitura consolidada (Administradora “Todas”) entram os ainda abertos que a fonte lista, tenham ou não **Agente de Voz** no catálogo. Contato com encerramento, desfecho ou duração parada não está aberto, mesmo que a fonte ainda diga em progresso. O **Recorte** é que restringe a uma Administradora ou a um Agente de Voz. Linha da lista exige o id da conversa e o id do agente; sem um dos dois, essa linha não existe e as outras ficam. Se não sobrar nenhuma, é Recorte vazio. O texto da linha é o nome. O início é o instante de começo que a fonte registra, em segundos; na linha aparece como dia/mês e hora, em America/Sao_Paulo. Sem esse instante, a linha é só o nome. Linha sem Agente no catálogo mostra o nome da fonte, ou o id se não houver nome. Se esse nome traz a Administradora, o Recorte dessa Administradora a inclui, e o Recorte de um Agente de Voz a inclui quando o nome da fonte contém o nome daquele agente. A linha continua sem Administradora. Sem esse nome, ela só aparece na leitura consolidada. Sem a fonte configurada, a área não observa: isso não é Recorte vazio. Na casca o rótulo é “Ao vivo”; o nome da área é este.
_Avoid_: Supervisão (implica intervenção), Ao vivo (fora da casca)

**Filtro de Nota da IA**:
Nas listagens o controle chama-se **Nota da IA Avaliadora**. Recorta pela **nota exata** da Avaliação da IA (0 a 10, passo 0,5). Zero ou ausente = sem recorte.
_Avoid_: Nota mínima, limiar ≥, passo 0,1, Nota da Avaliação da IA (conceito GEAP de calibração do avaliador — este HQ não o usa no filtro)

**Fila de Curadoria**:
A lista de Atendimentos concluídos e já avaliados pela IA, da qual o Curador escolhe quais revisar (modelo pull). Na casca: “Fila de curadoria”. O Período é o termo **Período**; a lista vai do mais antigo ao mais novo. Filtros: Recorte, período, id da conversa, motivo, **Filtro de Nota da IA**, Limpar — o mesmo recorte operacional da fila GEAP, sem critérios nem curador.

**Listagem de Atendimentos**:
A lista operacional de Atendimentos. O Período é o termo **Período**: campos vazios até submeter; final em branco significa o dia da inicial. Recorte no header. Filtros da página: período, id da conversa, motivo, **Critérios Não Atendidos** e **Critérios Atendidos** (dois multi-selects compactos da Régua), status da curadoria (realizada/pendente), curador, **Filtro de Nota da IA**, Limpar — e **Status** do Atendimento (Concluído / Em andamento). Não usa o booleano “Curadoria feita”.

**Minhas Curadorias / Curadorias realizadas**:
Listas de Atendimentos já conferidos. Filtros como no GEAP: Recorte, período, id da conversa, motivo, **Critérios Não Atendidos** e **Critérios Atendidos**, **Filtro de Nota da IA**, Limpar; curador só em Curadorias realizadas (não em Minhas).

**Fila de Manutenção**:
A lista de Comentários da conferência — pendentes e resolvidos — da qual o Admin trabalha a manutenção dos Agentes de Voz. Filtro por status e data; cada item liga ao Atendimento de origem. Só o Admin opera a fila. Na casca: “Manutenção”. Recorte igual às outras listagens. O Período é o termo **Período**.

**Comentário**:
O insumo escrito na conferência do Curador. Entra na Fila de Manutenção como Pendente; o Admin marca Resolvido. Gestão lê o texto no detalhe do Atendimento, sem operar a fila.
