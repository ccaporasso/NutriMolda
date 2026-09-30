# Manual de suporte (para o Caio)

Como instalar, atualizar, conferir e resolver problemas do Kit do Consultório. Regras que não mudam: nenhum dado real de paciente fora da conta da cliente, nenhum `clasp push` sem você confirmar, e **nunca** instalar direto na conta dela sem testar antes na conta de TESTE.

## 1. Instalação (conta de TESTE primeiro)

Pré-requisitos e passos de `docs/PRIMEIROS-PASSOS.md` (Node, clasp, conta de teste, `.clasp.json`).

1. `node --test` na pasta do projeto: tudo deve passar.
2. Na conta de TESTE: planilha nova, **Extensões → Apps Script**, copie o ID do script para o `.clasp.json`.
3. Confirme com `clasp --help` os comandos da sua versão e envie o código (`clasp push`) **para o projeto de TESTE**.
4. Recarregue a planilha. Aparece o menu **Kit do Consultório**. Rode **Configuração → Instalar/atualizar planilha** (cria abas, cabeçalhos, listas e formato de texto) e autorize todos os escopos (tabela na seção 5).
5. Crie uma **agenda secundária** só para teste (o ID termina em `@group.calendar.google.com`) e cole em `calendario_id`.
6. Preencha as Configurações com dados **inventados** (chave Pix fictícia, CRN inventado).
7. **Configuração → Criar modelo e pasta de recibos.**
8. **Somente na conta de TESTE → TESTE: criar dados fictícios**, depois percorra `docs/VALIDACAO-NO-GOOGLE.md` item por item e anote o resultado.
9. Só depois de tudo validado e da sua confirmação, repita a instalação na conta da cliente (com o consentimento dela e os itens de `docs/SEGURANCA-LGPD.md` cumpridos).

## 2. Atualizar uma cliente já instalada

1. Mudança feita e testada na conta de TESTE.
2. Envie o código novo ao projeto da cliente.
3. Peça a ela **Configuração → Instalar/atualizar planilha** (idempotente: não duplica abas, chaves nem proteções e reaplica formatos).
4. Se a versão pedir escopo novo, ela verá uma nova tela de autorização.
5. Anote no `CHANGELOG.md`. Para voltar atrás: versão anterior pelo Git e pelo histórico de versões do Apps Script.

## 3. Onde olhar quando algo falha

1. **Aba Registro** da planilha: `data_hora`, módulo, nível, mensagem. A mensagem de falha é fixa ("Falha no módulo X (tipo Y)"); o texto do erro original **não** é copiado, de propósito (pode ter dado de paciente).
2. **Apps Script → Execuções**: dá a linha do erro. Só você, na conta de TESTE ou com o consentimento dela, deve olhar isto.
3. **Apps Script → Gatilhos**: confira se há **um** gatilho `sincronizarAgendaAutomatica` de hora em hora.
4. Peça à cliente a **data e hora** e o que ela clicava, sem nomes.

## 4. As falhas mais prováveis

