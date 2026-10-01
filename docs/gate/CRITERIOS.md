# Critérios usados para aplicar a régua do Gate v1.0

Entradas da pontuação (`node scripts/pontuacao.js`, que lê as tabelas abaixo e calcula; `tests/pontuacao.test.js` confere o cálculo e que cada teste citado existe). **Quem escolheu estes critérios fui eu, o autor do código**: é uma autoavaliação, não a auditoria independente. O revisor pode trocar as listas e refazer a conta com o mesmo script.

Como foram escolhidos, para a lista não ser só do que passa: os sete fluxos da especificação (`docs/ESPECIFICACAO.md`), os casos que a validação real de 30/09 listou como "sem evidência" (`docs/RESULTADOS-GOOGLE-2026-09-30.md`, "O que falta", item 3) e os achados que continuam abertos (A-07 e A-08 entram **como critérios não atendidos**).

## Duas bases de evidência (a régua não diz qual usar; as duas são mostradas)

- **E2 (suíte)**: o critério vale se o comportamento existe e tem teste automatizado. É o que a régua descreve em "suíte, regressões, regras críticas, casos-limite".
- **Conservadora**: o critério só vale se, além do teste, ou não depende do comportamento do Google, ou esse comportamento já foi **observado de verdade** (validação de 30/09 no commit `3ad3b96`, `docs/RESULTADOS-GOOGLE-2026-09-30.md`) **e o caminho do Google que decide o resultado não mudou desde então**. Tudo o que a rodada do Gate mudou ou criou nesse caminho (recibo reconciliado, escrita da sincronização por faixa, modelo e pasta reconciliados) volta a precisar de observação real (`docs/gate/GOOGLE-REAL.md`).

## 1. Correção funcional (peso 25%; APROVA ≥ 95%, ALERTA 85 a 94%, REPROVA < 85%)

"Depende do Google" = o resultado depende de como o Google se comporta (planilha, agenda, Drive, Docs, e-mail, gatilhos), não só da lógica pura. "Observado antes (E1)" = observado de verdade em 30/09. "Caminho mudou" = o caminho do Google que decide o resultado mudou ou é novo na rodada do Gate. "Atendido" = o comportamento exigido existe e tem teste (E2).

