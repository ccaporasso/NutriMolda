# Matriz de integridade das operações críticas

Escrita em 01/10/2026 (Gate de Continuidade, etapa C). Legenda de evidência: **E2** = teste automatizado contra o Google simulado
(não prova o comportamento real do Google); **E3** = leitura do código; **N/M** = não medido. Nenhuma linha desta matriz tem E1
(execução observada no Google) para as correções desta rodada: ver `docs/gate/GOOGLE-REAL.md`.

Ordem de prioridade: agenda, pagamentos, pacotes, recibos, relatórios, configuração.

## 1. Inventário de idempotência (todas as operações da lista do roteiro)

| Operação | Deve ser idempotente? | Lock? | Retry seguro? | Falha parcial testada? |
|---|---|---|---|---|
| sincronizarAgenda | Sim (mesmo id_evento = mesma linha) | Sim, `LockService` antes de ler | Sim: o plano é recalculado do zero e casa por `id_evento` | Sim: 2ª página falha (nada gravado), `Calendar.get` falha, linhas movidas, paralelo (`agenda-adversa`, `operacoes-idempotentes`) |
| gerarAReceber | Sim (uma cobrança por `id_evento`) | Sim | Sim: consulta que já tem pagamento é pulada | Paralelo e repetido testados; falha no meio de `setValues` é atômica no Planilhas (N/M no Google real) |
| marcar pagamento (pix, cartão, dinheiro) | Sim (a 2ª vez é recusada) | Sim (`aplicarNasLinhas_` → `comTrava_`) | Sim: só parte de `a_receber` | Estado final testado (`invariantes-financeiros`); linha movida testada |
| marcar cortesia | Sim | Sim | Sim: só parte de `a_receber` | Idem |
| consumir pacote | Sim (por pagamento; `usadas` reconcilia) | Sim, e o saldo é lido depois da trava (R11b) | Sim: o pagamento é gravado primeiro; `usadas` é reconciliado pelos pagamentos | Sim: falha só em `usadas` (R11), excesso acima do total, 800 cenários gerados |
| gerar Pix | Sim (só leitura; o texto depende de id e valor) | Não precisa (não escreve) | Sim | N/A (não escreve) |
| gerar recibo | Sim (um PDF ativo por pagamento) | Sim, antes de ler o pagamento | Sim: reconcilia por identidade e conteúdo antes de criar | Sim: falha em cada um dos 9 passos + resposta perdida do Drive (`recibo-idempotencia`) |
| gerar relatório | Sim (mesma aba, mesmo CSV por mês) | Sim (nesta rodada) | Sim: refaz a aba e substitui o CSV pelo nome | Sim: falha na aba, no CSV, resposta perdida (`relatorio-integridade`) |
| criar modelo/pasta de recibos | Sim (nunca troca id preenchido) | Sim (nesta rodada), relendo Configurações | Sim: reaproveita o arquivo já criado (propriedade `kit_papel`) | Sim: falha ao gravar o id, ao criar, duplicado (`modelo-pasta-idempotencia`) |
| instalar/atualizar planilha | Sim | Sim (nesta rodada) | Sim: só cria o que falta | Paralelo e repetido (`operacoes-idempotentes`, `instalador`) |
| ativar sincronização automática | Sim (um gatilho só) | Sim (nesta rodada) | Sim: confere os gatilhos existentes | Paralelo e repetido (`operacoes-idempotentes`) |
| definir preços (menu) | Sim (regrava o mesmo valor) | Sim (nesta rodada) | Sim | Paralelo testado; falha entre as duas gravações deixa o primeiro preço mudado e o segundo como estava, vai ao Registro e ao e-mail sem o texto do erro, e repetir o menu termina o serviço (`precos-falha-parcial`) |

## 2. Fluxos, um por um

Convenção: "ponto de commit" é o instante em que o efeito passa a valer para quem consulta a planilha ou o Drive.

### 2.1 Agenda (`SincronizarAgenda.js`, `Agenda.js`)

