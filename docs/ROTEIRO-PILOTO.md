# Roteiro de testes no Google (conta de TESTE)

Para o Caio executar, na conta Google de TESTE, com **dados inventados**. Cada passo diz o que fazer, o que deve acontecer e o que anotar. Complementa `docs/VALIDACAO-NO-GOOGLE.md` (que explica o que cada tarefa deixou por validar) e não substitui a revisão de segurança.

**Regras deste roteiro:** só a conta de TESTE; só dados inventados (pacientes P9001 a P9006); nada de dado de paciente real; nenhum envio para a conta da cliente. O `clasp push` para o projeto de TESTE só acontece depois do seu "ok".

Como anotar: na coluna "Resultado", escreva **OK** ou descreva o que aconteceu de diferente (com data e hora, e uma foto da tela se ajudar, sem nome real). Falha **não é vergonha**: é o que o roteiro existe para achar.

## 0. Preparação

| # | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|
| 0.1 | `node --test` na pasta do projeto | Tudo passa, com 0 falhas | |
| 0.2 | Conta de TESTE com verificação em dois fatores; planilha nova; **Extensões → Apps Script**; copiar o ID do script para o `.clasp.json` (passos em `docs/PRIMEIROS-PASSOS.md`) | `.clasp.json` fica fora do Git | |
| 0.3 | Com o seu "ok", `clasp push` **para o projeto de TESTE** (confira `clasp --help`) | Recarregando a planilha, aparece o menu **Kit do Consultório** | |
| 0.4 | Menu **Configuração → Instalar/atualizar planilha** e autorizar todas as permissões | A tela lista 6 permissões: planilha atual, e-mail, agenda (eventos), gatilhos, Docs, Drive (só arquivos do kit; o serviço avançado Drive v3 aparece em Serviços do projeto). Nenhuma de "todo o Drive" nem "todas as planilhas" | |
| 0.5 | Olhar as abas | 7 abas: Configurações, Pacientes, Consultas, Pagamentos, Pacotes, Despesas, Registro. Cabeçalhos em negrito e protegidos (o Google avisa ao editar) | |
| 0.6 | Rodar **Instalar/atualizar planilha** de novo | Nada duplicado: mesmas abas, mesmas 13 chaves | |
| 0.7 | Na agenda de teste (criada por você, **secundária**), copiar o ID (termina em `@group.calendar.google.com`) para `calendario_id` | ID gravado como texto | |
| 0.8 | Preencher Configurações com dados **inventados**: `nome_profissional` "Dra. Teste Exemplo", `crn` "CRN-0 00000", `valor_primeira_consulta_centavos` `15000`, `valor_retorno_centavos` `10000`, `chave_pix` uma chave fictícia, `nome_recebedor_pix` "DRA TESTE", `cidade_recebedor_pix` "SAO PAULO", `email_alertas` o e-mail da conta de teste | Sem erro; a `chave_pix` continua como texto (se for só números, confira se não perdeu zero à esquerda) | |

## 1. Agenda para consultas (T04, T05)

| # | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|
| 1.1 | **Somente na conta de TESTE → TESTE: criar dados fictícios** e clicar OK na confirmação | Janela avisa "Pacientes de teste novos: 6. Eventos criados: 9". Na agenda de teste aparecem 9 eventos "Consulta — Nome X." e na aba Pacientes, P9001 a P9006 | |
| 1.2 | Repetir 1.1 | "Pacientes novos: 0. Eventos criados: 0" (nada duplica) | |
| 1.3 | Trocar `calendario_id` para `primary` e repetir 1.1 | **Recusa** com a mensagem de agenda separada (pode aparecer como aviso de erro do Apps Script, não como janela do kit: dúvida 9 da revisão); nada é criado na agenda principal. Depois volte ao ID de teste | |
| 1.4 | **Sincronizar agenda** | Janela: 9 consultas novas, 1 "a identificar". Aba Consultas com 9 linhas; `data` como 2026-MM-DD e `hora` como HH:MM (texto, não data do Planilhas); 1 linha com `codigo_paciente` em branco | |
| 1.5 | Conferir tipos | 7 `primeira` e 2 `retorno` (P9001 e P9003 têm retorno depois da primeira). O paciente P9006 aparece como `primeira`, mesmo com o evento dizendo retorno: o kit decide pelo histórico | |
| 1.6 | **Sincronizar agenda** de novo | Nenhuma linha nova; nenhuma alteração | |
| 1.7 | Na linha sem código, digitar `P9001` e sincronizar de novo | O código digitado permanece. Depois **apague o código de novo**, para a consulta continuar "a identificar" no passo 2.2 | |
| 1.8 | Menu **Configuração → Ativar sincronização automática**, duas vezes | Segunda vez avisa que já estava ativa. Em Apps Script → Gatilhos há **um** gatilho de hora em hora | |
| 1.9 | Esperar uma hora e olhar o Registro | Há uma linha "Sincronização: ..." vinda do gatilho, sem nome de paciente | |

