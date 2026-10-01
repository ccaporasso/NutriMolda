# Reauditoria do Gate de Continuidade (etapa H, entrega do item 45)

Escrita em 01/10/2026. Reúne a evidência para um revisor independente tentar reprovar a fundação e **aplica a régua do Gate v1.0**, que o Caio entregou depois da primeira versão deste documento (seção K). A nota e as respostas aos eliminatórios foram feitas por quem escreveu o código: são **autoavaliação**, com as entradas em `docs/gate/CRITERIOS.md` e o cálculo em `scripts/pontuacao.js`, para o revisor trocar as entradas e refazer a conta. Onde a evidência é fraca, está escrito. Legenda: **E1** execução observada no ambiente real onde aquilo roda; **E2** teste automatizado contra o Google simulado; **E3** análise estática; **E4** documentação; **N/M** não medido.

Duas observações de método:

- **E1 nesta rodada vale para o procedimento de verificação** (o gate rodou num clone limpo; o CI do GitHub rodou), **não** para o comportamento do Google: nenhum cenário do Google foi executado nesta rodada. Existe E1 do Google, mas é de 30/09, no código anterior às mudanças desta rodada (a seção H separa o que foi observado do que mudou depois).
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
| Testes executados | 577 |
| Aprovados | 577 |
| Falhos | 0 |
| Ignorados | 0 |
| Duração da suíte | cerca de 5 s (`node --test`) |
| Resultado do gate | PASS (1 não medido: a mutação, que roda à parte, leva alguns minutos) |
| Mutação manual | 60 de 60 detectadas (`docs/gate/MUTACOES.md`); lista escrita à mão, **não é exaustiva** |

## C. Cobertura (Node nativo, sem dependência; código de `src/` contra o Google simulado)

| Medida | Resultado |
|---|---|
| Linhas | 100,0% (3387/3387) |
| Ramos | 98,7% (1555/1576) |
| Funções | 100,0% (403/403) |
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
| **Gerar recibo** | sim, antes de ler | um PDF ativo por pagamento | seguro | **por identidade (pagamento e paciente) e impressão do conteúdo (valor, data, forma) gravadas no PDF antes de criar**; dois PDFs ou PDF que não confere: para sem criar nem ligar (A-20) | falha em cada um dos 9 passos, resposta perdida do Drive, número reaproveitado, valor corrigido depois da falha, paralelo | `tests/recibo-idempotencia.test.js` |
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
| Pull request nº 16, job **Gate local** (versão anterior do código, 560 testes) | `940700e` | sucesso: gate estrito PASS |
| Pull request nº 16, job **Mutação manual (consultivo)** (versão anterior, 57 mutações) | `940700e` | sucesso: 57/57 detectadas |
| Código congelado desta reauditoria (577 testes, 60 mutações, régua aplicada): dois jobs | ver "Fechamento" | ver "Fechamento" |

O resultado do commit congelado só entra no documento depois de observado, no commit de fechamento (que só toca em documentos). Onde ver: aba Checks do PR nº 16. Os números de execução do GitHub não são copiados aqui porque têm 11 dígitos e o varredor de dados pessoais do kit (de propósito) não os distingue de CPF. O GitHub avisa que `actions/checkout@v4` e `actions/setup-node@v4` rodam forçadas em Node 24 (informativo; atualizar junto com a decisão de fixar por SHA).

Não aplicado: proteção da `main` (só recomendada: exigir o job "Gate local"); ações oficiais fixadas por tag, não por SHA (recomendação aberta). O job de mutação é consultivo.

## H. Google real

Roteiro completo em `docs/gate/GOOGLE-REAL.md` (conta descartável A e B, dados fictícios, nada na conta da cliente). **Nenhum cenário foi executado nesta rodada**; este trabalho não tem acesso ao Google. A validação real de 30/09 (`docs/RESULTADOS-GOOGLE-2026-09-30.md`, código `979b202` e correção `3ad3b96`, cópia descartável, pacientes fictícios) **existe e é E1**, mas é do código **anterior** à rodada do Gate. Esta tabela separa as duas coisas, sem misturar.

O que a rodada do Gate **mudou no caminho do Google** (e que, por isso, volta a precisar de observação): recibo reconciliado por propriedades do arquivo no Drive e conferência de conteúdo (A-01, A-20); escrita da sincronização por faixa (A-18); modelo e pasta reconciliados; trava antes de ler em todas as operações que escrevem; configuração validada por domínio.

