# Segurança local (Gate de Continuidade, etapa D)

Comando: `node scripts/seguranca.js [--historico]` (também roda dentro de `node scripts/gate.js`). Evidência: **E2/E3** locais. Tudo o que
depende do Google real está marcado **N/M** e entra no roteiro de `docs/gate/GOOGLE-REAL.md`.

## 1. Os três grupos de verificação (separados)

| Grupo | O que procura | Resultado em 01/10/2026 | Evidência |
|---|---|---|---|
| PII conhecida | e-mail com domínio que não é fictício nem reservado; número de 11 dígitos ou CPF com pontos que não é exemplo conhecido | PASS (HEAD, 106 arquivos) | E2 (varredura) |
| Segredos | chave privada, chaves AWS/Google/GitHub/Slack, segredo de cliente OAuth, token de acesso, JWT, senha ou segredo atribuído em texto, URL com usuário e senha, ID de arquivo do Google com tamanho de ID real | PASS | E2; controles positivos em `tests/seguranca-local.test.js` provam que o detector acha cada tipo |
| Configuração | escopos, serviços avançados, web app, biblioteca, runtime, fuso, `exceptionLogging`, serviços do Google usados no código | PASS | E2/E3 |

O detector de segredos não depende da lista de CPFs fictícios. Ele nunca imprime o valor achado (só tipo, arquivo e linha).

**Histórico do Git:** `node scripts/seguranca.js --historico` varre as linhas adicionadas em todos os commits dos refs locais. Em 01/10/2026
foram varridas a `main`, a branch desta rodada e as 16 branches remotas de `ccaporasso/NutriMolda` (todas buscadas): PASS. Limites: não varre
metadados de autor; em clone raso o resultado é **N/M**; branches apagadas, forks e objetos soltos fora dos refs são **N/M**.

## 2. Permissão OAuth versus isolamento entre contas (duas coisas diferentes)

- **Permissão OAuth do aplicativo (E3/E4, boa evidência estática):** seis escopos em produção, cada um justificado em `DECISOES.md`; produção recusa
  `drive` amplo, `calendar` de escrita e qualquer serviço não previsto (`tests/producao.test.js`, `tests/revisao.test.js`, `tests/seguranca-local.test.js`).
  Escopo, serviço avançado, serviço do Google, web app ou biblioteca novos fazem `scripts/seguranca.js` falhar até haver justificativa em
  `docs/gate/SERVICOS-GOOGLE.md`, decisão em `DECISOES.md` e teste. **Não prova** o que o Google realmente concede: isso é E1 (item 5 de `GOOGLE-REAL.md`).
- **Isolamento entre usuários/contas (N/M):** nenhum teste local prova isolamento. Roteiro com Conta A e Conta B em `GOOGLE-REAL.md`. O kit roda dentro
  da planilha de uma única conta; o modelo de ameaça (D35) exige ainda autorização por paciente e consultório quando a ponte oficial existir.

## 3. Injeção de fórmula

Um único ponto central (`neutralizarFormula`, `src/Formatos.js`) protege Registro, relatório (aba e CSV), Respostas e a escrita genérica de
`LeitorAbas.js`. Testado com `=`, `+`, `-`, `@`, tabulação, retorno de carro, quebra de linha, espaço invisível, NBSP, BOM, aspas, ponto e vírgula,
`＝` de largura total, acentos e emoji. Ver A-11 em `ACHADOS.md`. N/M: o efeito exato no Excel e no Google Planilhas ao abrir o CSV.

## 4. Registro de exceções (`exceptionLogging`)

**O que o `STACKDRIVER` faz:** envia ao Cloud Logging as exceções que saem de uma função de entrada do script sem serem capturadas, inclusive a mensagem
e a pilha. Se a mensagem trouxer nome, CPF ou condição de saúde, o dado iria para um canal que o kit não controla.

**Experimento (E2, `tests/seguranca-local.test.js`):** em 11 pontos do Google simulado (planilha, leitura de aba, Agenda, Drive lista/cria/copia, Docs,
propriedades, gatilhos, trava, e-mail) o serviço lança `Error("NOME_FICTICIO CPF_FICTICIO CONDICAO_FICTICIA")`. Cada função de menu (20) e o gatilho
automático são executados com a falha ligada. Resultado: **nenhuma exceção escapou** das funções de menu nem do gatilho (`executarNoMenu_`,
`sincronizarAgendaAutomatica` capturam tudo), e nenhum texto fictício chegou a Registro, e-mail de alerta, nome de arquivo ou `Logger`.

**O que ainda pode escapar, por desenho:** (a) funções internas (`gerarRecibo`, `sincronizarAgenda`, `gerarAReceber`...) chamadas direto pelo editor do
Apps Script, aberto só pela dona do projeto; (b) `onOpen`, que não toca em dado de paciente; (c) o submenu de teste (`comRegistroDeFalha_` relança de
propósito), que não existe no pacote de produção.

**Recomendação (não aplicada):** manter `STACKDRIVER` por enquanto. Os itens de menu e o gatilho já não deixam nada escapar; trocar para `NONE`
tiraria o diagnóstico de falha inesperada fora do kit (por exemplo, erro em `onOpen`) sem reduzir risco medido. Se a decisão do Caio for priorizar
"nenhum dado em canal não previsto" sobre diagnóstico, trocar para `NONE` é uma linha em `appsscript.json`; o impacto no suporte (página de
Execuções do Apps Script) é **N/M** e precisa ser visto no Google. Decisão pendente do Caio (A-13).

## 4b. Texto de erro na tela

Ver A-12: o diálogo mostra a mensagem crua de erro inesperado. Não é canal de log. Decisão pendente.

## 5. O que foi testado e o que continua N/M

| Item | Estado |
|---|---|
| Segredos, PII, configuração (HEAD) | Testado (E2) |
| Histórico do Git | Testado nos refs buscados; resto N/M |
| Escopos e serviços novos barrados | Testado (E2) |
| Fórmula (kit, Registro, relatório, CSV) | Testado (E2) |
| Exceções e Stackdriver (no simulador) | Testado (E2) |
| Escopos realmente concedidos pelo Google; `drive.file` e `appProperties` | N/M |
| Isolamento entre contas A e B | N/M (roteiro em GOOGLE-REAL.md) |
| Abrir o CSV no Excel/Sheets com nome "=..." | N/M |
| Efeito de `NONE` no diagnóstico | N/M |
