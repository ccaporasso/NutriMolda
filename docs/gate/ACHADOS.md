# Achados do Gate de Continuidade (registro de rastreabilidade)

Cada achado mantém o histórico: onde foi encontrado, onde foi corrigido, o commit, o teste que fica na suíte e o tipo de evidência.
Nada aqui foi reescrito como se nunca tivesse existido. Evidência: **E1** execução observada no Google real, **E2** teste automatizado
contra o Google simulado, **E3** análise estática, **E4** documentação, **N/M** não medido. Severidade: CRÍTICO, ALTO, MÉDIO, BAIXO, INFORMATIVO.

| Id | Achado | Severidade | Estado |
|---|---|---|---|
| A-01 | Recibo duplicava depois de falha parcial | CRÍTICO (eliminador) | Corrigido (E2) |
| A-02 | Modelo e pasta de recibos podiam duplicar | MÉDIO | Corrigido (E2) |
| A-03 | Relatório do mês sem trava | MÉDIO | Corrigido (E2) |
| A-04 | Instalação, gatilho e preços sem trava | BAIXO | Corrigido (E2) |
| A-05 | Reconciliação de pacote podia gravar `usadas` > total | MÉDIO | Corrigido (E2) |
| A-06 | Agenda: id repetido na resposta duplicava consulta e evento contraditório cancelava | MÉDIO | Corrigido (E2) |
| A-07 | Id de pagamento pode ser reaproveitado se a última linha for apagada | BAIXO | Aberto (documentado) |
| A-08 | Dois CSVs de mesmo nome já existentes: só o primeiro é substituído | BAIXO | Aberto (documentado) |
| A-09 | Agenda: instante sem fuso era lido no fuso da máquina | MÉDIO | Corrigido (E2) |
| A-10 | Cobertura não contava o código carregado no Google simulado | INFORMATIVO | Corrigido (ferramenta) |
| A-11 | Proteção contra fórmula em três cópias, sem tabulação/CR/espaço invisível, e texto regravado dependia do formato da célula | MÉDIO | Corrigido (E2); efeito real no Excel/Sheets N/M |
| A-12 | Mensagem crua de erro inesperado aparece na tela da nutricionista | BAIXO | Aberto (decisão do Caio) |
| A-13 | `exceptionLogging: STACKDRIVER` mantido: nenhuma função de menu ou gatilho deixa a exceção escapar | INFORMATIVO | Analisado; decisão do Caio pendente |
| A-14 | Configuração acoplada: chave Pix em branco travava sincronização da agenda, "gerar a receber", relatório e recibo | MÉDIO | Corrigido (E2) |
| A-15 | Pix aceitava valor que estoura o campo de 13 caracteres e gerava payload inválido | BAIXO | Corrigido (E2); leitura por banco real N/M |

---

## A-01 Recibo duplicava depois de falha parcial

- **Encontrado em:** auditoria anterior (Gate v1.0, 80,6/100, eliminador de idempotência), fluxo `gerarRecibo` de `src/GeradorRecibo.js` no commit `4ead36c`.
- **ACHADO:** se o PDF era criado no Drive e a gravação do link em Pagamentos falhava (ou a resposta do Drive se perdia), a nova tentativa criava um segundo PDF.
- **ANTES:** `tests/recibo-idempotencia.test.js` reproduz a duplicação. Rodado contra o código anterior, 9 dos 22 casos falham (entre eles "PDF criado e gravação do link falha" e "o Drive cria o PDF mas a resposta se perde").
- **CORREÇÃO:** o PDF passa a levar a identidade do pagamento (`kit_recibo_pagamento`) e do paciente (`kit_recibo_paciente`) nas propriedades do arquivo. Dentro da trava e depois de reler a planilha, antes de copiar o modelo, o kit lista os PDFs ativos da pasta: exatamente um do pagamento → religa o link; dois ou mais → para, sem criar; nenhum → cria. PDF de outro pagamento ou paciente nunca é religado; PDF antigo (sem propriedades) só vale com o nome exato; arquivo na lixeira não conta.
- **DEPOIS:** os 22 casos passam: falha em cada um dos 9 passos do recibo (copiar, abrir, trocar campo, salvar, exportar, criar PDF recusado, criar PDF com resposta perdida, gravar link, lixeira), nova tentativa e terceira tentativa sempre terminam com 1 PDF e o link certo.
- **REGRESSÃO:** `tests/recibo-idempotencia.test.js` (permanente); mutações M01 a M07 em `docs/gate/MUTACOES.md`.
- **EVIDÊNCIA:** E2. O comportamento real do Drive (`appProperties`, consulta `appProperties has {...}` com `drive.file`) é **N/M** até o roteiro em `docs/gate/GOOGLE-REAL.md`.
- **Corrigido em:** commit `e83bc76`. **Mudança de comportamento para a nutricionista:** para gerar de novo um recibo, não basta apagar o link: o PDF antigo precisa ir para a lixeira (senão o kit religa o antigo). Manuais atualizados.
- **Risco residual (aceito):** se o link de um pagamento for apagado à mão e o PDF antigo continuar na pasta, o kit religa o antigo em vez de gerar um novo (comportamento desejado por R1).