| Id | Critério | Teste | Depende do Google | Observado antes (E1) | Caminho mudou | Atendido |
|---|---|---|---|---|---|---|
| F01 | Sincronizar: uma linha por evento, sem duplicar ao repetir | `tests/agenda.test.js`, `tests/operacoes-idempotentes.test.js` | sim | sim | sim | sim |
| F02 | Remarcação atualiza a consulta sem duplicar | `tests/agenda.test.js` | sim | sim | sim | sim |
| F03 | Só cancela com confirmação do Calendar; ausência na leitura não cancela | `tests/falhas.test.js`, `tests/agenda-adversa.test.js` | sim | sim | sim | sim |
| F04 | Paciente por e-mail ou telefone; ambíguo vai para "a identificar" | `tests/agenda.test.js` | não | sim | não | sim |
| F05 | Primeira consulta x retorno | `tests/agenda.test.js` | não | não | não | sim |
| F06 | Troca de agenda preserva as consultas de outras origens | `tests/agenda-adversa.test.js`, `tests/regressoes-revisao.test.js` | sim | sim | sim | sim |
| F07 | Consulta cancelada à mão não é reaberta pela sincronização | `tests/regressoes-opus.test.js` | sim | sim | sim | sim |
| F08 | Linha que mudou de lugar durante a sincronização não é sobrescrita | `tests/agenda-adversa.test.js` | sim | não | sim | sim |
| F09 | Uma cobrança por consulta marcada ou realizada, com o preço da tabela | `tests/pagamentos.test.js` | sim | sim | não | sim |
| F10 | Repetir "a receber" não duplica cobrança | `tests/operacoes-idempotentes.test.js` | sim | sim | não | sim |
| F11 | Não cobra faltou, cancelada, sem paciente nem preço ausente | `tests/pagamentos.test.js` | não | sim | não | sim |
| F12 | Preço muito baixo pede confirmação antes de cobrar | `tests/precos.test.js` | sim | não | não | sim |
| F13 | Marcar pago (Pix, cartão, dinheiro) com data, uma vez só | `tests/menu.test.js` | sim | sim | não | sim |
| F14 | Cortesia zera o valor e fica fora do relatório | `tests/menu.test.js` | sim | não | não | sim |
| F15 | Consulta de pacote consome uma consulta, reconcilia e nunca passa do total | `tests/invariantes-financeiros.test.js` | sim | sim | não | sim |
| F16 | Marcar consulta realizada ou faltou | `tests/menu.test.js` | sim | não | não | sim |
| F17 | Ação em estado inválido é recusada (não remarca o que já está pago) | `tests/menu.test.js` | não | não | não | sim |
| F18 | Ação com a aba errada aberta é recusada sem gravar | `tests/menu.test.js` | sim | não | não | sim |
| F19 | Pix copia e cola válido (campos, CRC, nome e cidade normalizados) | `tests/pix.test.js` | não | sim | não | sim |
| F20 | Pix recusa o que o padrão não comporta (valor, nome, cidade, chave) | `tests/limites-pix.test.js` | não | não | não | sim |
| F21 | Recibo em PDF com os campos obrigatórios na pasta | `tests/recibo.test.js`, `tests/recibo-drive-file.test.js` | sim | sim | sim | sim |
| F22 | Recibo recusa dado incompleto sem criar PDF nem link | `tests/recibo.test.js` | sim | sim | sim | sim |
| F23 | Repetir o recibo não cria outro PDF e preserva o link | `tests/recibo-idempotencia.test.js` | sim | sim | sim | sim |
| F24 | Falha parcial e nova tentativa: um PDF só, sem ligar o recibo errado (A-01, A-20) | `tests/recibo-idempotencia.test.js` | sim | não | sim | sim |
| F25 | Modelo e pasta de recibos criados uma vez | `tests/modelo-pasta-idempotencia.test.js` | sim | sim | sim | sim |
| F26 | Conteúdo do recibo certo (R$ com vírgula, data, pagador, CPF opcional) | `tests/recibo.test.js` | não | sim | não | sim |
| F27 | Relatório: totais por pagador batem com os pagamentos recebidos | `tests/relatorio.test.js` | não | sim | não | sim |
| F28 | Relatório: aba e CSV refeitos sem duplicar | `tests/relatorio-integridade.test.js` | sim | sim | não | sim |
| F29 | Texto que vira fórmula é neutralizado (aba, CSV, Registro) | `tests/seguranca-local.test.js` | não | não | não | sim |
| F30 | Erro inesperado vai ao Registro e ao e-mail, sem dado de paciente | `tests/registro.test.js`, `tests/falhas.test.js` | sim | sim | não | sim |
| F31 | Problema de uso avisa na tela; e-mail no máximo uma vez por dia por causa | `tests/falhas.test.js` | sim | não | não | sim |
| F32 | Instalar ou atualizar a planilha é idempotente (abas, cabeçalhos, listas, fuso) | `tests/instalador.test.js` | sim | sim | não | sim |
| F33 | Configuração validada com mensagem clara, por domínio | `tests/configuracao-dominios.test.js` | não | sim | não | sim |
| F34 | Dinheiro em centavos inteiros; reais só na saída | `tests/formatos.test.js` | não | sim | não | sim |
| F35 | Datas e horas em São Paulo, independentes do fuso da máquina | `tests/agenda-adversa.test.js` | não | sim | não | sim |
| F36 | Um gatilho horário só | `tests/operacoes-idempotentes.test.js` | sim | sim | não | sim |
| F37 | Pacote de produção sem gerador de teste e só com os escopos aprovados | `tests/producao.test.js` | não | sim | não | sim |
| F38 | Mesmo nome com CPFs diferentes: cada recibo e cada linha do relatório com o seu | `tests/relatorio.test.js` | não | não | não | sim |
| F39 | A grade da planilha cresce antes de acabar (mais de 1.000 linhas) | `tests/ramos-criticos.test.js` | sim | sim | não | sim |
| F40 | Id de pagamento nunca é reaproveitado (A-07, aberto) | sem teste | sim | não | não | não |
| F41 | CSV do mês único na pasta mesmo com cópia feita à mão (A-08, aberto) | sem teste | sim | não | não | não |

## 2. Testabilidade / regressão (peso 20%; APROVA ≥ 90% dos fluxos críticos cobertos, ALERTA 75 a 89%, REPROVA < 75%)

