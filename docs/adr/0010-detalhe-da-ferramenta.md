# Detalhe da Ferramenta no lugar dos colchetes

Status: accepted. Supersedes ADR 0009.

A 0009 punha a Chamada e o Resultado no texto do turno e deixava a transcrição já gravada imóvel. A leitura passou a ser a linha do Agente de Voz com o Detalhe: parâmetros, resposta, nome, id e veredito. O Resultado é esse veredito, não uma fala. Chamada gravada só como colchetes, ou Detalhe só com o veredito, é relida na fonte quando a conversa ainda existe e traz a chamada estruturada; quem abre o Atendimento vê esse Detalhe, e os colchetes saem da leitura. Sem a conversa, ou só com os colchetes na fala, permanece como foi salva: parâmetros e resposta não se extraem dessa frase. Continua valendo da 0009: a chamada fica no turno depois da fala, turno sem fala entra só com a chamada, Tempo de Espera ignora turno que só tem chamada, e correção da fala conserva a chamada já no turno.