| Campo | Conteúdo |
|---|---|
| Entrada | Menu "Sincronizar agenda" ou gatilho de hora em hora |
| Pré-condições | Configurações válidas; abas e cabeçalhos conferidos (R07); `calendario_id` legível |
| Leituras | Configurações, Consultas, Pacientes, `Calendar.Events.list` (paginado), `Calendar.Events.get` (até 40 ausentes por execução) |
| Escritas | Consultas: atualização por número de linha e inserção ao final; propriedade `calendario_da_ultima_sincronizacao` |
| Serviços externos | Google Agenda (leitura apenas: escopo `calendar.events.readonly` em produção) |
| Lock | `LockService.getScriptLock`, 30 s, antes de qualquer leitura |
| Identidade | `id_evento` (linha) e `agenda_origem` (marca do calendário). Antes de gravar a linha, o `id_evento` da célula é conferido (B1) |
| Ponto de commit | Cada `setValues` de linha; a inserção é um `setValues` só |
| Falhas possíveis | Quota ou erro da API (lista ou `get`); linha movida durante a espera; resposta com id repetido; instante sem fuso |
| Retry | Seguro: o plano é recalculado a partir da planilha e da agenda atuais |
| Reconciliação | Ausente da leitura não cancela: é conferido com `Calendar.get`; sem resposta, fica marcada e avisa. Id repetido conta uma vez; confirmado + cancelado com o mesmo id não cancela |
| Teste | `agenda.test.js`, `agenda-adversa.test.js`, `falhas.test.js`, `regressoes-revisao.test.js` (R04), `operacoes-idempotentes.test.js` |

### 2.2 Pagamentos (`GerarAReceber.js`, `Pagamentos.js`, `Menu.js`, `Acoes.js`)

| Campo | Conteúdo |
|---|---|
| Entrada | "Gerar valores a receber"; "Marcar como pago / cortesia / pacote" na linha selecionada |
| Pré-condições | Preço configurado e maior que zero (D17); `status = a_receber` para pagar, cortesia ou pacote |
| Leituras | Consultas, Pagamentos, Configurações (na seleção: a linha escolhida, relida dentro da trava) |
| Escritas | Linha inteira de Pagamentos (`gravarLinha`) ou linhas novas ao final |
| Serviços externos | Nenhum |
| Lock | Sim, antes de ler a seleção (`comTrava_`) |
| Identidade | `id` (PG000001...) e `id_evento`; a primeira coluna é conferida antes de regravar a linha |
| Ponto de commit | O `setValues` da linha |
| Falhas possíveis | Linha ordenada, apagada ou inserida durante o trabalho; preço ausente; valor inválido |
| Retry | Seguro: pagamento que já saiu de `a_receber` é recusado; cobrança é uma por `id_evento` |
| Reconciliação | Não precisa. IDs novos partem do maior id existente. Residual: apagar a última linha de Pagamentos libera o seu número (ver ACHADOS, A-07) |
| Teste | `pagamentos.test.js`, `invariantes-financeiros.test.js`, `operacoes-idempotentes.test.js`, `falhas.test.js`, `agenda-adversa.test.js` (identidade de linha) |

### 2.3 Pacotes (`Menu.js` → `marcarConsultaDePacote`, `Acoes.js`)

| Campo | Conteúdo |
|---|---|
| Entrada | "Marcar como consulta de pacote" |
| Pré-condições | Pacote vigente (de `inicio` mais recente), com data real, início não futuro, números inteiros e `usadas < total_consultas`; sem dois pacotes com o mesmo início |
| Leituras | Pacotes e Pagamentos, **depois** da trava |
| Escritas | 1) Pagamento vira `pago`/`pacote`, valor 0, `pacote_inicio`. 2) `usadas` sobe |
| Serviços externos | Nenhum |
| Lock | Sim |
| Identidade | Pacote = (`codigo_paciente`, `inicio`); o pagamento guarda o `pacote_inicio` gasto |
| Ponto de commit | A gravação do pagamento (1) é o commit; (2) é derivada e reconciliável |
| Falhas possíveis | Falha entre (1) e (2); excesso de consultas pagas acima do total; pacote sem `pacote_inicio` (legado) |
| Retry | Seguro: antes de cada ação, `reconciliarPacotes` leva `usadas` até o número de pagamentos de pacote já feitos |
| Reconciliação | Nunca diminui; nunca passa de `total_consultas` (nesta rodada); excesso gera aviso na tela e no Registro; legado sem início e pacotes ambíguos não são tocados |
| Teste | `regressoes-revisao.test.js` (R11, R11b, R11c, R11d, R11e), `invariantes-financeiros.test.js` (propriedade 0 ≤ usadas ≤ total) |

### 2.4 Recibos (`GeradorRecibo.js`, `Recibo.js`, `DriveAvancado.js`)