| # | Cenário | Observado em 30/09, código anterior (E1) | Nesta rodada |
|---|---|---|---|
| 1 | Contas, planilhas, agendas secundárias | cópia descartável e agendas secundárias, sim; contas A e B separadas, não | N/M |
| 2 | Instalar duas vezes | sim: abas e chaves preservadas, sem duplicar | N/M (instalador mudou: trava e leitura por faixa) |
| 3 | Primeira autorização (tela de consentimento) | **não**: a tela nova não foi inspecionada | N/M |
| 4 | Sincronizar, apagar e remarcar evento | sim: cancelamento confirmado, remarcação sem duplicar, troca de agenda | N/M (escrita por faixa e conferência de ausência mudaram) |
| 5 | Escopos concedidos e consulta por `appProperties` com `drive.file` | **não**: nunca observado | N/M |
| 6 | A receber, preço suspeito, cortesia, faltou | a receber e repetição, sim; preço baixo, cortesia e presença **não** | N/M |
| 7 | Marcar pago, segunda vez, aba errada | marcar pago por Pix, sim; segunda vez e aba errada **não** | N/M |
| 8 | Pacotes | consumo, esgotamento e renovação, sim; `usadas` apagado à mão e falha entre escritas **não** | N/M |
| 9 | Pix no aplicativo de banco | sim (recebedor e valor conferidos); valor alto e chave inválida **não** | N/M |
| 10 | **Recibo**: repetir, só o link apagado, lixeira, falha entre PDF e link | PDFs inspecionados e links preservados na repetição, sim; **a reconciliação por identidade e conteúdo é nova e nunca foi observada** | N/M |
| 11 | Concorrência real em duas abas | **não** | N/M |
| 12 | Relatório e CSV | sim | N/M |
| 13 | Gatilho de 24 h | criar, repetir sem duplicar e execução automática, sim; 24 h cronometradas **não** | N/M |
| 14 | CSV no Excel e no Planilhas | **não** | N/M |
| 15 | Alerta real | e-mail de teste, sim; erro inesperado real **não** | N/M |
| 16 | Homônimos | **não** | N/M |
| 17 | Pagamento sem CPF | **não** (30/09 recusou valor ausente, não CPF) | N/M |
| 18 | Isolamento Conta A x Conta B | **não** | N/M |
| 19 | Escala real | grade de 5 para 512 linhas, sim; 1.000 consultas e tempos **não** | N/M |
| 20 | Falha de rede e cota | **não** | N/M |
| 21 | Repetir depois de nova versão | **não** | N/M |

O que isto significa para o eliminador do recibo: a correção depende de o Drive aceitar a consulta por `appProperties` para arquivos criados pelo kit com o escopo `drive.file`. Os testes provam a lógica contra um simulador que foi escrito para refletir essa regra, **não a regra em si**. Se o Google se comportar de outro modo, a reconciliação não acharia o PDF antigo e o risco voltaria. Só o item 5 do roteiro resolve.

## I. Achados restantes

| Id | Descrição | Classe | Quem decide |
|---|---|---|---|
| (N/M) | Comportamento real do Google (item 5, 10 e 11 do roteiro) ainda não observado | MÉDIO (impacto alto, probabilidade que não se mede aqui) | executar `GOOGLE-REAL.md` |
| (N/M) | Proteção da `main` não aplicada; ações do CI não fixadas por SHA | MÉDIO | Caio (configuração do GitHub) |
| A-07 | Id de pagamento pode ser reaproveitado se a última linha for apagada (a consequência no recibo foi fechada em A-20: o recibo antigo não é religado; o reaproveitamento em si continua) | BAIXO | documentado |
| A-08 | Dois CSVs de mesmo nome já existentes: só o primeiro é substituído | BAIXO | documentado |
| A-12 | Mensagem crua de erro inesperado aparece na tela da nutricionista | BAIXO | Caio |
| A-17 | Erro inesperado no gatilho manda um e-mail por execução (até 24 por dia) | BAIXO | Caio |
| A-13 | `exceptionLogging: STACKDRIVER` mantido (análise feita) | INFORMATIVO | Caio |
| (info) | Retenção do Registro: política proposta, não decidida (`RETENCAO-REGISTRO.md`) | INFORMATIVO | Caio |
| (info) | Decisões DG1 a DG6 em `docs/DECISOES.md` são propostas até o Caio aceitar | INFORMATIVO | Caio |
| (info) | Ações do CI (`checkout@v4`, `setup-node@v4`) rodam forçadas em Node 24: aviso do GitHub | INFORMATIVO | próximo ciclo (junto com fixar por SHA) |
| (info) | Mutação é lista manual; cobertura não tem "statements"; só Node 22.22.0 em Linux foi usado | INFORMATIVO | próximo ciclo |

Não há achado CRÍTICO nem ALTO conhecido aberto. "Conhecido" quer dizer: encontrado por este trabalho com os meios locais.

## J. Eliminatórios