## A-02 Modelo e pasta de recibos podiam duplicar

- **Encontrado em:** `criarModeloEPastaDeRecibos` (roteiro, item 11), commit `4ead36c`: decisão de criar fora da trava; modelo criado e id não gravado deixava um órfão e a repetição criava outro.
- **ANTES:** `tests/modelo-pasta-idempotencia.test.js` (9 casos) falha contra o código anterior (concorrência simulada, falha ao gravar o id, id repetido).
- **CORREÇÃO:** a operação roda dentro de `comTrava_` relendo as Configurações; modelo e pasta nascem com a propriedade `kit_papel`; se sobrou um órfão (fora da lixeira) ele é reaproveitado; dois ou mais órfãos param a operação; id repetido ou numérico em Configurações recusa em vez de criar outro.
- **DEPOIS:** 9 casos passam. **REGRESSÃO:** o mesmo arquivo; mutações M31 e M32. **EVIDÊNCIA:** E2 (Drive real N/M).
- **Corrigido em:** `4fd38e2`. Mudança de comportamento: para recriar um modelo ruim, mandar o antigo para a lixeira e apagar o id (mensagem do kit atualizada).

## A-03 Relatório do mês sem trava

- **Encontrado em:** `gerarRelatorioMensal` (roteiro, item 12), `4ead36c`: lia Pagamentos, limpava a aba e criava/substituía o CSV sem trava.
- **CORREÇÃO:** `gerarRelatorioMensal` roda em `comTrava_`. A fonte financeira só é lida: nenhuma falha altera dinheiro (testado).
- **DEPOIS/REGRESSÃO:** `tests/relatorio-integridade.test.js` (5 casos); mutação M30. **EVIDÊNCIA:** E2. **Corrigido em:** `4fd38e2`.

## A-04 Instalação, gatilho e preços sem trava

- **Encontrado em:** inventário do item 10 do roteiro: `instalarPlanilha`, `ativarSincronizacaoAutomatica` e `definirPrecosDasConsultas` não usavam trava (verificar-e-criar sem exclusão mútua; dois gatilhos por corrida).
- **CORREÇÃO:** os três passam a rodar em `comTrava_`. **REGRESSÃO:** `tests/operacoes-idempotentes.test.js`, `tests/ramos-criticos.test.js` (preços); mutação M35. **EVIDÊNCIA:** E2. **Corrigido em:** `4fd38e2` (instalação e gatilho) e `4a10c69` (preços).

## A-05 Reconciliação de pacote podia gravar `usadas` maior que o total

- **Encontrado em:** `reconciliarPacotes` (roteiro, item 30), `4ead36c`: com mais pagamentos de pacote do que `total_consultas`, gravava `usadas > total`, violando 0 ≤ usadas ≤ total, sem avisar.
- **ANTES:** 3 testes de `tests/invariantes-financeiros.test.js` falham contra o código anterior.
- **CORREÇÃO:** `usadas` sobe só até o total e nunca desce; o excesso vira aviso na tela e no Registro (sem dado de paciente: só o código); pacote com total inválido não é mexido. O consumo legítimo nunca é diminuído.
- **REGRESSÃO:** `invariantes-financeiros.test.js` (inclui propriedade com 800 cenários); mutações M14, M15, M16. **EVIDÊNCIA:** E2. **Corrigido em:** `b956574`.

## A-06 Agenda: id repetido na resposta

