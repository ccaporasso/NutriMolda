# Tarefas

Legenda de dono: **Code** = o Claude Code faz · **Você** = o Caio faz à mão · **Ambos** = o Code prepara, você executa ou confere.

Situação: a fazer · em andamento · feita. Código implementado, teste no Google e liberação para clientes são estados diferentes. Fonte dos resultados atuais: [RESULTADOS-GOOGLE-2026-09-30.md](RESULTADOS-GOOGLE-2026-09-30.md).

## Fase 2a — Base e financeiro (pode começar agora, sem cliente)

| # | Tarefa | Dono | Depende de | Critérios de aceite | Situação |
|---|---|---|---|---|---|
| T00 | Estrutura do repositório: `src/`, `tests/`, `appsscript.json` com fuso `America/Sao_Paulo` e escopos mínimos, `.clasp.json` apontando para o projeto de teste, `.gitignore` | Ambos | Primeiros passos | `node --test` roda (mesmo sem testes); `clasp` envia para o projeto de teste | estrutura e código instalados e conferidos manualmente na cópia descartável; clasp não configurado nem usado. Validação não dependeu de clasp |
| T01 | Instalador da planilha: cria as abas e cabeçalhos da especificação, validações (listas de status e formas) e proteção dos cabeçalhos | Code | T00 | Rodar duas vezes não duplica nada; abas iguais à especificação | validada no Google: instalação repetida, cabeçalhos, formatos e fuso nos cenários executados |
| T02 | Leitura e validação das Configurações, com mensagens claras quando faltar algo | Code | T01 | Testes cobrem chave ausente, valor inválido e nome Pix longo demais | validada no cenário real de nome Pix com 33 caracteres: recusa, correção para 18 e geração posterior; demais regras com testes locais |
| T03 | Registro e alerta de falha: função única de log e e-mail de erro, sem dados de paciente | Code | T01 | Um erro forçado aparece no Registro e gera e-mail na conta de teste | validada no Google: falha simulada no Registro e e-mail recebido e conferido às 16:39:35 |
| T04 | Gerador de dados de teste: pacientes e eventos inventados na agenda de TESTE | Code | T01 | Cria e apaga os dados de teste com um comando; nunca roda fora da conta de teste | geração, recusa antes de escrever, repetição e recriação de evento validadas; limpeza completa dos dados não executada no Google |
| T05 | Sincronização agenda → Consultas, idempotente, com lista "a identificar" | Code | T02, T04 | Duas execuções seguidas não duplicam; cancelamento na agenda vira `cancelada` | validada: repetição, cancelamento confirmado, remarcação fora da janela, troca de agenda e execução automática/interativa; limites no relatório |
| T06 | Pix copia e cola: função pura com testes do CRC e dos campos | Code | T00 | Testes passam; você escaneia o código num app de banco e o valor e o nome aparecem certos | validada: geração pelo menu e recebedor/R$ 150,00 conferidos no banco pelo usuário, sem concluir pagamento |
| T07 | A receber: cria pagamentos a partir das consultas, pela tabela de valores | Code | T05 | Consulta sem pagamento gera um `a_receber`; não duplica; o valor vem de `precoParaCobranca` (nunca gera R$ 0,00; cortesia só por escolha explícita, D17) | validada: duas cobranças fictícias com valores numéricos e repetição sem duplicação; casos complementares no relatório |
| T08 | Menu na planilha: sincronizar, marcar pago/faltou/cortesia/pacote, gerar Pix, gerar recibo, relatório do mês | Code | T07 | Cada item do menu funciona na conta de teste | validação parcial: menus, preços, pagamento Pix, pacotes, recibos e relatório passaram; cortesia, presença/falta e aba errada ainda sem evidência real |
| T09 | Recibo em PDF a partir do modelo no Docs | Ambos | T07 | PDF com todos os campos obrigatórios salvo na pasta configurada | validada com D32: três PDFs fictícios gerados e inspecionados, repetição sem duplicação, recusa de campo ausente, campos no cabeçalho e descarte |
| T10 | Relatório mensal do carnê-leão: aba e CSV por pagador | Code | T07 | Totais batem com a soma manual dos dados de teste | validada: relatório e CSV de dois recebimentos, total R$ 1.384,56, repetição no mesmo arquivo/aba; D21 e casos complementares pendentes |
| T11 | Manual de operação da nutricionista e seu manual de suporte | Code | T08 | Passo a passo para instalar, usar o menu e resolver as 5 falhas mais prováveis | manuais existentes; passos de operação utilizados nos testes descritos. Leitura integral e teste do manual pela nutricionista ainda pendentes |

## Lote de revisão e preparação do piloto (30/09/2026)