A régua do Gate v1.0 traz sete eliminatórios: qualquer **SIM** dá "NÃO PASSA", qualquer que seja a nota. As respostas abaixo são minhas (autoavaliação) e estão com a evidência em `docs/gate/CRITERIOS.md`, seção 8; `tests/pontuacao.test.js` confere que os sete estão respondidos e que um SIM derruba o resultado.

| Id | Eliminatório | Resposta | Em uma frase |
|---|---|---|---|
| E01 | Possibilidade plausível de corrupção ou perda silenciosa de dados | **NÃO** | Ao aplicar este critério à minha própria correção do recibo achei um caminho (religar o PDF errado se o número do pagamento fosse reaproveitado, A-20) e o fechei; não conheço outro. |
| E02 | Violação grave de isolamento ou autorização | **NÃO** | O kit roda na planilha de uma conta só. **Isolamento real não foi observado** (item 18); a autorização da ponte (D35) ainda não existe. |
| E03 | Segredo ou credencial sensível exposto | **NÃO** | Varredura do HEAD e de todo o histórico, também no CI. |
| E04 | Fluxo central cuja correção não possa ser demonstrada | **NÃO, com condição** | Pode ser demonstrada e o roteiro está pronto. Se o revisor exigir demonstração **real** para dar o recibo por demonstrado, a resposta passa a SIM até executar os itens 5 e 10 de `GOOGLE-REAL.md`. |
| E05 | Testes passando sem testar a implementação correspondente | **NÃO** | O código de `src/` roda de verdade na suíte; 60 mutações, todas detectadas. **Limite:** o simulador do Google foi escrito por mim. |
| E06 | Comportamento não idempotente onde deveria ser idempotente, com consequência relevante | **NÃO** | As 11 operações que escrevem têm teste de repetição, retry, falha parcial e concorrência; os abertos (A-07, A-08, A-17) não mudam dado nem recibo. |
| E07 | Erro arquitetural que torne perigoso continuar adicionando funcionalidades | **NÃO** | Lógica pura separada, esqueletos fora da produção, gate com pisos. A autenticação entre serviços da ponte é trabalho novo, não defeito da base. |

Histórico do eliminador da auditoria anterior (recibo não idempotente depois de falha parcial): **não existe mais, no que o simulador representa** (E2); o comportamento real do Drive é N/M. Evidência: `tests/recibo-idempotencia.test.js` (26 casos), achados A-01 e A-20.

Critérios de liberação do item 42 do roteiro, cruzados como apoio (não substituem a régua): nenhum eliminatório **SIM** (acima); testes locais verdes **SIM** (577/577, seção B); build de produção verde **SIM** (seção F); CI verde **SIM** no commit congelado quando o fechamento o registrar (seção G); falha parcial do recibo corrigida e testada **SIM** (E2); operações críticas com idempotência conhecida **SIM** (seção D); nenhum achado de segurança alto ou crítico **SIM** no que se mede localmente (isolamento entre contas e OAuth real N/M).

## K. Nova pontuação

Régua do Gate v1.0, entregue pelo Caio em 01/10/2026 (pesos 25/20/15/15/15/5/5, limiares de zona por dimensão, faixas finais 85/70/55, sete eliminatórios). Os pesos, limiares e faixas estão como constantes no começo de `scripts/pontuacao.js`; **não os alterei**. O que alterei no repositório foi o que ele prova, não a régua.

Reproduzir: `node scripts/pontuacao.js` (ou `npm run pontuacao`).

### Resultado

nota final E2: 88,1 (PASSA)

nota final conservadora: 73,2 (PASSA COM RESSALVAS)

Eliminatórios: nenhum SIM (seção J; E04 condicional).

**Qual citar:** a **conservadora**, **PASSA COM RESSALVAS**. A régua não diz se um critério vale só com teste ou só com execução real; as duas bases são mostradas e o roteiro manda preferir a evidência mais rigorosa.

- **E2 (suíte):** o critério vale se o comportamento existe e tem teste automatizado.
- **Conservadora:** além do teste, o critério precisa não depender do Google, ou ter sido **observado de verdade** em 30/09 sem o caminho do Google ter mudado depois (seção H). O que a rodada do Gate mudou volta a ser "não observado".

| Dimensão | Peso | Zona E2 | Nota E2 | Zona conservadora | Nota conservadora |
|---|---|---|---|---|---|
| Correção funcional | 25% | APROVA | 95,1 (39 de 41) | REPROVA | 56,1 (23 de 41) |
| Testabilidade / regressão | 20% | APROVA | 100,0 (14 de 14) | APROVA | 100,0 (14 de 14) |
| Arquitetura / manutenibilidade | 15% | ALERTA | 78,0 (78 de 100) | ALERTA | 78,0 (78 de 100) |
| Integridade e confiabilidade | 15% | APROVA | 100,0 (44 de 44) | REPROVA | 65,9 (29 de 44) |
| Segurança / privacidade | 15% | ALERTA | 70,0 (por zona) | ALERTA | 70,0 (por zona) |
| Eficiência técnica | 5% | ALERTA | 70,0 (por zona) | ALERTA | 70,0 (por zona) |
| Disciplina de engenharia | 5% | ALERTA | 71,4 (10 de 14) | ALERTA | 71,4 (10 de 14) |

