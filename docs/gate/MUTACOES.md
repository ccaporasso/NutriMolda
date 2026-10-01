# Mutação manual dos fluxos críticos

`node scripts/mutacoes.js` aplica uma troca de texto por vez numa cópia temporária do projeto, roda a suíte inteira e exige que ela
FALHE (mutação detectada). Mutação que sobrevive é buraco de teste. Não altera os arquivos reais. Evidência: E2 (execução local da suíte).

Histórico (não apagado): na primeira rodada, 38 de 40 mutações foram detectadas. Duas sobreviveram:

- **M21 (ids de pagamento repetidos):** buraco real. O teste só tinha ids em ordem crescente, então trocar "maior id" por "último id" passava. Corrigido com casos fora de ordem em `tests/invariantes-financeiros.test.js`.
- **M15 (reconciliação diminui consumo), versão original:** mutante **equivalente**: a guarda `consumidas <= usadas` é redundante com a guarda `alvo <= usadas` logo depois, então tirar só uma não muda o comportamento. A mutação foi redefinida para remover as duas guardas, e essa é detectada.

Resultado atual (todas as mutações da lista):

| Id | Mutação | Teste que deveria detectar | Detectou? |
|---|---|---|---|
| M01 | recibo: remover a reconciliação por identidade (duplicar recibo) | recibo-idempotencia | detectada (7 teste(s) falharam); ex.: "ACHADO P0: PDF criado e gravação do link falha; a nova tentativa relig" |
| M02 | recibo: remover o lock | recibo-idempotencia (concorrência) | detectada (3 teste(s) falharam); ex.: "trava ocupada: sincronizar, cobrar e recibo avisam em português, sem m" |
| M03 | recibo: criar o PDF sem identidade gravada | recibo-idempotencia | detectada (8 teste(s) falharam); ex.: "ACHADO P0: PDF criado e gravação do link falha; a nova tentativa relig" |
| M04 | recibo: religar PDF de OUTRO pagamento | recibo-idempotencia (identidade) | detectada (1 teste(s) falharam); ex.: "identidade: PDF de OUTRO pagamento com o mesmo nome nunca é religado (" |
| M05 | recibo: gravar o link sem conferir a linha (atualizar linha errada) | recibo-idempotencia (linha mudou) | detectada (1 teste(s) falharam); ex.: "a linha do pagamento mudou durante a reconciliação: o link não é grava" |
| M06 | recibo: ignorar link já gravado (gerar de novo) | recibo / integracao | detectada (5 teste(s) falharam); ex.: "rodar tudo de novo não duplica nada (consulta, cobrança, pagamento, re" |
| M07 | recibo: deixar a cópia de trabalho (com nome e CPF) no Drive | falhas / recibo-idempotencia | detectada (10 teste(s) falharam); ex.: "recibo e pagamento de uma linha: chamadas ao Drive e à planilha consta" |
| M08 | recibo: aceitar CPF inválido | recibo | detectada (2 teste(s) falharam); ex.: "recibo sem pagador, sem data ou com CPF inválido: lista o que falta, s" |
| M09 | pagamento: permitir valor zero/negativo | invariantes-financeiros | detectada (2 teste(s) falharam); ex.: "valor inválido (0, negativo, NaN, Infinity, texto, nulo, fracionário, " |
| M10 | pagamento: pagar duas vezes (remover verificação de status) | invariantes-financeiros | detectada (8 teste(s) falharam); ex.: "marcar pago em três linhas, falha na segunda gravação: a primeira fica" |
| M11 | cortesia sobre pagamento já pago | invariantes-financeiros | detectada (4 teste(s) falharam); ex.: "cortesia: se a outra execução já recebeu o pagamento, a cortesia não z" |
| M12 | cortesia com valor diferente de zero | invariantes-financeiros | detectada (5 teste(s) falharam); ex.: "cortesia: falha ao gravar não muda o status nem o valor; repetir faz a" |
| M13 | pacote gera receita unitária fictícia | invariantes-financeiros | detectada (2 teste(s) falharam); ex.: "cortesia tem valor zero e forma cortesia; pacote tem valor zero e form" |
| M14 | pacote: consumir além do total | invariantes-financeiros | detectada (6 teste(s) falharam); ex.: "limites de pacote: total 0, negativo, NaN, Infinity, texto, fracionári" |
| M15 | pacote: reconciliação diminui consumo e passa do total (as duas guardas removidas) | invariantes-financeiros | detectada (6 teste(s) falharam); ex.: "a reconciliação nunca diminui consumo (legítimo ou digitado) e não toc" |
| M16 | pacote: reconciliação passa do total | invariantes-financeiros | detectada (3 teste(s) falharam); ex.: "a reconciliação nunca diminui consumo (legítimo ou digitado) e não toc" |
| M17 | menu: remover o lock das ações em linhas (pacote, pagamento) | regressoes-revisao (R11b) / menu | detectada (4 teste(s) falharam); ex.: "marcar pago: a execução que esperava a trava relê e não remarca o que " |
| M18 | planilha: gravar sem conferir a identidade da linha | agenda-adversa / regressoes-revisao | detectada (7 teste(s) falharam); ex.: "identidade: linha movida (outra inserida antes) entre ler e gravar => " |
| M19 | planilha: não conferir o cabeçalho | regressoes-revisao (R07) | detectada (8 teste(s) falharam); ex.: "identidade: cabeçalho alterado, coluna acrescentada ou removida => nen" |
| M20 | a receber: ignorar o id_evento (cobrar de novo) | pagamentos / operacoes-idempotentes | detectada (12 teste(s) falharam); ex.: "a receber: primeira com histórico e cancelada com cobrança aberta bate" |
| M21 | ids de pagamento repetidos | invariantes-financeiros | detectada (2 teste(s) falharam); ex.: "ids de pagamento são únicos, crescentes e não reaproveitados por lacun" |
| M22 | agenda: cancelar consulta já realizada | falhas / agenda | detectada (1 teste(s) falharam); ex.: "cancelamento: evento cancelado na agenda vira cancelada; realizada não" |
| M23 | agenda: cancelar no evento contraditório | agenda-adversa | detectada (1 teste(s) falharam); ex.: "mesmo id confirmado e cancelado na mesma resposta: não cancela a consu" |
| M24 | agenda: id repetido gera duas consultas | agenda-adversa | detectada (1 teste(s) falharam); ex.: "id repetido na resposta da agenda gera uma linha só (antes gerava duas" |
| M25 | fuso: aceitar instante sem fuso explícito | agenda-adversa | detectada (3 teste(s) falharam); ex.: "fuso: instante sem fuso explícito, evento de dia inteiro e texto estra" |
| M26 | relatório: contar cortesia como receita | invariantes-financeiros / relatorio | detectada (1 teste(s) falharam); ex.: "fica de fora: cortesia, pacote, a receber, outro mês e sem data válida" |
| M27 | relatório: contar consulta de pacote como receita | invariantes-financeiros / relatorio | detectada (1 teste(s) falharam); ex.: "fica de fora: cortesia, pacote, a receber, outro mês e sem data válida" |
| M28 | relatório: total por pagador errado | invariantes-financeiros / relatorio | detectada (30 teste(s) falharam); ex.: "Pix em branco só trava o Pix; o recibo e o relatório seguem funcionand" |
| M29 | fórmula: esquecer tabulação e retorno de carro iniciais | seguranca-local | detectada (1 teste(s) falharam); ex.: "neutralizarFormula: tudo que um leitor de planilha poderia executar ga" |
| M29b | fórmula: não neutralizar = + - @ | seguranca-local / relatorio | detectada (8 teste(s) falharam); ex.: "mensagem que começa como fórmula não vira fórmula na planilha" |
| M30 | relatório: remover o lock | relatorio-integridade | detectada (2 teste(s) falharam); ex.: "I3: a execução que esperava a trava relê os pagamentos e produz o resu" |
| M31 | modelo/pasta: remover o lock | modelo-pasta-idempotencia | detectada (2 teste(s) falharam); ex.: "concorrência: a segunda execução, que esperava a trava, relê as Config" |
| M32 | modelo: não reconciliar (criar segundo modelo) | modelo-pasta-idempotencia | detectada (2 teste(s) falharam); ex.: "falha ao gravar id_modelo_recibo depois de criar o arquivo: a nova ten" |
| M33 | a receber: remover o lock | operacoes-idempotentes | detectada (1 teste(s) falharam); ex.: "trava ocupada: sincronizar, cobrar e recibo avisam em português, sem m" |
| M34 | agenda: remover o lock | operacoes-idempotentes | detectada (2 teste(s) falharam); ex.: "trava ocupada: sincronizar, cobrar e recibo avisam em português, sem m" |
| M35 | gatilho: criar um gatilho a cada vez | operacoes-idempotentes | detectada (4 teste(s) falharam); ex.: "Google simulado: o gatilho automático é criado uma vez só" |
| M36 | registro: não mascarar e-mail | registro | detectada (2 teste(s) falharam); ex.: "mascara e-mail, telefone e CPF, mas deixa código de paciente" |
| M37 | planilha: texto regravado pelo kit vira fórmula | seguranca-local | detectada (1 teste(s) falharam); ex.: "Planilha: texto digitado pela usuária que o kit regrava (pagador_nome)" |
| M41 | menu: deixar a exceção crua escapar (Stackdriver) | seguranca-local (experimento de exceções) | detectada (79 teste(s) falharam); ex.: "a lista falha na segunda página: nada é gravado, erro vai ao Registro " |
| M42 | log: texto da exceção vai ao Logger | registro | detectada (3 teste(s) falharam); ex.: "regressão: falha de gravação com texto sensível não vai ao Logger" |
| M38 | Pix: polinômio do CRC errado | pix | detectada (1 teste(s) falharam); ex.: "CRC16-CCITT: vetor conhecido "123456789" dá 29B1" |
| M39 | produção: manter a escrita na agenda | producao | detectada (6 teste(s) falharam); ex.: "os passos baratos do gate passam neste repositório (estrutura, escopos" |
| M40 | consulta cancelada marcada como realizada | falhas / menu | detectada (2 teste(s) falharam); ex.: "consulta: realizada e faltou; cancelada não muda" |
| M43 | configuração: erro de um domínio volta a travar os outros (Pix em branco bloqueia a agenda) | configuracao-dominios / falhas | detectada (5 teste(s) falharam); ex.: "Pix, nome ou e-mail em branco não derrubam a sincronização da agenda n" |
| M44 | Pix: aceitar valor que estoura o campo de 13 caracteres | limites-pix | detectada (3 teste(s) falharam); ex.: "valor máximo que cabe no campo (13 caracteres) é aceito; um centavo a " |
| M45 | produção: levar os esqueletos T20 a T24 para o Google da nutricionista | inventario-codigo / producao | detectada (6 teste(s) falharam); ex.: "o documento de inventário lista cada arquivo de src/ com a mesma class" |
| M46 | faixas: juntar linhas com lacuna (gravaria em linhas que não eram para mexer) | desempenho (agruparEmFaixas) | detectada (2 teste(s) falharam); ex.: "agruparEmFaixas: junta só linhas consecutivas do mesmo tamanho e não t" |
| M47 | índice de pacientes: incluir paciente inativo | desempenho (equivalência do índice) | detectada (3 teste(s) falharam); ex.: "paciente inativo não é associado; ativo com o mesmo e-mail sim" |
| M48 | a receber: a própria consulta conta como "anterior" (todo retorno cobrado vira conferência) | desempenho (equivalência) / pagamentos | detectada (23 teste(s) falharam); ex.: "a receber: primeira com histórico e cancelada com cobrança aberta bate" |
| M49 | pacote: contar consumo de pacote duplicado (ambíguo) | desempenho (equivalência) / invariantes-financeiros | detectada (2 teste(s) falharam); ex.: "consumidas por pacote = contagem direta por (paciente, início), com in" |
| M50 | marca de agenda: faixa gravada com o tamanho errado | desempenho (chamadas) / simulador estrito | detectada (3 teste(s) falharam); ex.: "sincronizar (primeira vez depois da atualização, todas as linhas sem m" |
| M51 | gate: ignorar teste que falhou | gate | detectada (1 teste(s) falharam); ex.: "testes: passa só com tudo verde, nada pulado, nada pendente e acima do" |
| M52 | gate: aceitar teste pulado (skip) | gate | detectada (1 teste(s) falharam); ex.: "testes: passa só com tudo verde, nada pulado, nada pendente e acima do" |
| M53 | gate: aceitar suíte com testes apagados (piso) | gate | detectada (1 teste(s) falharam); ex.: "testes: passa só com tudo verde, nada pulado, nada pendente e acima do" |
| M54 | gate: nunca falhar (exit code sempre zero) | gate | detectada (2 teste(s) falharam); ex.: "resultado final: FAIL derruba; WARN e N/M passam mas aparecem; estrito" |
| M55 | gate: aceitar CSV (dado exportado) no Git | gate | detectada (1 teste(s) falharam); ex.: "estrutura: falta de arquivo obrigatório, dado rastreado, credencial lo" |
| M56 | cobertura: módulo crítico sem medição passa batido | cobertura-ferramenta | detectada (1 teste(s) falharam); ex.: "módulo crítico ausente da medição é apontado (um arquivo que deixa de " |
| M58 | recibo: religar o PDF achado sem conferir o que ele mostra (número reaproveitado liga o recibo errado) | recibo-idempotencia | detectada (4 teste(s) falharam); ex.: "identidade: PDF antigo (sem propriedades) com o nome exato do recibo N" |
| M59 | recibo: impressão do conteúdo sem a forma de pagamento | recibo-idempotencia | detectada (3 teste(s) falharam); ex.: "o PDF criado leva a identidade do pagamento e do paciente nas propried" |
| M60 | pagamento: pagar/cortesia/pacote sem a trava (duas execuções se atropelam) | falhas-parciais-operacoes | detectada (4 teste(s) falharam); ex.: "marcar pago: a execução que esperava a trava relê e não remarca o que " |
