| Id | Mutação | Teste que deveria detectar | Detectou? |
|---|---|---|---|
| M01 | recibo: remover a reconciliação por identidade (duplicar recibo) | recibo-idempotencia | detectada (7 teste(s) falharam); ex.: "ACHADO P0: PDF criado e gravação do link falha; a nova tentativa relig" |
| M02 | recibo: remover o lock | recibo-idempotencia (concorrência) | detectada (3 teste(s) falharam); ex.: "trava ocupada: sincronizar, cobrar e recibo avisam em português, sem m" |
| M03 | recibo: criar o PDF sem identidade gravada | recibo-idempotencia | detectada (1 teste(s) falharam); ex.: "o PDF criado leva a identidade do pagamento e do paciente nas propried" |
| M04 | recibo: religar PDF de OUTRO pagamento | recibo-idempotencia (identidade) | detectada (1 teste(s) falharam); ex.: "identidade: PDF de OUTRO pagamento com o mesmo nome nunca é religado (" |
| M05 | recibo: gravar o link sem conferir a linha (atualizar linha errada) | recibo-idempotencia (linha mudou) | detectada (1 teste(s) falharam); ex.: "a linha do pagamento mudou durante a reconciliação: o link não é grava" |
| M06 | recibo: ignorar link já gravado (gerar de novo) | recibo / integracao | detectada (5 teste(s) falharam); ex.: "rodar tudo de novo não duplica nada (consulta, cobrança, pagamento, re" |
| M07 | recibo: deixar a cópia de trabalho (com nome e CPF) no Drive | falhas / recibo-idempotencia | detectada (9 teste(s) falharam); ex.: "falha ao exportar o PDF: sem recibo pela metade, cópia na lixeira, ale" |
| M08 | recibo: aceitar CPF inválido | recibo | detectada (2 teste(s) falharam); ex.: "recibo sem pagador, sem data ou com CPF inválido: lista o que falta, s" |
| M09 | pagamento: permitir valor zero/negativo | invariantes-financeiros | detectada (2 teste(s) falharam); ex.: "valor inválido (0, negativo, NaN, Infinity, texto, nulo, fracionário, " |
| M10 | pagamento: pagar duas vezes (remover verificação de status) | invariantes-financeiros | detectada (6 teste(s) falharam); ex.: "um pagamento que saiu de a_receber nunca volta nem é pago de novo por " |
| M11 | cortesia sobre pagamento já pago | invariantes-financeiros | detectada (3 teste(s) falharam); ex.: "um pagamento que saiu de a_receber nunca volta nem é pago de novo por " |
| M12 | cortesia com valor diferente de zero | invariantes-financeiros | detectada (4 teste(s) falharam); ex.: "cancelamento na agenda: consulta cancelada, cobrança em aberto vira av" |
| M13 | pacote gera receita unitária fictícia | invariantes-financeiros | detectada (2 teste(s) falharam); ex.: "cortesia tem valor zero e forma cortesia; pacote tem valor zero e form" |
| M14 | pacote: consumir além do total | invariantes-financeiros | detectada (6 teste(s) falharam); ex.: "limites de pacote: total 0, negativo, NaN, Infinity, texto, fracionári" |
| M15 | pacote: reconciliação diminui consumo e passa do total (as duas guardas removidas) | invariantes-financeiros | detectada (6 teste(s) falharam); ex.: "a reconciliação nunca diminui consumo (legítimo ou digitado) e não toc" |
| M16 | pacote: reconciliação passa do total | invariantes-financeiros | detectada (3 teste(s) falharam); ex.: "a reconciliação nunca diminui consumo (legítimo ou digitado) e não toc" |
| M17 | menu: remover o lock das ações em linhas (pacote, pagamento) | regressoes-revisao (R11b) / menu | detectada (2 teste(s) falharam); ex.: "trava ocupada: sincronizar, cobrar e recibo avisam em português, sem m" |
| M18 | planilha: gravar sem conferir a identidade da linha | agenda-adversa / regressoes-revisao | detectada (7 teste(s) falharam); ex.: "identidade: linha movida (outra inserida antes) entre ler e gravar => " |
| M19 | planilha: não conferir o cabeçalho | regressoes-revisao (R07) | detectada (7 teste(s) falharam); ex.: "identidade: cabeçalho alterado, coluna acrescentada ou removida => nen" |
| M20 | a receber: ignorar o id_evento (cobrar de novo) | pagamentos / operacoes-idempotentes | detectada (9 teste(s) falharam); ex.: "rodar tudo de novo não duplica nada (consulta, cobrança, pagamento, re" |
| M21 | ids de pagamento repetidos | invariantes-financeiros | detectada (1 teste(s) falharam); ex.: "ids de pagamento são únicos, crescentes e não reaproveitados por lacun" |
| M22 | agenda: cancelar consulta já realizada | falhas / agenda | detectada (1 teste(s) falharam); ex.: "cancelamento: evento cancelado na agenda vira cancelada; realizada não" |
| M23 | agenda: cancelar no evento contraditório | agenda-adversa | detectada (1 teste(s) falharam); ex.: "mesmo id confirmado e cancelado na mesma resposta: não cancela a consu" |
| M24 | agenda: id repetido gera duas consultas | agenda-adversa | detectada (1 teste(s) falharam); ex.: "id repetido na resposta da agenda gera uma linha só (antes gerava duas" |
| M25 | fuso: aceitar instante sem fuso explícito | agenda-adversa | detectada (2 teste(s) falharam); ex.: "fuso: instante sem fuso explícito, evento de dia inteiro e texto estra" |
| M26 | relatório: contar cortesia como receita | invariantes-financeiros / relatorio | detectada (1 teste(s) falharam); ex.: "fica de fora: cortesia, pacote, a receber, outro mês e sem data válida" |
| M27 | relatório: contar consulta de pacote como receita | invariantes-financeiros / relatorio | detectada (1 teste(s) falharam); ex.: "fica de fora: cortesia, pacote, a receber, outro mês e sem data válida" |
| M28 | relatório: total por pagador errado | invariantes-financeiros / relatorio | detectada (24 teste(s) falharam); ex.: "cancelamento: consulta cancelada não gera cobrança nova e a já paga co" |
| M29 | CSV/planilha: fórmula injetada pelo nome do pagador | relatorio / seguranca-local | detectada (1 teste(s) falharam); ex.: "CSV: separador ponto e vírgula, vírgula decimal, CPF formatado, fórmul" |
| M30 | relatório: remover o lock | relatorio-integridade | detectada (2 teste(s) falharam); ex.: "I3: a execução que esperava a trava relê os pagamentos e produz o resu" |
| M31 | modelo/pasta: remover o lock | modelo-pasta-idempotencia | detectada (2 teste(s) falharam); ex.: "concorrência: a segunda execução, que esperava a trava, relê as Config" |
| M32 | modelo: não reconciliar (criar segundo modelo) | modelo-pasta-idempotencia | detectada (2 teste(s) falharam); ex.: "falha ao gravar id_modelo_recibo depois de criar o arquivo: a nova ten" |
| M33 | a receber: remover o lock | operacoes-idempotentes | detectada (1 teste(s) falharam); ex.: "trava ocupada: sincronizar, cobrar e recibo avisam em português, sem m" |
| M34 | agenda: remover o lock | operacoes-idempotentes | detectada (2 teste(s) falharam); ex.: "trava ocupada: sincronizar, cobrar e recibo avisam em português, sem m" |
| M35 | gatilho: criar um gatilho a cada vez | operacoes-idempotentes | detectada (3 teste(s) falharam); ex.: "Google simulado: o gatilho automático é criado uma vez só" |
| M36 | registro: não mascarar e-mail | registro | detectada (2 teste(s) falharam); ex.: "mascara e-mail, telefone e CPF, mas deixa código de paciente" |
| M37 | registro: fórmula injetada na aba Registro | registro | detectada (1 teste(s) falharam); ex.: "mensagem que começa como fórmula não vira fórmula na planilha" |
| M38 | Pix: polinômio do CRC errado | pix | detectada (1 teste(s) falharam); ex.: "CRC16-CCITT: vetor conhecido "123456789" dá 29B1" |
| M39 | produção: manter a escrita na agenda | producao | detectada (4 teste(s) falharam); ex.: "nada do pacote menciona o gerador, os pacientes P9xxx, e-mails inventa" |
| M40 | consulta cancelada marcada como realizada | falhas / menu | detectada (2 teste(s) falharam); ex.: "consulta: realizada e faltou; cancelada não muda" |