| # | Sintoma | Causa provável | Como resolver |
|---|---|---|---|
| 1 | "Há problemas na aba Configurações" ao usar qualquer item | Chave em branco, preço em formato de reais, nome Pix acima do limite, ou chave Pix que o Planilhas transformou em número | Corrigir a linha citada. Chave Pix ou CPF que perdeu zero à esquerda: o kit **não** conserta sozinho (D18); digitar de novo. |
| 2 | Google pede autorização de novo, ou "Você não tem permissão" | Escopo novo numa atualização, ou autorização recusada | Rodar qualquer item do menu e aceitar. Conferir os escopos em `src/appsscript.json`. |
| 3 | Sincronização traz 0 consultas, ou avisa que "a agenda voltou vazia" | `calendario_id` errado, prefixo do título diferente, sem acesso à agenda, período (30 dias atrás a 120 à frente) | Conferir `calendario_id` e `prefixo_evento_consulta`. Por segurança, agenda vazia **não** cancela consultas. |
| 4 | Consultas com `codigo_paciente` em branco ("a identificar") | E-mail ou telefone da marcação não bate com **um** paciente ativo (ou bate com dois) | Cadastrar o contato em Pacientes ou digitar o código à mão (o kit nunca troca código digitado). |
| 5 | Recibo não sai, ou "arquivo não encontrado" | Faltam `pagador_nome` ou `data_pagamento`, CPF inválido, modelo com campo desconhecido, ou modelo/pasta **não criados pelo kit** (o escopo `drive.file` só enxerga o que o kit criou, D20) | Ler a mensagem. Se for "arquivo não encontrado": rodar **Criar modelo e pasta de recibos** em ids em branco. Se a validação mostrar que `drive.file` não basta, decidir com o Caio (D20) antes de ampliar. |
| 6 | Não chega e-mail de alerta | `email_alertas` errado ou cota diária de e-mails do Google | O erro continua no Registro. Conferir `email_alertas`; cotas em contas gratuitas são menores. |
| 7 | Não gera cobrança | Preço em branco ou zero (D17), consulta sem paciente, consulta `faltou` ou `cancelada` | Preencher o preço (centavos) e rodar **Gerar valores a receber**. |
| 8 | "Outra operação está em andamento" | Duas ações ao mesmo tempo (menu e gatilho) | Esperar um minuto e repetir. |

## 5. Escopos de permissão (resumo; a justificativa completa está em `docs/DECISOES.md`)

| Escopo | Uso |
|---|---|
| `spreadsheets.currentonly` | Só a planilha do kit |
| `script.send_mail` | E-mail de alerta de falha |
| `calendar.events` | **Só no pacote de teste (`src/`)**: ler eventos da agenda e criar/apagar os fictícios |
| `calendar.events.readonly` | **Só no pacote de produção**: ler eventos da agenda (D23; a validar no Google) |
| `script.scriptapp` | Gatilho de hora em hora |
| `documents` | Preencher o modelo do recibo |
| `drive.file` | Só arquivos e pastas criados pelo kit (recibos, CSV), pelo serviço avançado Drive v3 |

## 6. O que é dado pessoal aqui

- **Planilha:** códigos (P0001), primeiro nome e inicial, e-mail e telefone do paciente; nome e CPF de quem pagou.
- **Recibos (PDF) e CSV do relatório:** nome e CPF do pagador. Nome do arquivo tem só número do recibo, código do paciente ou o mês.
- **Registro e e-mails de alerta:** só módulo, tipo de falha e horário. Nunca nome, CPF, e-mail ou texto de erro.
- **Suporte:** você só olha dados da cliente quando ela pedir e nos limites do contrato (operador de dados).

## 7. Testes automáticos

`node --test` roda tudo, sem dependências, contra um **Google simulado** (`tests/apoio/simulacao.js`). Ele prova a lógica, não o comportamento real do Google. O que só a conta de teste confirma está em `docs/VALIDACAO-NO-GOOGLE.md`.

## 8. Pacote de teste e pacote de produção

- **Teste** = a pasta `src/` inteira (é o que o `clasp` envia ao projeto de TESTE). Tem o gerador de dados fictícios e o escopo `calendar.events`.
- **Produção** = `node scripts/empacotar-producao.js` monta `dist/producao/` (fora do Git). Não tem `DadosTeste.js`, `GeradorTeste.js` nem o submenu "Somente na conta de TESTE", e troca `calendar.events` por `calendar.events.readonly`. O script recusa montar o pacote se sobrar qualquer marca de teste.
- `node --test` já confere isso (`tests/producao.test.js`). O script só monta arquivos: não usa `clasp` e não envia nada.
- Só use o pacote de produção depois de cumprir o que a D12 e `docs/SEGURANCA-LGPD.md` exigem. Para enviá-lo à conta da cliente, faça um `.clasp.json` **separado** (fora do Git) com `rootDir` apontando para `dist/producao`, e só com a sua confirmação (regra 8).
