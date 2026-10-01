# Roteiro de validação no Google real (ambiente descartável) (Gate, etapa G e item 22)

**Estado: PREPARADO, NÃO EXECUTADO.** Nenhum item abaixo foi observado no Google. Todas as linhas estão **N/M** (não medido). Uma linha só passa a **E1** (execução observada) quando alguém a executa e preenche data, quem executou, o commit testado e o que viu. Nada disto é validação de produção: usa apenas contas e dados descartáveis e inventados, nunca paciente real.

Por que existe: os testes locais (E2) rodam num Google simulado em memória. Eles provam a lógica do kit, não o que o Google realmente faz com `appProperties`, `drive.file`, `LockService`, `Calendar` e com os programas que abrem o CSV. Este roteiro fecha essa lacuna sem inventar resultado.

## Regras (CLAUDE.md, regras 1, 2, 5 e 8)

- Só dados inventados (pacientes P9001 a P9006 do gerador de teste, e-mails `.invalid`, CPFs de exemplo). Nenhum dado de paciente real, em nenhum momento.
- `clasp push` só para o projeto de **TESTE** e só depois de o Caio confirmar. Este roteiro **não** autoriza o envio: quem for executar pede a confirmação antes.
- Rodar só depois de `node scripts/gate.js` terminar com `RESULTADO: PASS`; anotar o commit (`git rev-parse HEAD`).
- Não ampliar escopo por conta própria: se algo exigir permissão a mais, parar e registrar (D23).
- Nada de chave Pix, e-mail ou telefone reais colados neste documento ou em capturas de tela: cobrir antes de guardar.

## Ambiente descartável (item 1)

| Recurso | Conta A | Conta B |
|---|---|---|
| Conta Google gratuita criada só para o teste | A | B |
| Planilha com o kit instalado | Planilha A | Planilha B (cópia vazia, instalada à parte) |
| Drive | Drive A (pasta de recibos criada pelo kit) | Drive B |
| Agenda | Agenda A (agenda secundária "Kit TESTE", ID `...@group.calendar.google.com`) | Agenda B (idem) |
| Projeto do Apps Script (TESTE) | enviado com `clasp push` após confirmação do Caio | idem, separado |

## Modelo de registro de cada item

Para cada item executado, copiar para `docs/gate/RESULTADOS-GOOGLE-REAL-AAAA-MM-DD.md` (arquivo novo; este roteiro não é reescrito):

```
Item: <número> | Data: <AAAA-MM-DD> | Quem: <nome> | Commit: <SHA> | Conta: <A ou B>
Resultado: OK / FALHOU / PARCIAL | Evidência: E1
O que foi visto (sem dado pessoal): ...
Divergência em relação ao esperado: ...
```

Falhou ou divergiu: abrir um achado novo em `docs/gate/ACHADOS.md` (ACHADO/ANTES/CORREÇÃO/DEPOIS/REGRESSÃO/EVIDÊNCIA); não apagar o resultado ruim.

## Roteiro

