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
