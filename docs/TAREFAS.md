# Tarefas

Legenda de dono: **Code** = o Claude Code faz · **Você** = o Caio faz à mão · **Ambos** = o Code prepara, você executa ou confere.

Situação: a fazer · em andamento · feita.

## Fase 2a — Base e financeiro (pode começar agora, sem cliente)

| # | Tarefa | Dono | Depende de | Critérios de aceite | Situação |
|---|---|---|---|---|---|
| T00 | Estrutura do repositório: `src/`, `tests/`, `appsscript.json` com fuso `America/Sao_Paulo` e escopos mínimos, `.clasp.json` apontando para o projeto de teste, `.gitignore` | Ambos | Primeiros passos | `node --test` roda (mesmo sem testes); `clasp` envia para o projeto de teste | em andamento: estrutura pronta e `node --test` passando; falta você ligar o `clasp` ao projeto de teste e enviar (ver `PRIMEIROS-PASSOS.md`, passo 8) |
| T01 | Instalador da planilha: cria as abas e cabeçalhos da especificação, validações (listas de status e formas) e proteção dos cabeçalhos | Code | T00 | Rodar duas vezes não duplica nada; abas iguais à especificação | feita no código (testes passando); falta você testar na planilha de teste |
| T02 | Leitura e validação das Configurações, com mensagens claras quando faltar algo | Code | T01 | Testes cobrem chave ausente, valor inválido e nome Pix longo demais | feita no código (testes passando); falta você testar na planilha de teste |
| T03 | Registro e alerta de falha: função única de log e e-mail de erro, sem dados de paciente | Code | T01 | Um erro forçado aparece no Registro e gera e-mail na conta de teste | feita no código (testes passando); falta você testar na planilha de teste |
| T04 | Gerador de dados de teste: pacientes e eventos inventados na agenda de TESTE | Code | T01 | Cria e apaga os dados de teste com um comando; nunca roda fora da conta de teste | feita no código (testes passando); falta você testar na planilha e agenda de teste |
| T05 | Sincronização agenda → Consultas, idempotente, com lista "a identificar" | Code | T02, T04 | Duas execuções seguidas não duplicam; cancelamento na agenda vira `cancelada` | feita no código (testes passando); falta validar no Google (ver `docs/VALIDACAO-NO-GOOGLE.md`) |
| T06 | Pix copia e cola: função pura com testes do CRC e dos campos | Code | T00 | Testes passam; você escaneia o código num app de banco e o valor e o nome aparecem certos | feita no código (testes passando); falta você escanear num app de banco |
| T07 | A receber: cria pagamentos a partir das consultas, pela tabela de valores | Code | T05 | Consulta sem pagamento gera um `a_receber`; não duplica; o valor vem de `precoParaCobranca` (nunca gera R$ 0,00; cortesia só por escolha explícita, D17) | feita no código (testes passando); falta validar no Google (ver `docs/VALIDACAO-NO-GOOGLE.md`) |
| T08 | Menu na planilha: sincronizar, marcar pago/faltou/cortesia/pacote, gerar Pix, gerar recibo, relatório do mês | Code | T07 | Cada item do menu funciona na conta de teste | a fazer |
| T09 | Recibo em PDF a partir do modelo no Docs | Ambos | T07 | PDF com todos os campos obrigatórios salvo na pasta configurada | feita no código (testes passando); falta validar no Google, principalmente o escopo `drive.file` (ver `docs/VALIDACAO-NO-GOOGLE.md` e D20) |
| T10 | Relatório mensal do carnê-leão: aba e CSV por pagador | Code | T07 | Totais batem com a soma manual dos dados de teste | feita no código (testes passando, totais conferidos à mão nos testes); falta validar no Google (ver `docs/VALIDACAO-NO-GOOGLE.md`) |
| T11 | Manual de operação da nutricionista e seu manual de suporte | Code | T08 | Passo a passo para instalar, usar o menu e resolver as 5 falhas mais prováveis | a fazer |

## Fase 1 — Agenda sem código (feita à mão, com a cliente)

| # | Tarefa | Dono |
|---|---|---|
| F1 | Página de agendamento com as regras dela (janelas, duração, intervalo, antecedência, horizonte, limite diário) | Você |
| F2 | Mensagem de ausência, respostas rápidas e etiquetas no WhatsApp Business dela | Você |
| F3 | Roteiro de instalação em uma página | Code |

## Fase 2b — Acompanhamento e fila de ajustes (esqueleto agora, detalhes com a cliente)

| # | Tarefa | Dono |
|---|---|---|
| T20 | Formulário da pergunta semanal com código pré-preenchido e aba Respostas | Code |
| T21 | Painel de presença: "ainda não" duas vezes, silêncio, nota escrita, retorno sem data | Code |
| T22 | Fila de ajustes com aprovação em um ou dois toques | Code |
| T23 | Biblioteca de frases e geração de links wa.me com texto pronto | Code |
| T24 | Os três modos de acompanhamento e o limite de mensagens por modo | Code |

**Espera pela cliente:** frases, tabela de substituições, regras de modo e textos finais.

## Fase 2c — Relatórios

| # | Tarefa | Dono |
|---|---|---|
| T30 | Painel do mês: faturamento, faltas, retornos, respostas | Code |
| T31 | Resumo semanal por e-mail | Code |
| T32 | Comparação antes e depois (faltas e retornos) | Code |

## Fase 3 — WhatsApp oficial (depois do teste técnico)

| # | Tarefa | Dono |
|---|---|---|
| T40 | Teste com o número de teste da Meta em modo de desenvolvimento: mensagens, modelos, botões | Ambos |
| T41 | Escolha do provedor oficial com coexistência, botões e pausa quando a pessoa responde | Você |
| T42 | Menu 24 horas integrado à planilha | Code |