| Campo | Conteúdo |
|---|---|
| Entrada | "Gerar recibo em PDF" |
| Pré-condições | `status = pago`, forma Pix/cartão/dinheiro, valor > 0, pagador, data, CPF válido ou vazio; modelo e pasta configurados |
| Leituras | Configurações, Pagamentos, Pacientes, Consultas (dentro da trava); Drive: lista a pasta por identidade |
| Escritas | Cópia de trabalho no Drive; PDF no Drive (com propriedades de identidade); célula `link_recibo`; cópia vai para a lixeira |
| Serviços externos | Drive v3 (`drive.file`), Docs |
| Lock | Sim, antes de ler o pagamento |
| Identidade | PDF: propriedades `kit_recibo_pagamento` + `kit_recibo_paciente` + `kit_recibo_conteudo` (valor, data e forma; sem nome nem CPF; o nome do arquivo é só reforço); linha: `id` + `codigo_paciente` |
| Ponto de commit | Criação do PDF no Drive. O link na planilha é o registro desse commit e pode faltar |
| Falhas possíveis | Falha em copiar, abrir, trocar campo, salvar, exportar, criar PDF (inclusive com resposta perdida), gravar link, descartar o rascunho |
| Retry | Seguro (R2/R4): antes de copiar o modelo, procura o PDF do pagamento; exatamente 1 que ainda diz o mesmo que o pagamento → religa o link; 1 que diverge (valor, data ou forma mudou, ou sem impressão) → para sem criar nem ligar (A-20); 2 ou mais → para sem criar; 0 → cria |
| Reconciliação | Por identidade. PDF de outro pagamento/paciente nunca é religado (R5); PDF antigo sem propriedades (ou sem a impressão do conteúdo) nunca é religado às cegas: o kit para e pede conferência (A-20); arquivo na lixeira não conta |
| Teste | `recibo-idempotencia.test.js` (26 casos), `recibo.test.js`, `recibo-drive-file.test.js`, `falhas.test.js` |

### 2.5 Relatórios (`GerarRelatorio.js`, `Relatorio.js`)

| Campo | Conteúdo |
|---|---|
| Entrada | "Relatório do mês" |
| Pré-condições | Mês válido; cabeçalho de Pagamentos conferido |
| Leituras | Configurações e Pagamentos, dentro da trava |
| Escritas | Aba "Relatório AAAA-MM" (limpa e refeita); CSV na pasta de recibos (cria ou substitui pelo nome) |
| Serviços externos | Drive v3 |
| Lock | Sim (nesta rodada) |
| Identidade | Mês (nome da aba e do CSV) |
| Ponto de commit | `setValues` da aba; depois a criação/substituição do CSV |
| Falhas possíveis | Falha depois de limpar a aba; falha no CSV; resposta perdida do Drive |
| Retry | Seguro: refaz a aba e substitui o CSV de mesmo nome |
| Reconciliação | O CSV é achado pelo nome na pasta. Residual: dois CSVs de mesmo nome já existentes (ver ACHADOS, A-08) |
| Teste | `relatorio-integridade.test.js`, `relatorio.test.js`, `invariantes-financeiros.test.js` (400 conjuntos) |

### 2.6 Configuração (`GeradorRecibo.js` modelo/pasta, `Precos.js`, `Instalador.js`, gatilho)

| Campo | Conteúdo |
|---|---|
| Entrada | "Criar modelo e pasta de recibos"; "Definir preços"; "Instalar/atualizar planilha"; "Ativar sincronização automática" |
| Pré-condições | Cabeçalho de Configurações conferido; id repetido ou numérico em Configurações recusa em vez de criar outro |
| Leituras | Configurações (relidas depois da trava); Drive: lista modelos e pastas pelo papel (`kit_papel`) |
| Escritas | Docs/pasta no Drive; células de Configurações; abas; gatilho |
| Serviços externos | Drive v3, Docs, `ScriptApp` |
| Lock | Sim (todas, nesta rodada) |
| Identidade | Modelo/pasta: propriedade `kit_papel`; aba: nome; gatilho: nome da função |
| Ponto de commit | Gravação do id em Configurações |
| Falhas possíveis | Arquivo criado e id não gravado; dois arquivos órfãos; execução simultânea |
| Retry | Seguro: reaproveita o arquivo órfão (1) ou para (2 ou mais) |
| Reconciliação | Por papel, fora da lixeira |
| Teste | `modelo-pasta-idempotencia.test.js`, `operacoes-idempotentes.test.js`, `precos.test.js`, `instalador.test.js` |