| # | Tarefa | Dono | Situação |
|---|---|---|---|
| R1 | Revisão do próprio código (T00 a T11) contra a especificação, correções claras e dúvidas para o Caio (`docs/REVISAO-T00-T11.md`) | Code | feita: 5 correções em documentos e dados de teste; 15 dúvidas aguardam o Caio |
| R2 | Testes de integração com Google simulado: agenda → consulta → cobrança → pagamento → recibo → relatório | Code | feita (`tests/integracao.test.js`, 8 testes); só prova a lógica: o Google de verdade continua no roteiro do piloto |
| R3 | Casos de falha: cancelamentos, execuções repetidas, configuração incompleta, falha no PDF, erro no envio de alerta | Code | feita (`tests/falhas.test.js`, 26 testes); o comportamento real do Google diante de cota, permissão e erro de Drive só se vê na conta de teste |
| R4 | Separação teste/produção: pacote de produção sem gerador de dados fictícios e sem permissões só de teste, conferido por teste automático | Code | feita; pacote instalado só na cópia descartável, menu sem gerador e sincronização automática/interativa conferidos; limites de consentimento no relatório |
| R5 | Preparação do piloto: roteiro no Google, resultados esperados e dúvidas para a nutricionista | Ambos | cenários técnicos executados na cópia conforme RESULTADOS-GOOGLE-2026-09-30.md; conversa com nutricionista e piloto com cliente ainda pendentes |
| R7 | Revisão Opus do PR 6 (A1, M1 a M4, B1 a B7) e conferência das correções | Code | feita no código (`tests/regressoes-opus.test.js`, D30 e D31; relatório em `revisoes/revisao-opus-pr6.md` na pasta do projeto); B7 virou a pendência P11 da fase 2b; PDF, grade e fuso conferidos; recusa de chave Pix com pontuação ainda sem evidência real (RESULTADOS-GOOGLE-2026-09-30.md) |
| R6 | Correções da revisão automática do PR 6 (R01, R03 a R11, D17, N9-03) e integração das PRs 8, 9 e 10 | Code | feita no código (`tests/regressoes-revisao.test.js`, `tests/precos.test.js`, D25 a D28); revisão local encerrada em 979b202 e cenários Google registrados em RESULTADOS-GOOGLE-2026-09-30.md; manter os limites ali descritos |

## Fase 1 — Agenda sem código (feita à mão, com a cliente)

| # | Tarefa | Dono |
|---|---|---|
| F1 | Página de agendamento com as regras dela (janelas, duração, intervalo, antecedência, horizonte, limite diário) | Você |
| F2 | Mensagem de ausência, respostas rápidas e etiquetas no WhatsApp Business dela | Você |
| F3 | Roteiro de instalação em uma página | Code |

## Fase 2b — Acompanhamento e fila de ajustes (esqueleto agora, detalhes com a cliente)

| # | Tarefa | Dono | Situação do esqueleto |
|---|---|---|---|
| T20 | Formulário da pergunta semanal com código pré-preenchido e aba Respostas | Code | esqueleto feito (`src/Respostas.js`, lógica pura); nada criado no Google; pendências P1, P2, P8 |
| T21 | Painel de presença: "ainda não" duas vezes, silêncio, nota escrita, retorno sem data | Code | esqueleto feito (`src/Presenca.js`, lógica pura, sem painel na planilha); pendências P3, P4 |
| T22 | Fila de ajustes com aprovação em um ou dois toques | Code | esqueleto feito (`src/FilaAjustes.js`, lógica pura, sem aba nem botão); pendências P5, P6 |
| T23 | Biblioteca de frases e geração de links wa.me com texto pronto | Code | esqueleto feito (`src/Frases.js`, só monta o link; frases de exemplo); pendência P7 |
| T24 | Os três modos de acompanhamento e o limite de mensagens por modo | Code | esqueleto feito (`src/Modos.js`, lógica pura, limites de exemplo); pendências P9, P10 |

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

## Próxima entrega — interface própria sobre a base Google (D33)

| # | Tarefa | Situação / aceite |
|---|---|---|
| UI00 | Definir identidade, acesso restrito, isolamento por consultório e contexto do Apps Script | a fazer; impedir acesso sem autorização e provar leitura da planilha correta fora do menu. Reavaliar necessidade de escopo, sem ampliação automática |
| UI01 | Tela de consultas com detalhes | a fazer após UI00; carregar dados reais da cópia de teste, com estados de carregamento, vazio e erro; uso integral pela interface |
| UI02 | Pix da cobrança a receber pela interface | a fazer após UI01; selecionar consulta por ID estável, encontrar sua cobrança e usar as regras existentes; copiar código, recusar pagamento já pago e não alterar status financeiro |
| UI03 | Validar o percurso completo | a fazer após UI02; dados fictícios, sem abrir planilha/menus; conferir permissões, atualização da lista e valor/recebedor do Pix |

Essas tarefas são planejamento aprovado de direção, não código concluído. Não implementar portal do paciente, editor alimentar ou fase 2b por inferência nesta entrega.
