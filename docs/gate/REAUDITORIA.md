# Reauditoria do Gate de Continuidade (etapa H, entrega do item 45)

Escrita em 01/10/2026. Este documento **não calcula uma nota nova** (ver seção K) e **não declara nada como validado no Google** (seção H): ele reúne a evidência para que um revisor independente tente reprovar a fundação e meça por conta própria. Onde a evidência é fraca, está escrito. Legenda: **E1** execução observada no ambiente real onde aquilo roda; **E2** teste automatizado contra o Google simulado; **E3** análise estática; **E4** documentação; **N/M** não medido.

Duas observações de método:

- **E1 nesta rodada vale para o procedimento de verificação** (o gate rodou num clone limpo; o CI do GitHub rodou), **não para o comportamento do Google**. Nada do Google real foi observado.
- O código foi congelado antes desta reauditoria. Depois do congelamento só mudaram documentos (a seção de fechamento no fim confere isso com `git diff`).

## A. Commit auditado

| Campo | Valor |
|---|---|
| SHA do código congelado | `940700e49ea7018dec1d8d7ce69d50aaea9f6e7f` (curto: `940700e`); o último commit da branch só altera documentos (ver "Fechamento") |
| Data | 01/10/2026 |
| Branch | `claude/gate-continuidade-96uxks` (PR #16 contra a `main`; não mesclado) |
| Base | `4ead36c` (main da auditoria anterior) |

## B. Execução (clone limpo do commit congelado, `node scripts/gate.js --estrito`)

| Campo | Valor |
|---|---|
| Node | v22.22.0 (`.nvmrc`); outras versões e Windows/macOS não testados (N/M) |
| Testes executados | 560 |
| Aprovados | 560 |
| Falhos | 0 |
| Ignorados | 0 |
| Duração da suíte | cerca de 4,7 s (`node --test`) |
| Resultado do gate | PASS (1 não medido: a mutação, que roda à parte, leva alguns minutos) |
| Mutação manual | 57 de 57 detectadas (`docs/gate/MUTACOES.md`); lista escrita à mão, **não é exaustiva** |

## C. Cobertura (Node nativo, sem dependência; código de `src/` contra o Google simulado)

| Medida | Resultado |
|---|---|
| Linhas | 100,0% (3366/3366) |
| Ramos | 98,7% (1547/1568) |
| Funções | 100,0% (402/402) |
| "Statements" | **N/M**: o relatório nativo do Node só traz linhas, ramos e funções |

Módulos críticos (piso do gate: linhas ≥ 99%, ramos ≥ 95%, funções ≥ 99%; medido, de `docs/gate/COBERTURA.md`):

| Módulo | Linhas | Ramos | Funções |
|---|---|---|---|
| Acoes, Agenda, Alertas, Configuracoes, DriveAvancado, Execucao, Formatos, GeradorRecibo, GerarAReceber, GerarRelatorio, LeitorConfiguracoes, Menu, Pagamentos, Pix, Precos, Recibo, Relatorio, SincronizarAgenda | 100% | 100% | 100% |
| LeitorAbas | 100% (106/106) | 97,1% (67/69) | 100% |
| Registro | 100% (106/106) | 97,2% (35/36) | 100% |

Os três ramos de módulo crítico que não executam estão classificados (DEFENSIVO ou INATINGÍVEL) em `COBERTURA.md`. Cobertura mostra que o código **roda** na suíte; não prova que o Google real se comporta como o simulador.

## D. Integridade das operações críticas

Detalhe por fluxo (entrada, leituras, escritas, ponto de commit, falhas, retry, reconciliação, teste): `docs/gate/MATRIZ-INTEGRIDADE.md`. Resumo (tudo E2):

| Operação | Lock | Idempotência | Retry | Reconciliação | Falha parcial testada | Teste |
|---|---|---|---|---|---|---|
| Sincronizar agenda | sim, antes de ler | por `id_evento` | seguro (plano recalculado) | ausente da leitura é conferido com `Calendar.get`; sem resposta não cancela | página 2, `get`, linha movida | `tests/agenda-adversa.test.js`, `tests/falhas.test.js`, `tests/operacoes-idempotentes.test.js` |
| Gerar a receber | sim | uma cobrança por evento | seguro | consulta com pagamento é pulada | repetido e paralelo | `tests/pagamentos.test.js`, `tests/operacoes-idempotentes.test.js` |
| Marcar pago / cortesia | sim | 2ª vez recusada | seguro (só parte de a receber) | estado do pagamento | linha movida | `tests/menu.test.js`, `tests/invariantes-financeiros.test.js` |
| Consumir pacote | sim | por pagamento | seguro | `usadas` reconciliado pelos pagamentos, nunca acima do total | falha só em `usadas`, excesso | `tests/invariantes-financeiros.test.js`, `tests/regressoes-revisao.test.js` |
| Gerar Pix | não escreve | sim (função pura) | seguro | não se aplica | não se aplica | `tests/pix.test.js`, `tests/limites-pix.test.js` |
| **Gerar recibo** | sim, antes de ler | um PDF ativo por pagamento | seguro | **por identidade gravada no PDF antes de criar**; dois PDFs: para sem criar | falha em cada um dos 9 passos, resposta perdida do Drive, paralelo | `tests/recibo-idempotencia.test.js` |
| Gerar relatório | sim | mesma aba, mesmo CSV | seguro | aba refeita, CSV substituído pelo nome | aba, CSV, resposta perdida | `tests/relatorio-integridade.test.js` |
| Criar modelo e pasta | sim, relendo configuração | nunca troca id preenchido | seguro | reaproveita pelo papel gravado no arquivo | gravar id, criar, duplicado | `tests/modelo-pasta-idempotencia.test.js` |
| Instalar planilha | sim | só cria o que falta | seguro | cabeçalhos conferidos | repetido e paralelo | `tests/instalador.test.js`, `tests/operacoes-idempotentes.test.js` |
| Ativar sincronização | sim | um gatilho só | seguro | confere gatilhos existentes | repetido e paralelo | `tests/operacoes-idempotentes.test.js` |
| Definir preços | sim | regrava o mesmo valor | seguro | o 1º preço fica e o 2º não muda; repetir termina | falha entre as duas gravações | `tests/precos-falha-parcial.test.js` |

Propriedades gerais (`0 <= usadas <= total`, ids de pagamento únicos, nenhum recibo duplicado, relatório igual à soma dos pagamentos) têm testes com cenários gerados de semente fixa (`tests/invariantes-financeiros.test.js`).

## E. Segurança

Detalhe: `docs/gate/SEGURANCA-LOCAL.md`, `docs/gate/SERVICOS-GOOGLE.md`.

| Tema | Testado (E2/E3) | Continua N/M |
|---|---|---|
| Segredos | varredura do HEAD e de **todo o histórico** (todos os commits dos refs buscados), com controles positivos; o valor achado nunca é impresso | branches apagadas, forks e objetos soltos |
| Dados pessoais | e-mail e CPF fora da lista de exemplos, em arquivos rastreados e no histórico; nada de nome, CPF ou texto de erro em Registro, e-mail, nome de arquivo e `Logger` (teste com erro fictício em 11 pontos e 20 funções de menu) | dado real nunca foi usado; só se prova ausência do que o varredor reconhece |
| OAuth | seis escopos de produção, cada um justificado; produção recusa `drive` amplo e `calendar` de escrita; serviço, escopo, web app ou biblioteca novos reprovam o gate | o que o Google **realmente** concede (item 5 de `GOOGLE-REAL.md`) |
| Logs | Registro só recebe módulo e tipo de listas fechadas; falha do próprio registro cai no `Logger` sem o texto | o que o Stackdriver guarda de uma exceção que escapa de função interna (A-13) |
| Injeção de fórmula | uma regra só (`neutralizarFormula`), usada em Registro, Relatório, CSV, Respostas e na escrita de abas; tabulação, retorno de carro e espaço invisível incluídos | como o Excel e o Google Planilhas tratam o texto neutralizado ao abrir o CSV (item 14) |
| Isolamento entre contas | **nada**: nenhum teste local prova isolamento | roteiro Conta A x Conta B (item 18); a autorização por paciente e consultório da ponte (D35) ainda não existe |

## F. Produção

Resultado de `node scripts/empacotar-producao.js` (conferido pelo gate): "Pacote de produção montado em dist/producao/ (23 arquivos)".

| Item | Valor |
|---|---|
| Arquivos | 23 módulos `.js` + `appsscript.json` (24 na pasta; o empacotador conta os 23 módulos) |
| Escopos | `spreadsheets.currentonly`, `script.send_mail`, `calendar.events.readonly`, `script.scriptapp`, `documents`, `drive.file` |
| Serviços avançados | Calendar v3 e Drive v3 |
| Geradores e esqueletos excluídos | `DadosTeste.js`, `GeradorTeste.js` (teste) e `FilaAjustes.js`, `Frases.js`, `Modos.js`, `Presenca.js`, `Respostas.js` (esqueletos T20 a T24, achado A-16) |
| Manifesto | fuso `America/Sao_Paulo`, V8, `exceptionLogging: STACKDRIVER`, sem web app e sem biblioteca |
| Verificador | recusa marca de teste, escrita na agenda, código P9xxx, e-mail inventado, escopo fora da lista, esqueleto no pacote |

## G. CI

| Execução | Commit | Resultado |
|---|---|---|
| Primeira execução (workflow **recusado** pelo GitHub: erro de YAML, zero jobs; achado A-19) | `abdc8c2` | falha, corrigida |
| Pull request nº 16, job **Gate local** (`node --test`, cobertura, `git diff --check`, empacotar produção, segurança com histórico, `node scripts/gate.js --estrito`; job nº 110243719150, 33 s) | `940700e` | **sucesso**: 560 testes, 560 aprovados, 0 falhas, 0 ignorados; gate estrito PASS |
| Pull request nº 16, job **Mutação manual (consultivo)** (job nº 110243719029, cerca de 4 min) | `940700e` | **sucesso**: 57/57 mutações detectadas, num segundo ambiente (Linux do GitHub) |

Onde ver: aba Checks do PR nº 16 ou `https://github.com/ccaporasso/NutriMolda/commit/940700e49ea7018dec1d8d7ce69d50aaea9f6e7f/checks`. Os números de execução do GitHub não são copiados aqui porque têm 11 dígitos e o varredor de dados pessoais do kit (de propósito) não os distingue de CPF. O GitHub avisa que `actions/checkout@v4` e `actions/setup-node@v4` rodam forçadas em Node 24 (informativo; atualizar junto com a decisão de fixar por SHA).

Não aplicado: proteção da `main` (só recomendada: exigir o job "Gate local"); ações oficiais fixadas por tag, não por SHA (recomendação aberta). O job de mutação é consultivo.

## H. Google real

Roteiro completo em `docs/gate/GOOGLE-REAL.md` (conta descartável A e B, dados fictícios, nada na conta da cliente). **Nenhum cenário foi executado nesta rodada**; este trabalho não tem acesso ao Google.

| # | Cenário | Executado? | Resultado | Evidência |
|---|---|---|---|---|
| 1 a 3 | Contas, instalação duas vezes, primeira autorização | não | N/M | nenhuma |
| 4 | Dados de teste, sincronizar, apagar e remarcar evento | não | N/M | nenhuma |
| 5 | Escopos concedidos e consulta por `appProperties` com `drive.file` | não | N/M | nenhuma |
| 6 a 8 | A receber, pagamentos, pacote | não | N/M | nenhuma |
| 9 | Pix colado em aplicativo de banco | não | N/M | nenhuma |
| 10 | **Recibo**: repetir, apagar só o link, lixeira, falha entre PDF e link | não | N/M | nenhuma |
| 11 | Concorrência real em duas abas | não | N/M | nenhuma |
| 12 a 14 | Relatório, gatilho de 24 h, CSV no Excel e Planilhas | não | N/M | nenhuma |
| 15 a 17 | Alerta real, homônimos, pagamento sem CPF | não | N/M | nenhuma |
| 18 | Isolamento Conta A x Conta B | não | N/M | nenhuma |
| 19 a 21 | Escala real, falha de rede e cota, repetir depois de nova versão | não | N/M | nenhuma |

O que isto significa para o eliminador do recibo: a correção depende de o Drive aceitar a consulta por `appProperties` para arquivos criados pelo kit com o escopo `drive.file`. Os testes provam a lógica contra um simulador que foi escrito para refletir essa regra, **não a regra em si**. Se o Google se comportar de outro modo, a reconciliação não acharia o PDF antigo e o risco voltaria. Só o item 5 do roteiro resolve.

## I. Achados restantes

| Id | Descrição | Classe | Quem decide |
|---|---|---|---|
| (N/M) | Comportamento real do Google (item 5, 10 e 11 do roteiro) ainda não observado | MÉDIO (impacto alto, probabilidade que não se mede aqui) | executar `GOOGLE-REAL.md` |
| (N/M) | Proteção da `main` não aplicada; ações do CI não fixadas por SHA | MÉDIO | Caio (configuração do GitHub) |
| A-07 | Id de pagamento pode ser reaproveitado se a última linha for apagada | BAIXO | documentado |
| A-08 | Dois CSVs de mesmo nome já existentes: só o primeiro é substituído | BAIXO | documentado |
| A-12 | Mensagem crua de erro inesperado aparece na tela da nutricionista | BAIXO | Caio |
| A-17 | Erro inesperado no gatilho manda um e-mail por execução (até 24 por dia) | BAIXO | Caio |
| A-13 | `exceptionLogging: STACKDRIVER` mantido (análise feita) | INFORMATIVO | Caio |
| (info) | Retenção do Registro: política proposta, não decidida (`RETENCAO-REGISTRO.md`) | INFORMATIVO | Caio |
| (info) | Decisões DG1 a DG6 em `docs/DECISOES.md` são propostas até o Caio aceitar | INFORMATIVO | Caio |
| (info) | Ações do CI (`checkout@v4`, `setup-node@v4`) rodam forçadas em Node 24: aviso do GitHub | INFORMATIVO | próximo ciclo (junto com fixar por SHA) |
| (info) | Mutação é lista manual; cobertura não tem "statements"; só Node 22.22.0 em Linux foi usado | INFORMATIVO | próximo ciclo |

Não há achado CRÍTICO nem ALTO conhecido aberto. "Conhecido" quer dizer: encontrado por este trabalho com os meios locais.

## J. Eliminadores

Os sete eliminadores do Gate v1.0 **não estão no repositório nem no roteiro entregue a este trabalho**. Por isso não os numerei nem inventei critérios: quem aplica a régua responde os sete com a evidência desta página. O único que este trabalho conhece (o da auditoria anterior) está respondido; os critérios de liberação do item 42 do roteiro estão cruzados ao lado, como apoio, **sem** substituir a régua.

| Eliminador / critério | Resposta | Evidência |
|---|---|---|
| Idempotência da geração de recibo depois de falha parcial (o eliminador da auditoria anterior) | **NÃO existe mais, no que o simulador representa** (E2); comportamento real do Drive N/M | `tests/recibo-idempotencia.test.js`; achado A-01 |
| Item 42: nenhum eliminador | depende da régua; o conhecido: NÃO | acima |
| Item 42: testes locais integralmente verdes | SIM (560/560; clone limpo) | seção B |
| Item 42: build de produção verde | SIM | seção F |
| Item 42: CI verde | SIM no commit congelado (dois jobs, E1) | seção G |
| Item 42: falha parcial do recibo corrigida e testada | SIM (E2) | seção D |
| Item 42: operações críticas com idempotência conhecida | SIM (as 12 operações do inventário; o Pix só lê) | seção D |
| Item 42: nenhum achado de segurança alto ou crítico | SIM no que se mede localmente; isolamento entre contas e OAuth real N/M | seção E |

## K. Nova pontuação

**Não recalculada aqui.** A régua do Gate v1.0 (pesos, limiares e a lista dos sete eliminadores) não foi entregue a este trabalho, e o roteiro proíbe alterar ou aproximar a régua e atribuir notas antecipadas. Atribuir um número agora seria inventar a régua. O cálculo cabe ao revisor independente, com os insumos abaixo.

### Matriz de evidência por dimensão (as sete do item 43 do roteiro)

| Dimensão | E1 | E2 | E3 | E4 | N/M |
|---|---|---|---|---|---|
| Correção funcional | gate num clone limpo; CI do GitHub verde | 560 testes, fluxo completo agenda → recibo → relatório, regressão de cada achado | inventário de código, sem esqueleto em produção | manuais corrigidos | Google real (seção H) |
| Testabilidade | — | cobertura 100% / 98,7% / 100%; 57 mutações detectadas; matriz de integridade | `scripts/cobertura.js --exigir` falha se módulo crítico some da medição | `COBERTURA.md`, `MUTACOES.md` | "statements"; mutação exaustiva |
| Arquitetura | — | lógica pura separada das chamadas ao Google, testada isoladamente | `COMPLEXIDADE.md` (mistura de responsabilidades medida), `INVENTARIO-CODIGO.md` | `DECISOES.md` | nenhuma refatoração feita só por estética |
| Integridade | — | seção D; invariantes com cenários gerados; falha injetada em cada passo | trava antes de ler, identidade conferida antes de gravar | `MATRIZ-INTEGRIDADE.md` | Google real: `appProperties`, `LockService`, atomicidade do Planilhas |
| Segurança | — | seção E: segredos, dados pessoais, escopos, fórmula, logs | lista de escopos e serviços | `SEGURANCA-LOCAL.md`, `SERVICOS-GOOGLE.md` | isolamento entre contas, OAuth concedido, Stackdriver, Excel |
| Eficiência | — | operações contadas, não cronometradas; n² corrigido (A-18) | `COMPLEXIDADE.md` | `DESEMPENHO.md`, `RETENCAO-REGISTRO.md` | tempo e cota reais no Google (itens 19 e 20) |
| Disciplina | gate no clone limpo; CI do GitHub (dois jobs verdes no commit congelado) | gate com piso de testes; teste de sintaxe do workflow (A-19); todo SHA citado existe | Node fixado, sem dependências, só ações oficiais | `REPRODUCAO.md`, `ACHADOS.md` com histórico | proteção da `main`; fixar ações por SHA; outros Node e sistemas |

### Como repetir

```
git clone https://github.com/ccaporasso/NutriMolda.git && cd NutriMolda
git checkout <SHA do código congelado>
node --version        # 22.22.0
node scripts/gate.js --estrito
node scripts/gate.js --mutacao   # leva alguns minutos
```

Detalhes e limites: `docs/gate/REPRODUCAO.md`.

## Fechamento

| Campo | Valor |
|---|---|
| SHA do código congelado | `940700e49ea7018dec1d8d7ce69d50aaea9f6e7f` |
| O que mudou depois dele | só `docs/gate/REAUDITORIA.md` e `docs/gate/ACHADOS.md` (o commit de fechamento); conferido com `git diff 940700e HEAD --stat -- src scripts tests .github package.json .nvmrc`, que não lista nenhum arquivo |
| CI no commit congelado | sucesso nos dois jobs (seção G) |
| CI no commit de fechamento | roda como o de qualquer outro push do PR; o resultado aparece na aba Checks (não é copiado aqui para este documento não precisar de outro commit para registrá-lo) |
