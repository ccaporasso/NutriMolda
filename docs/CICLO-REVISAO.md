# Ciclo de revisão: Claude escreve, ChatGPT revisa

O Claude Code não tem acesso ao ChatGPT, e o ChatGPT não tem acesso ao repositório. O elo entre os dois é um arquivo: o **pacote de revisão**. Você (Caio) carrega o pacote para o ChatGPT e traz a resposta de volta.

## O ciclo, por tarefa

1. **Claude** termina a tarefa (um commit `T05: ...`, `node --test` passando) e avisa.
2. **Gerar o pacote** (na pasta do repositório):
   `node scripts/revisao.js pacote T05 --base origin/claude/desenvolvimento`
   Cria `.revisao/pacote-T05.md`. Ele já traz o roteiro para o ChatGPT, os critérios de aceite, as decisões citadas, o diff do commit da tarefa e o resultado de `node --test`.
3. **Ler o aviso sobre dados pessoais** na seção "Aviso automático" do pacote. O pacote sai do seu computador para o ChatGPT: se algo ali for dado real, **não envie**.
4. **Colar no ChatGPT:** abra o arquivo, copie tudo e cole numa conversa nova. Ele responde no formato fixo (parecer, problemas com prioridade, arquivo e função, correção esperada).
5. **Salvar a resposta:** `node scripts/revisao.js salvar T05` (cole a resposta e tecle Ctrl+D), ou `--arquivo resposta.txt`. O script grava em `docs/revisoes/T05-AAAA-MM-DD.md` e confere o formato. Se disser que não segue o formato, peça ao ChatGPT para reenviar só no modelo.
6. **Commitar a resposta** na branch da tarefa e pedir ao Claude: "corrija a revisão em docs/revisoes/T05-....md". O Claude corrige só o que está lá (ALTA e MÉDIA sempre; BAIXA se for simples), roda `node --test`, faz novo commit e responde a cada problema (corrigido, ou por que não).
7. **Repetir** os passos 2 a 6 até o parecer ser APROVADO ou APROVADO COM RESSALVAS sem problema ALTA. Depois disso, a tarefa segue para a validação no Google (`docs/VALIDACAO-NO-GOOGLE.md`), que só você faz.

## Regras do ciclo

- O ChatGPT revisa e aponta; **quem altera o código é o Claude**. A decisão final é sua.
- Só dados fictícios no pacote, na resposta e nesta pasta.
- A revisão não substitui a validação no Google: os pontos que o ChatGPT listar em "Pontos para validar no Google" vão para `docs/VALIDACAO-NO-GOOGLE.md`.
- Sem `clasp push` e sem merge na `main` em nenhuma etapa.
- Sugestão para não estourar o limite de texto do ChatGPT: revisar uma tarefa (um commit) por vez. O script avisa quando o diff passa de 150 mil caracteres.

## Comandos

| Comando | O que faz |
|---|---|
| `node scripts/revisao.js pacote T05` | gera o pacote (`--base`, `--branch-inteira`, `--sem-testes`, `--saida`) |
| `node scripts/revisao.js salvar T05` | guarda a resposta e confere o formato |
| `node scripts/revisao.js conferir T05` | confere a última resposta salva e mostra o resumo |
| `node scripts/revisao.js modelo` | mostra o modelo de resposta |

Se o ChatGPT conseguir executar código (análise de dados/Python ou Node), o roteiro pede que ele rode `node --test`; se não conseguir, ele diz "Não rodei" e o resultado que vale é o do pacote.