## 2. Cobrança e pagamento (T07, T08)

| # | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|
| 2.1 | **Gerar valores a receber** | Aba Pagamentos: ids PG000001 em diante, status `a_receber`, valor 15000 (primeira) ou 10000 (retorno). | |
| 2.2 | Conferir a soma dos valores com uma calculadora | 8 cobranças = 6 x R$ 150,00 + 2 x R$ 100,00 = **R$ 1.100,00**. A consulta de "Fulano D." (sem paciente) não gera cobrança e há aviso | |
| 2.3 | **Gerar valores a receber** de novo | Nenhuma linha nova | |
| 2.4 | Aba Consultas: clicar na consulta passada de P9001 e usar **Consulta → Marcar como realizada**; repetir para P9002 e P9003 | Status `realizada`; `atualizado_em` preenchido | |
| 2.5 | Aba Pagamentos: clicar na cobrança de P9001 e usar **Pagamento → Marcar como pago (Pix)** | `status` pago, `forma` pix, `data_pagamento` de hoje | |
| 2.6 | Arrastar a seleção sobre as cobranças de P9002 e P9003 e usar **Marcar como pago (cartão)** | As duas ficam pagas em cartão | |
| 2.7 | Repetir 2.5 na mesma linha | Recusa: "já está pago". Nada muda | |
| 2.8 | Selecionar 21 linhas e marcar como pago | Recusa: "no máximo 20 linhas" | |
| 2.9 | Selecionar com **Ctrl+clique** duas linhas separadas | **Anote o que acontece.** O kit só considera o primeiro bloco selecionado (dúvida 12 da revisão) | |
| 2.10 | Numa cobrança de P9006: **Marcar como cortesia**, responder "não" e depois "sim" | "Não" não muda nada; "sim" deixa valor 0, status e forma `cortesia` | |
| 2.11 | Em Pacotes, cadastrar `P9004`, total 2, usadas 0, valor 30000, início de hoje. Numa cobrança de P9004, **Marcar como consulta de pacote** | Cobrança vira paga, forma `pacote`, valor 0; `usadas` sobe para 1 | |
| 2.12 | Aba Consultas, no retorno de P9003 (que tem cobrança a receber): **Consulta → Marcar como faltou** | Aviso: decidir entre cobrar ou cortesia. O kit não mexe na cobrança | |
| 2.13 | Na agenda de teste, apagar o evento de P9005 e usar **Sincronizar agenda**. **Anote:** o Google devolveu o evento apagado? (é o que o kit espera com `showDeleted`) | A consulta de P9005 vira `cancelada` | |
| 2.14 | **Gerar valores a receber** | Aviso: consulta cancelada ainda tem valor a receber; a cobrança **continua** lá (nada é apagado). Marcar como cortesia resolve | |

## 3. Pix copia e cola (T06)

| # | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|
| 3.1 | Clicar numa cobrança `a_receber` e usar **Pagamento → Gerar Pix copia e cola** | Janela com texto começando em `000201`, inteiro e selecionável (**anote se foi cortado**) | |
| 3.2 | Colar o texto no app de um banco, na opção "Pix copia e cola", **sem pagar** | O app mostra o valor certo (ex.: R$ 150,00) e o nome do recebedor ("DRA TESTE") | |
| 3.3 | Em um banco, se possível, repetir com outro app | Mesmo resultado | |
| 3.4 | Tentar gerar o Pix de uma cobrança já paga | Mensagem "não há Pix a gerar" | |
| 3.5 | Colocar 30 letras em `nome_recebedor_pix` e gerar o Pix | Mensagem citando o limite de 25; a chave não aparece na mensagem. Depois desfaça | |

## 4. Recibo em PDF (T09)

| # | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|
| 4.1 | **Configuração → Criar modelo e pasta de recibos** | Criados o Docs "Modelo de recibo - Kit do Consultório" e a pasta "Recibos - Kit do Consultório"; os dois ids aparecem em Configurações | |
| 4.2 | Repetir 4.1 | "Já estão configurados. Nada foi criado" | |
| 4.3 | Na cobrança paga em Pix (P9001), preencher `pagador_nome` "Maria Souza Teste" (inventado) e `pagador_cpf` `52998224725` (CPF de exemplo). **Pagamento → Gerar recibo em PDF** | Janela com o link. **Este é o teste mais arriscado do lote (D20, serviço avançado Drive v3):** se o Google disser "arquivo não encontrado" ou pedir permissão maior, `drive.file` não basta: pare e me avise | |
| 4.4 | Abrir o PDF | Traz: número PG..., quem recebeu, CPF `529.982.247-25`, valor `R$ 150,00`, descrição com a data da consulta, forma Pix, data do pagamento, nome e CRN. Nenhum `{{campo}}` sobrando. Acentos corretos | |
| 4.5 | Conferir o nome do arquivo e a pasta | `Recibo-PG00000X-P9001.pdf`; **sem nome de pessoa**; sem arquivo `rascunho-...` fora da lixeira | |
| 4.6 | Repetir 4.3 na mesma linha | "Já tem recibo"; nenhum PDF novo. Apagar só o link com o PDF ainda na pasta **religa o PDF antigo** (nenhum PDF novo); para liberar um novo, mande o PDF para a lixeira **e** apague o link (teste só se quiser). Se o valor, a data ou a forma do pagamento mudou depois do PDF, o kit para com "não consigo confirmar" em vez de religar (teste só se quiser) | |
| 4.7 | Sem CPF: repetir com outra cobrança paga | A linha do CPF some do recibo | |
| 4.8 | **Só depois de terminar a seção 5** (isto muda o total do relatório): mudar o valor de uma cobrança paga de teste para `123456` e gerar o recibo. Desfaça depois | Sai `R$ 1.234,56` | |
| 4.9 | Editar o modelo no Docs acrescentando `{{campo_inventado}}` e gerar um recibo | Mensagem citando o campo; nenhum PDF criado. Desfaça | |
| 4.10 | Mandar o **modelo** para a lixeira no Drive e gerar um recibo | Janela "Não foi possível concluir"; um erro no Registro e **um e-mail** de alerta; nenhum PDF; nenhum link gravado. Restaure o modelo depois | |
| 4.11 | Apagar o `pagador_nome` e gerar | Mensagem "preencha pagador_nome"; sem e-mail de alerta (é problema de uso) | |

## 5. Relatório do mês (T10)

| # | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|
| 5.1 | **Relatório do mês (aba e CSV)**, mês em branco | Cria a aba "Relatório AAAA-MM" | |
| 5.2 | Somar à mão os pagamentos `pago` (Pix, cartão, dinheiro) do mês e comparar | Total igual ao da linha TOTAL. Cortesia, pacote e a receber ficam de fora. Exemplo do roteiro: 3 pagos de R$ 150,00 = **R$ 450,00** | |
| 5.3 | Abrir o `Relatorio-AAAA-MM.csv` (na pasta de recibos) no Excel ou no Planilhas em português | Acentos corretos, colunas separadas, valores com vírgula ("150,00") | |
| 5.4 | Rodar o relatório de novo | A aba é refeita e o **mesmo** CSV é atualizado (sem segundo arquivo, sem segunda aba) | |
| 5.5 | Pagador sem CPF | Aviso "sem CPF válido" | |
| 5.6 | Digitar `setembro` no mês | Mensagem "Mês inválido"; nada é gerado | |
| 5.7 | Apagar o `id_pasta_recibos` e gerar | A aba sai; o CSV não, com aviso claro. Desfaça | |
| 5.8 | **Mostrar um exemplo fictício à contadora** | Ela diz se o formato serve (pergunta 7 em `docs/DUVIDAS-NUTRICIONISTA.md`) | |

## 6. Falhas e alertas (T03)

| # | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|
| 6.1 | **Configuração → Testar alerta de falha** | Janela: "Registrado: sim. E-mail enviado: sim". Chega e-mail com **só** módulo e horário; a aba Registro tem "Falha no módulo teste (tipo Error)" | |
| 6.2 | Colocar `sem-arroba` em `email_alertas` e repetir 6.1 | Janela diz que o e-mail **não** saiu; o Registro tem o aviso. Desfaça | |
| 6.3 | Apagar o valor de `chave_pix` e usar **Sincronizar agenda** | Janela lista a chave que falta, **sem e-mail** (é problema de uso). Desfaça. *Dúvida 2 da revisão: hoje a agenda exige a configuração inteira* | |
| 6.4 | Apagar o valor de `valor_primeira_consulta_centavos` e **Gerar valores a receber** | Aviso de que o preço da primeira consulta não está configurado; nada criado para esse tipo | |
| 6.5 | Digitar `150` (em vez de `15000`) em `valor_primeira_consulta_centavos` e gerar valores em uma planilha **sem cobranças** | Janela "Preço muito baixo (... R$ 1,50 ...)" pedindo confirmação; ao responder Não, nenhuma cobrança nasce | |
| 6.6 | Digitar `150,00` no mesmo campo | Recusa com mensagem citando a chave | |
| 6.7 | Renomear a aba Pagamentos e usar qualquer item de cobrança | Mensagem "A aba Pagamentos não existe. Use Instalar/atualizar planilha"; sem e-mail. Desfaça | |
| 6.8 | Apps Script → **Execuções**, olhar as execuções dos passos acima | Nenhuma tela de erro do Google (erros tratados aparecem como janela do kit) | |
| 6.9 | Menu Configuração > Definir preços das consultas (em reais): digitar `180,00` na primeira consulta e deixar o retorno em branco | Aba Configurações passa a `18000` na primeira consulta; o retorno não muda. `1,50` pede confirmação; `cem` é recusado sem gravar nada | |

## 7. Privacidade (regra 6 e LGPD)

| # | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|
| 7.1 | Ler a aba **Registro** inteira | Só módulo, tipo de falha, contagens e ids (PG...). Nenhum nome, e-mail, telefone, CPF nem chave Pix | |
| 7.2 | Ler os e-mails de alerta recebidos | Só módulo e horário | |
| 7.3 | Ver os nomes de todos os arquivos na pasta de recibos | Só número do recibo, código do paciente ou mês | |
| 7.4 | Ver o compartilhamento da planilha e da pasta | Só a conta de teste. **Nunca** "qualquer pessoa com o link" | |
| 7.5 | Ver os eventos na agenda de teste | Só "Consulta — Nome X."; sem dado clínico | |

## 8. Pacote de produção (R4)

| # | O que fazer | Resultado esperado | Resultado |
|---|---|---|---|
| 8.1 | `node scripts/empacotar-producao.js` | "Pacote de produção montado em dist/producao/ (com o número de arquivos de `src/`, menos 2)"; ficaram de fora `DadosTeste.js` e `GeradorTeste.js` | |
| 8.2 | Abrir `dist/producao/appsscript.json` | 6 permissões, com `calendar.events.readonly` e **sem** `calendar.events` | |
| 8.3 | Com o seu "ok", enviar o pacote de produção **ao projeto de TESTE** e autorizar de novo | A tela pede só leitura da agenda | |
| 8.4 | **Sincronizar agenda** | Funciona como antes. **Se der erro de permissão:** pare e avise; investigue a causa antes de qualquer mudança. Ampliar escopo só com decisão prévia do Caio (D23) | |
| 8.5 | Abrir o menu | **Não** aparece "Somente na conta de TESTE" | |

## 9. Critério para dizer que o teste passou

- Todos os passos com **OK**, ou cada diferença anotada e decidida (corrigir o kit, ou corrigir o roteiro).
- Itens 3.2 (Pix no app do banco), 4.3 (`drive.file`) e 8.4 (agenda somente leitura) são os que podem **mudar o desenho**: se algum falhar, avise antes de seguir.
- Só depois disso, e das condições da D12 (`docs/SEGURANCA-LGPD.md`: resposta do RH, contrato, aviso de privacidade revisado por advogado, revisão de segurança por uma pessoa desenvolvedora), pensar em instalar na conta da nutricionista.

## 10. Para apagar depois

**Somente na conta de TESTE → TESTE: apagar dados fictícios** remove os pacientes P9xxx, as consultas e pagamentos que o kit comprova serem de teste (id exato + agenda de teste) e os eventos de teste. Pacotes nunca são apagados, e consultas de versão antiga (sem `agenda_origem`) ficam, com aviso: apague à mão se forem de teste. Recibos e CSV de teste na pasta do Drive precisam ser apagados à mão.