- **Encontrado em:** `planejarSincronizacaoAgenda` (roteiro, item 27), `4ead36c`: o mesmo id duas vezes na resposta gerava duas linhas com o mesmo `id_evento` (cobrança e recibo ligam por essa chave); evento cancelado com o mesmo id de um confirmado cancelava a consulta.
- **CORREÇÃO:** repetidos contam uma vez e viram aviso; o contraditório não cancela (preferir não agir). **REGRESSÃO:** `tests/agenda-adversa.test.js`; mutações M23, M24. **EVIDÊNCIA:** E2. **Corrigido em:** `924b98c`.

## A-07 Id de pagamento pode ser reaproveitado (ABERTO, BAIXO)

- **Encontrado em:** `proximoNumeroPagamento` (roteiro, item 29): o próximo número vem do maior id presente na planilha. Apagar a última linha de Pagamentos libera o número dela.
- **Impacto:** o recibo é identificado por (id do pagamento, código do paciente). Um id reaproveitado para o mesmo paciente poderia religar o PDF do pagamento apagado. Exige apagar à mão a última linha, ter recibo emitido e gerar nova cobrança do mesmo paciente.
- **Opção de correção (não aplicada, muda dado persistido):** guardar o maior número já emitido em `PropertiesService` do documento. Fica para decisão do Caio.

## A-08 Dois CSVs de mesmo nome (ABERTO, BAIXO)

- **Encontrado em:** `driveAcharNaPasta` pede `pageSize: 1`. Se alguém copiar à mão o `Relatorio-AAAA-MM.csv` na pasta, só o primeiro é substituído.
- **Impacto:** relatório antigo duplicado na pasta; a planilha e o CSV certo continuam corretos.

## A-09 Agenda: instante sem fuso explícito dependia da máquina

- **Encontrado em:** `dataHoraLocal` (roteiro, item 26): `'2026-10-05T10:00:00'` virava 07:00 numa máquina em UTC e 11:00 em Nova York.
- **CORREÇÃO:** exige `Z` ou `±hh:mm`; sem isso o evento é ignorado. A API do Google Agenda sempre envia o fuso. **REGRESSÃO:** `agenda-adversa.test.js` roda o mesmo cálculo em 4 fusos de máquina; mutação M25. **EVIDÊNCIA:** E2. **Corrigido em:** `924b98c`.
- **N/M:** horário de verão anterior a 2019 (o kit assume UTC-3 o ano todo, D13).

## A-10 Cobertura não contava o código carregado no Google simulado

- **Encontrado em:** etapa C: a cobertura nativa do Node ignorava os arquivos de `src/` carregados com `vm` sem nome de arquivo (`GeradorRecibo.js`, `SincronizarAgenda.js` etc. nem apareciam). **CORREÇÃO:** `filename` como URL de arquivo no simulador. **Corrigido em:** `4a10c69`.

## A-11 Proteção contra fórmula incompleta e duplicada

- **Encontrado em:** roteiro, item 24. Três cópias da regra `/^[=+\-@]/` (Registro, Relatório, Respostas), nenhuma cobrindo tabulação, retorno de carro ou espaço invisível antes do sinal; texto digitado e regravado pelo kit em Pagamentos (`gravarLinha`) dependia só do formato texto da célula.
- **CORREÇÃO:** `neutralizarFormula` em `src/Formatos.js` é a única regra; Registro, Relatório (aba e CSV), Respostas e a camada de escrita de `LeitorAbas.js` (`adicionarLinhas`, `gravarLinha`, `gravarCelula`) passam por ela. `＝` de largura total não é fórmula em nenhum dos dois leitores e não é alterado.
- **REGRESSÃO:** `tests/seguranca-local.test.js`; mutações M29, M29b, M37. **EVIDÊNCIA:** E2. **N/M:** como o Excel e o Google Planilhas tratam um valor que começa com espaço seguido de `=` (o kit mantém a escolha anterior, o espaço) só se vê abrindo o CSV nos programas (roteiro em `GOOGLE-REAL.md`, item 14).
- **Corrigido em:** commit da etapa D (ver `git log`).

## A-12 Mensagem crua de erro na tela (ABERTO, BAIXO)

- `executarNoMenu_` mostra `e.message` de erro inesperado na caixa de diálogo. Não é canal de log (só a dona vê), mas ela pode tirar foto para o suporte. As mensagens do Google, nos testes, não trazem dado de paciente; o kit nunca monta mensagem de erro com nome ou CPF. Opção: trocar por texto fixo e deixar o detalhe só no Registro. Muda a experiência de suporte: decisão do Caio.

