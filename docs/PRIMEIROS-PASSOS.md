# Primeiros passos (parte manual)

Estes passos exigem login e autorizações suas. O Claude Code não faz.

1. **Crie uma conta Google só para testes.** Nada pessoal nem do trabalho. Ligue a verificação em dois fatores.
2. **Nessa conta, ative a API do Apps Script** nas configurações de usuário do Apps Script.
3. **Instale o Node.js** (versão LTS) no seu computador.
4. **Instale o clasp** com `npm install -g @google/clasp` e faça login com a conta de TESTE (`clasp login`, que abre o navegador).
5. **Crie uma pasta** para o projeto, copie estes arquivos para ela e inicie o Git (`git init`).
6. **Na conta de teste, crie uma agenda** para os eventos inventados.
7. **Abra o Claude Code na pasta** e cole o conteúdo de `PROMPT-CLAUDE-CODE.md`.
8. **Ligue o código ao projeto de teste** (fecha a T00):
   1. Na conta de TESTE, crie uma planilha nova e abra **Extensões → Apps Script**.
   2. No Apps Script, vá em **Configurações do projeto** e copie o **ID do script**.
   3. Na pasta do projeto, copie `.clasp.json.exemplo` para `.clasp.json` e troque `COLE_AQUI_O_ID_DO_PROJETO_DE_TESTE` pelo ID copiado. Esse arquivo não vai para o Git.
   4. Rode `node --test` (tudo deve passar) e depois `clasp push`. Confira em `clasp --help` se o comando mudou na sua versão.
   5. Recarregue o Apps Script no navegador: devem aparecer `Principal.gs` e, em Configurações do projeto, o fuso `(GMT-03:00) Horário de Brasília`.

Se algum passo falhar, peça ajuda ao Claude Code descrevendo a mensagem de erro, sem colar senhas nem códigos de acesso.