Um fluxo conta como coberto quando tem teste do caso normal, do negativo (recusa ou limite), da falha parcial e da concorrência (`n/a` onde não existe: o que só lê não tem falha parcial). Independência da lógica: o código de `src/` roda de verdade na suíte (não é reescrito nos testes) e 60 mutações manuais mostram que a suíte falha quando ele muda (`docs/gate/MUTACOES.md`).

| Id | Fluxo crítico | Normal | Negativo | Falha parcial | Concorrência |
|---|---|---|---|---|---|
| T01 | Sincronizar agenda | `tests/agenda.test.js` | `tests/agenda-adversa.test.js` | `tests/falhas.test.js` | `tests/operacoes-idempotentes.test.js` |
| T02 | Gerar a receber | `tests/pagamentos.test.js` | `tests/pagamentos.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/operacoes-idempotentes.test.js` |
| T03 | Marcar pago e cortesia | `tests/menu.test.js` | `tests/menu.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/falhas-parciais-operacoes.test.js` |
| T04 | Consumir pacote | `tests/menu.test.js` | `tests/regressoes-revisao.test.js` | `tests/regressoes-revisao.test.js` | `tests/regressoes-revisao.test.js` |
| T05 | Gerar Pix | `tests/pix.test.js` | `tests/limites-pix.test.js` | n/a | n/a |
| T06 | Gerar recibo | `tests/recibo.test.js` | `tests/recibo.test.js` | `tests/recibo-idempotencia.test.js` | `tests/recibo-idempotencia.test.js` |
| T07 | Gerar relatório | `tests/relatorio.test.js` | `tests/relatorio.test.js` | `tests/relatorio-integridade.test.js` | `tests/relatorio-integridade.test.js` |
| T08 | Criar modelo e pasta de recibos | `tests/modelo-pasta-idempotencia.test.js` | `tests/modelo-pasta-idempotencia.test.js` | `tests/modelo-pasta-idempotencia.test.js` | `tests/modelo-pasta-idempotencia.test.js` |
| T09 | Instalar a planilha | `tests/instalador.test.js` | `tests/instalador.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/operacoes-idempotentes.test.js` |
| T10 | Ativar a sincronização automática | `tests/operacoes-idempotentes.test.js` | `tests/operacoes-idempotentes.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/operacoes-idempotentes.test.js` |
| T11 | Definir preços | `tests/precos.test.js` | `tests/precos.test.js` | `tests/precos-falha-parcial.test.js` | `tests/ramos-criticos.test.js` |
| T12 | Registro e alerta de falha | `tests/registro.test.js` | `tests/falhas.test.js` | `tests/falhas.test.js` | n/a |
| T13 | Configuração | `tests/configuracoes.test.js` | `tests/configuracao-dominios.test.js` | n/a | n/a |
| T14 | Pacote de produção | `tests/producao.test.js` | `tests/producao.test.js` | n/a | n/a |

## 3. Integridade e confiabilidade (peso 15%; APROVA sem crítico e ≥ 90% dos cenários críticos protegidos, ALERTA 75 a 89%, REPROVA crítico ou < 75%)

Cenários = operação x {repetição, retry depois de falha, falha parcial injetada, concorrência}. "Não observado" = cenários cuja proteção depende de um comportamento do Google que nenhuma execução real mostrou: **a trava (`LockService`) com duas execuções de verdade** (todas as operações com concorrência) e **a busca por propriedades do arquivo (`appProperties`) com `drive.file`** (recibo e modelo/pasta). Na base conservadora esses cenários contam como não protegidos até a execução real.