## A-13 Registro de exceções (Stackdriver)

- Ver `docs/gate/SEGURANCA-LOCAL.md`, seção "Registro de exceções". Resultado: com erro fictício contendo nome, CPF e condição lançado em 11 pontos do Google simulado e 20 funções de menu mais o gatilho, nenhuma exceção crua escapou e nenhum texto fictício chegou a Registro, e-mail, nome de arquivo ou `Logger`. O que escapa por desenho são funções internas chamadas direto pelo editor do Apps Script e o `onOpen`.

## A-14 Configuração acoplada entre funcionalidades

- **Encontrado em:** roteiro, item 33. `lerConfiguracoes()` interrompia com QUALQUER erro de configuração, em todas as funcionalidades. Pix com chave em branco impedia sincronizar a agenda, gerar "a receber", montar o relatório e gerar recibo.
- **ANTES:** `tests/configuracao-dominios.test.js` (e os ajustes em `falhas.test.js`) exercitam cada funcionalidade com uma configuração alheia errada: contra o código anterior, a funcionalidade parava.
- **CORREÇÃO:** `DOMINIOS_CONFIGURACAO` (agenda, pagamento, pix, recibo, relatório, alertas) em `src/Configuracoes.js` e `lerConfiguracoes(dominios)` em `src/LeitorConfiguracoes.js`: só os erros das chaves do domínio da funcionalidade interrompem. A regra de validação continua em um lugar só (`validarConfiguracoes`); os chamadores informam o que usam. Sem argumento vale a regra antiga (qualquer erro interrompe).
- **DEPOIS:** cada funcionalidade só para por configuração que ela própria usa; a mensagem lista só os erros do domínio.
- **REGRESSÃO:** `tests/configuracao-dominios.test.js`; mutação M43 (volta ao acoplamento antigo, detectada). **EVIDÊNCIA:** E2.
- **Intenção preservada:** `falhas.test.js` tinha testes que codificavam o acoplamento antigo (Pix inválido bloqueia a sincronização); foram atualizados mantendo o objetivo (a configuração do domínio continua sendo exigida) usando `calendario_id` numérico no lugar da chave Pix. Esta mudança é consequência direta do item 33 do roteiro.
- **Corrigido em:** commit da etapa B/D (ver `git log`).

## A-15 Pix aceitava valor que estoura o campo do padrão

- **Encontrado em:** roteiro, itens 25 e 32: sonda com valores extremos. `valorCentavos` de 10 elevado a 12 em diante, `Number.MAX_SAFE_INTEGER`, `2 ** 53` e `1e21` geravam payload com o campo 54 (valor) de 14 a 23 caracteres, acima dos 13 que o padrão permite; o CRC fechava, mas o banco recusaria o código.
- **ANTES:** `tests/limites-pix.test.js` rodado contra o `src/Pix.js` anterior: 3 dos 14 casos falham (valor máximo, valores absurdos, mensagem sem valor).
- **CORREÇÃO:** `Number.isSafeInteger` e teste do tamanho do texto do valor (`LIMITE_VALOR_PIX = 13`, até R$ 9.999.999.999,99). A mensagem diz o limite, não repete o valor digitado. Na prática o preço do kit já tem teto de R$ 100.000,00 (`lerReais`); o guarda do Pix é a segunda barreira.
- **DEPOIS:** os 14 casos passam (1 centavo, valor máximo, absurdos, nome 25/26, acento, caractere não aceito, cidade 15/16, chave em cada formato e formatos inválidos, id da transação, CRC adulterado em cada posição, 300 payloads aleatórios com semente fixa).
- **REGRESSÃO:** `tests/limites-pix.test.js`; mutação M44 (detectada). `Number.isSafeInteger` no lugar de `Number.isInteger` é defesa em profundidade: o teste de tamanho já barra os mesmos valores, então trocá-lo não é detectável (mutante equivalente, não contado).
- **EVIDÊNCIA:** E2. **N/M:** aceitação do código por um aplicativo de banco real (roteiro em `GOOGLE-REAL.md`, item sobre Pix).
- **Corrigido em:** commit da etapa B/D (ver `git log`).