| # | O que fazer | Resultado esperado | O que olhar | Evidência |
|---|---|---|---|---|
| 1 | Criar as contas A e B, as planilhas, as agendas secundárias e a pasta de teste | Ambiente separado, sem nenhum dado real | Nome das contas descartáveis; agenda com ID terminando em `@group.calendar.google.com` | N/M (não executado) |
| 2 | Menu "Instalar/atualizar planilha" duas vezes na Planilha A | Abas e cabeçalhos criados; coluna de valores das Configurações em texto; fuso `America/Sao_Paulo`; a 2ª vez não duplica nada | Abas, proteções, formato da coluna B, fuso em Arquivo > Configurações | N/M |
| 3 | Primeira autorização do script | A tela de consentimento lista exatamente os escopos de `src/appsscript.json` | Comparar com a lista do manifesto, sem escopo a mais | N/M |
| 4 | "Criar dados de teste" na agenda secundária; "Sincronizar agenda"; apagar um evento; mudar o horário de outro; sincronizar de novo | Consultas inseridas; apagado vira cancelada; remarcado muda data e hora; repetir não duplica | Aba Consultas e aba Registro | N/M |
| 5 | **Escopos concedidos:** olhar em myaccount.google.com/permissions o que foi dado ao app; rodar o recibo e conferir que a consulta `appProperties has { key='kit_recibo_pagamento' and value='...' }` do Drive v3 funciona só com `drive.file` e só enxerga arquivos criados pelo kit; no pacote de produção, tentar escrever na agenda e ver a recusa | Concedido = lista aprovada; `drive.file` basta para as propriedades; produção só lê a agenda | Aviso do Google, resposta da API, mensagem do kit | N/M |
| 6 | Gerar valores a receber; mudar o preço para um valor suspeito e gerar de novo; marcar cortesia; marcar "faltou" | Cobrança por `id_evento` sem repetir; preço suspeito pede confirmação; cortesia zera e some do relatório; "faltou" só avisa | Aba Pagamentos e as caixas de confirmação | N/M |
| 7 | Marcar pago por Pix, cartão e dinheiro; marcar pago de novo; usar um item de menu com a aba errada aberta | A 2ª vez é recusada; a aba errada gera mensagem de uso sem e-mail | Mensagens e aba Registro | N/M |
| 8 | Pacote: cadastrar, consumir até acabar, tentar consumir mais; apagar `usadas` à mão e consumir de novo | Nunca passa do total; `usadas` se reconcilia; excesso é avisado | Aba Pacotes e Pagamentos | N/M |
| 9 | **Pix:** gerar o "copia e cola" e colar num aplicativo de banco (conta de teste do próprio executor); conferir nome, cidade e valor; tentar valor muito alto e chave inválida | O banco lê o código; nome, cidade e valor corretos; valor acima de R$ 9.999.999.999,99 e chave inválida são recusados pelo kit | Tela do banco (cobrir chave e nome antes de guardar a captura); nenhum pagamento real é necessário | N/M |
| 10 | **Recibo:** gerar; gerar de novo; apagar só o link (PDF continua na pasta) e gerar; mandar o PDF para a lixeira, apagar o link e gerar; provocar falha entre o PDF e a gravação do link (por exemplo, proteger a célula `link_recibo` por um instante) e repetir | Sempre 1 PDF ativo por pagamento; PDF existente é religado; falha deixa alerta e a repetição não duplica; propriedades `kit_recibo_pagamento` e `kit_recibo_paciente` gravadas | Pasta de recibos, Drive API `files.get` com `fields=appProperties`, aba Registro | N/M |
| 11 | **Concorrência real:** abrir a mesma planilha em duas abas do navegador e rodar ao mesmo tempo "Gerar recibo", "Criar modelo e pasta de recibos" e "Gerar valores a receber" | Uma execução espera ou recebe "Outra operação está em andamento"; nenhum duplicado | Mensagens, Drive e abas | N/M |
| 12 | Relatório do mês duas vezes; abrir o CSV na pasta | A mesma aba e o mesmo CSV são refeitos; só um CSV por mês | Pasta de recibos e aba "Relatório AAAA-MM" | N/M |
| 13 | "Ativar sincronização automática" duas vezes; deixar 24 horas | 1 gatilho só; 1 linha de Registro por execução; tempo de cada execução anotado | Apps Script > Gatilhos e Execuções; aba Registro | N/M |
| 14 | **CSV e fórmulas:** criar pagamentos com `pagador_nome` começando por `=`, `+`, `-`, `@` e tabulação; gerar o relatório; abrir o CSV no Excel e no Google Planilhas | O texto aparece como texto (com o espaço na frente), nunca como fórmula executada | O CSV aberto nos dois programas | N/M |
| 15 | Alerta: "Testar alerta de falha"; provocar um erro inesperado real (por exemplo, revogar o acesso à agenda); olhar Execuções e os logs | E-mail só com módulo e horário; Registro com módulo e tipo; **nenhum** dado de paciente nos logs do Google (A-13) | E-mail, aba Registro, Apps Script > Execuções | N/M |
| 16 | Dois pagamentos do mesmo nome com CPFs diferentes; gerar os dois recibos | Recibos distintos, cada um ligado ao seu pagamento; nunca religa o PDF errado | PDFs e propriedades | N/M |
| 17 | Pagamento pago sem CPF; gerar recibo | Recusa com mensagem clara, sem criar PDF | Mensagem e pasta | N/M |
| 18 | **Isolamento A x B:** (a) Conta B tenta abrir a Planilha A sem compartilhamento; (b) compartilhar a Planilha A com B como editora e rodar o menu como B; (c) B aponta `calendario_id` para a Agenda A; (d) B tenta gerar recibo de um pagamento da Planilha A; (e) copiar a Planilha A: conferir que a cópia não herda gatilho nem a propriedade da última agenda | (a) sem acesso; (b) o script roda com a autorização de B e o `drive.file` de B não vê arquivos criados por A (erro claro, nada gravado); (c) erro de agenda sem gravar; (d) sem acesso ao modelo e à pasta de A; (e) a cópia não herda gatilhos | Mensagens, abas, gatilhos | N/M |
| 19 | Escala real: 1.000 consultas e 1.000 pagamentos fictícios; cronometrar sincronização, "a receber" e relatório; 20.000 linhas no Registro e medir uma gravação | Tempos dentro do limite de execução do Apps Script; sem crescimento fora do esperado em `docs/gate/DESEMPENHO.md` | Apps Script > Execuções (duração) | N/M |
| 20 | Falha de rede e cota: executar com a conexão da agenda indisponível (revogar acesso por um instante) | Nada é cancelado por falta de resposta; alerta sai uma vez por dia por causa | Aba Consultas, Registro, e-mail | N/M |
| 21 | Repetir 4 a 12 depois de `git pull` de uma versão nova | Nenhuma regressão; reconciliações continuam idempotentes | Mesmos pontos | N/M |

## O que este roteiro não faz

- Não valida produção, não mexe na conta da nutricionista e não usa paciente real.
- Não substitui a revisão independente da ponte oficial (WA08) nem as pendências humanas (WA00, WA09, UI00).
- Não define branch protection: isso está em `docs/gate/REPRODUCAO.md` como recomendação.