| Id | Operação | Repetição | Retry | Falha parcial | Concorrência | Não observado |
|---|---|---|---|---|---|---|
| I01 | Sincronizar agenda | `tests/operacoes-idempotentes.test.js` | `tests/falhas.test.js` | `tests/agenda-adversa.test.js` | `tests/operacoes-idempotentes.test.js` | concorrência |
| I02 | Gerar a receber | `tests/operacoes-idempotentes.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/operacoes-idempotentes.test.js` | concorrência |
| I03 | Marcar pago | `tests/invariantes-financeiros.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/falhas-parciais-operacoes.test.js` | concorrência |
| I04 | Cortesia | `tests/invariantes-financeiros.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/falhas-parciais-operacoes.test.js` | concorrência |
| I05 | Consumir pacote | `tests/invariantes-financeiros.test.js` | `tests/regressoes-revisao.test.js` | `tests/regressoes-revisao.test.js` | `tests/regressoes-revisao.test.js` | concorrência |
| I06 | Gerar recibo | `tests/recibo-idempotencia.test.js` | `tests/recibo-idempotencia.test.js` | `tests/recibo-idempotencia.test.js` | `tests/recibo-idempotencia.test.js` | retry, falha parcial, concorrência |
| I07 | Gerar relatório | `tests/relatorio-integridade.test.js` | `tests/relatorio-integridade.test.js` | `tests/relatorio-integridade.test.js` | `tests/relatorio-integridade.test.js` | concorrência |
| I08 | Criar modelo e pasta | `tests/modelo-pasta-idempotencia.test.js` | `tests/modelo-pasta-idempotencia.test.js` | `tests/modelo-pasta-idempotencia.test.js` | `tests/modelo-pasta-idempotencia.test.js` | retry, falha parcial, concorrência |
| I09 | Instalar a planilha | `tests/operacoes-idempotentes.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/operacoes-idempotentes.test.js` | concorrência |
| I10 | Ativar a sincronização | `tests/operacoes-idempotentes.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/falhas-parciais-operacoes.test.js` | `tests/operacoes-idempotentes.test.js` | concorrência |
| I11 | Definir preços | `tests/precos.test.js` | `tests/precos-falha-parcial.test.js` | `tests/precos-falha-parcial.test.js` | `tests/ramos-criticos.test.js` | concorrência |

Nenhum achado CRÍTICO de integridade conhecido (a régua zera a dimensão se houver um).

## 4. Arquitetura e manutenibilidade (peso 15%; APROVA ≥ 80/100, ALERTA 65 a 79, REPROVA < 65)

Nota por subcritério (autoavaliação com a evidência ao lado; `node scripts/complexidade.js` reproduz as medidas).

| Id | Subcritério | Máximo | Nota | Evidência |
|---|---|---|---|---|
| A01 | Separação de responsabilidades | 20 | 16 | Lógica pura em arquivos testáveis no Node, chamadas ao Google em outros. Das 228 funções de `src/` (média de 10,7 linhas), 8 misturam quatro ou mais responsabilidades; 6 são de produção e são orquestradores finos cujas regras já estão em funções puras (`docs/gate/COMPLEXIDADE.md`). |
| A02 | Acoplamento | 20 | 14 | O Apps Script carrega todos os arquivos num escopo global só, então o acoplamento por nome global é implícito; um teste barra nomes repetidos. Seis arquivos usam o idioma `typeof x !== 'undefined' ? x : require(...)` para rodar nos dois ambientes. A configuração passou a ser por domínio (A-14), o que reduziu o acoplamento entre funcionalidades. |
| A03 | Duplicação | 20 | 16 | A regra de fórmula tem um só lugar (A-11) e os índices de pacientes e pacotes também; sobra a repetição do idioma de carga dupla e leituras de aba parecidas. |
| A04 | Tamanho e complexidade | 20 | 15 | Seis funções acima de 50 linhas (a maior, 129, é só lógica pura e tem 100% de linhas e ramos); nenhuma função de produção com Google passa de 70 linhas. Crescimento medido por contagem de operações (A-18). |
| A05 | Clareza | 20 | 17 | Nomes e erros em português para a nutricionista; decisões numeradas (`docs/DECISOES.md`), matriz de integridade, manuais, registro de achados com histórico. Falta um mapa de módulos curto para quem chega novo. |

## 5. Segurança e privacidade (peso 15%) e 6. Eficiência técnica (peso 5%)

A régua descreve estas duas por zona, sem percentual. Zona -> pontos: o limite inferior da faixa correspondente da classificação final (APROVA 85, ALERTA 70, REPROVA 55), o mais conservador dentro da zona. **Esta conversão é minha**: a régua não a define; o relatório mostra também o resultado com estas duas dimensões em 55, 70 e 85.

