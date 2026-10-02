# Ferramenta na fala do turno da transcrição

A transcrição do Atendimento e a do Monitoramento ao Vivo levam a Chamada de Ferramenta e o Resultado da Ferramenta no texto do turno da fonte, depois da fala, no locutor desse turno. A GEAP faz isso no atendimento concluído e não no ao vivo; aqui os dois usam a mesma transcrição que o pulso já busca. Turno só de ferramenta foi rejeitado: a observação passaria a tratar a ferramenta como fala nova, e o concluído deixaria de coincidir com a GEAP.

Consequências: turno sem fala entra só com a linha; transcrição já gravada não muda; Tempo de Espera ignora turno que só tem essas linhas; correção da fala conserva as linhas já no turno; a Taxa de Promessas Cumpridas não é alimentada por elas.