### Limites desta nota (leia antes de confiar nela)

1. **Autoavaliação.** Eu escolhi os critérios das tabelas de `CRITERIOS.md`, apliquei-os ao meu próprio código e dei a nota de arquitetura. Para a lista não ser só do que passa, entraram os casos que a validação de 30/09 listou como "sem evidência" e os achados abertos (A-07 e A-08 entram como critérios **não atendidos**). Um revisor independente deve trocar as listas e refazer a conta.
2. **Segurança e eficiência** a régua descreve só por zona. A conversão de zona em pontos (APROVA 85, ALERTA 70, REPROVA 55) é **minha**. Com essas duas dimensões em 55, 70 e 85 a nota fica, na base E2, em 85,1, 88,1 e 91,1 (todas PASSA) e, na conservadora, em 70,2, 73,2 e 76,2 (todas PASSA COM RESSALVAS). A faixa não muda; a conservadora, porém, fica a **0,2 ponto** do piso de 70 no pior caso.
3. **Margem curta.** A conservadora está 3,2 pontos acima do piso de 70; qualquer perda de evidência do Google (ou um achado crítico de integridade, que a régua zera) pode derrubá-la para NÃO PASSA. A E2 está 3,1 acima do piso de 85. Correção funcional na E2 (95,1%, 39 de 41) está a um critério do limiar de 95%.
4. **O simulador do Google é meu.** A base E2 inteira depende de ele refletir o Google real. A conservadora existe justamente para não depender disso onde o caminho mudou.
5. **O que mais sobe a conservadora:** executar `GOOGLE-REAL.md`, em especial os itens 5 (escopos e `appProperties`), 10 (recibo) e 11 (concorrência real); se nada falhar, a conservadora se aproxima da E2.

### Matriz de evidência por dimensão (as sete do item 43 do roteiro)

| Dimensão | E1 | E2 | E3 | E4 | N/M |
|---|---|---|---|---|---|
| Correção funcional | gate num clone limpo; CI do GitHub; **validação real de 30/09 no código anterior** (seção H) | 577 testes, fluxo completo agenda → recibo → relatório, regressão de cada achado | inventário de código, sem esqueleto em produção | manuais corrigidos | Google real no código atual (seção H) |
| Testabilidade | — | cobertura 100% / 98,7% / 100%; 60 mutações detectadas; matriz de integridade | `scripts/cobertura.js --exigir` falha se módulo crítico some da medição | `COBERTURA.md`, `MUTACOES.md` | "statements"; mutação exaustiva |
| Arquitetura | — | lógica pura separada das chamadas ao Google, testada isoladamente | `COMPLEXIDADE.md` (mistura de responsabilidades medida), `INVENTARIO-CODIGO.md` | `DECISOES.md` | nenhuma refatoração feita só por estética |
| Integridade | — | seção D; invariantes com cenários gerados; falha injetada em cada passo | trava antes de ler, identidade conferida antes de gravar | `MATRIZ-INTEGRIDADE.md` | Google real: `appProperties`, `LockService`, atomicidade do Planilhas |
| Segurança | — | seção E: segredos, dados pessoais, escopos, fórmula, logs | lista de escopos e serviços | `SEGURANCA-LOCAL.md`, `SERVICOS-GOOGLE.md` | isolamento entre contas, OAuth concedido, Stackdriver, Excel |
| Eficiência | — | operações contadas, não cronometradas; n² corrigido (A-18) | `COMPLEXIDADE.md` | `DESEMPENHO.md`, `RETENCAO-REGISTRO.md` | tempo e cota reais no Google (itens 19 e 20) |
| Disciplina | gate no clone limpo; CI do GitHub | gate com piso de testes; teste de sintaxe do workflow (A-19); todo SHA citado existe | Node fixado, sem dependências, só ações oficiais | `REPRODUCAO.md`, `ACHADOS.md` com histórico | proteção da `main`; fixar ações por SHA; outros Node e sistemas |

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
| SHA do código congelado | A_PREENCHER |
| Conferência: `git diff <SHA> HEAD` em código, scripts, testes, CI e Node | A_PREENCHER |
| CI no commit congelado | A_PREENCHER |
| CI no commit de fechamento | roda como o de qualquer outro push do PR; o resultado aparece na aba Checks (não é copiado aqui para este documento não precisar de outro commit para registrá-lo) |