| Dimensão | Zona (E2) | Zona (conservadora) | Justificativa |
|---|---|---|---|
| Segurança e privacidade | ALERTA | ALERTA | Sem achado crítico ou alto conhecido: nenhum segredo no HEAD nem no histórico, nenhum dado de paciente em Registro, e-mail, nome de arquivo ou `Logger`, escopos mínimos e justificados. Zona ALERTA e não APROVA porque há problemas médios controláveis: o escopo `documents` é amplo (o Apps Script não oferece um menor para abrir o documento; D20), o isolamento entre contas e o que o Google realmente concede não foram observados, e a mensagem crua de erro inesperado aparece na tela (A-12, baixo). |
| Eficiência técnica | ALERTA | ALERTA | Sem gargalo estrutural: os laços n² e as escritas por linha foram corrigidos e medidos (A-18). Dívida localizada: Registro sem política de retenção decidida (cresce uma linha por execução), uma escrita por faixa não vizinha, capacidade da base em planilha sem medição real no Google. |

## 7. Disciplina de engenharia (peso 5%; APROVA ≥ 80%, ALERTA 60 a 79%, REPROVA < 60%)

| Id | Item | Atendido |
|---|---|---|
| D01 | Versão do Node fixada (`.nvmrc`, `engines`) | sim |
| D02 | Nenhuma dependência de terceiros | sim |
| D03 | Um comando único que repete a verificação (`node scripts/gate.js`) | sim |
| D04 | CI configurado e observado verde (dois jobs, no commit congelado) | sim |
| D05 | Verificação reproduzida num clone limpo | sim |
| D06 | Pisos de cobertura por módulo crítico e de número de testes | sim |
| D07 | Documentação técnica (especificação, decisões, matriz, achados, manuais) | sim |
| D08 | CHANGELOG e TAREFAS com a evidência de cada mudança | sim |
| D09 | Commits revisáveis por etapa, com achados rastreáveis (SHA conferido por teste) | sim |
| D10 | Varredura de segredos, dados pessoais e escopos no CI | sim |
| D11 | Proteção da `main` aplicada | não |
| D12 | Ações do CI fixadas por SHA | não |
| D13 | Verificado em mais de uma versão do Node e em mais de um sistema | não |
| D14 | Versões numeradas e marcadas (tags) do kit | não |

## 8. Critérios eliminatórios (qualquer SIM = NÃO PASSA, qualquer que seja a nota)

| Id | Eliminatório | Resposta | Evidência |
|---|---|---|---|
| E01 | Possibilidade plausível de corrupção ou perda silenciosa de dados | NÃO | O caminho plausível que a minha própria correção do recibo abria (religar o recibo errado se o número do pagamento fosse reaproveitado) foi encontrado ao aplicar este critério e fechado (A-20). Sem outro caminho conhecido: sincronização que não confirma não cancela, linha que mudou de lugar não é gravada, pacote não passa do total, escrita sempre depois de conferir a identidade da linha. |
| E02 | Violação grave de isolamento ou autorização | NÃO | O kit roda dentro da planilha de uma única conta; não há caminho entre contas. **Isolamento real não foi observado** (`GOOGLE-REAL.md`, item 18). A autorização por paciente e consultório da ponte (D35) ainda não existe no código de produção. |
| E03 | Segredo ou credencial sensível exposto | NÃO | `scripts/seguranca.js` no HEAD e em todo o histórico, no CI. |
| E04 | Fluxo central cuja correção não possa ser demonstrada | NÃO | Pode ser demonstrada e o roteiro está pronto. **Condição:** se o revisor exigir demonstração real (E1) para dar o fluxo por demonstrado, o recibo reconciliado (itens 5 e 10 de `GOOGLE-REAL.md`) conta como ainda não demonstrado e esta resposta passa a SIM até a execução. |
| E05 | Testes passando sem testar a implementação correspondente | NÃO | O código de `src/` roda de verdade na suíte; 60 mutações manuais, todas detectadas. **Limite:** o simulador do Google foi escrito por mim; a fidelidade dele ao Google real é a parte não demonstrada. |
| E06 | Comportamento não idempotente onde deveria ser idempotente, com consequência relevante | NÃO | Matriz de integridade: as 11 operações que escrevem têm teste de repetição, retry, falha parcial e concorrência. Os abertos (A-07, A-08, A-17) não têm consequência sobre dado ou recibo. |
| E07 | Erro arquitetural que torne perigoso continuar adicionando funcionalidades | NÃO | Lógica pura separada, esqueletos fora da produção, configuração por domínio, gate com pisos. O que a ponte oficial exigirá (autenticação entre serviços e autorização por paciente, `CLAUDE.md` regra 2) é trabalho novo, não defeito da base atual. |
