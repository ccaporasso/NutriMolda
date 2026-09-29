# Instruções para o Claude Code

## Contexto

Este repositório é o **Kit do Consultório**: automações para uma nutricionista, instaladas na conta Google dela. Quem decide é o Caio. Ele **não programa com fluência**: explique cada mudança em linguagem simples, diga o que foi feito, como testar e o que pode dar errado.

Leia antes de qualquer tarefa: `docs/ESPECIFICACAO.md`, `docs/DECISOES.md`, `docs/SEGURANCA-LGPD.md` e a tarefa atual em `docs/TAREFAS.md`.

## Regras que nunca mudam

1. **Nenhum dado real de paciente**, nem em testes, exemplos, logs ou commits. Só dados inventados.
2. **Nenhum servidor próprio.** Nada de web app público, banco externo ou hospedagem. Tudo roda no Google da nutricionista.
3. **Nenhuma automação não oficial do WhatsApp** (QR code, WhatsApp Web, bibliotecas não oficiais).
4. **A IA nunca escreve para o paciente.** Não existe IA nesta fase.
5. **Permissões mínimas.** Declare os escopos em `appsscript.json` e justifique cada um em `docs/DECISOES.md`.
6. **Nada de dado de saúde em registros, e-mails de alerta ou nomes de arquivo.** Use o código do paciente.
7. **Nenhuma dependência nova sem perguntar.** Os testes usam só `node:test`.
8. **`clasp push` só para o projeto de TESTE e só depois de o Caio confirmar.**
9. **Não diga que está pronto sem ter rodado `node --test`** e mostrado o resultado.

## Como trabalhar

1. Pegue **uma** tarefa de `docs/TAREFAS.md` (a primeira com situação "a fazer" cujas dependências estejam feitas).
2. Antes de programar, escreva o plano em até 10 linhas e espere o "ok".
3. Separe a **lógica pura** (cálculos, formatação, validação) das **chamadas ao Google** (SpreadsheetApp, CalendarApp, DocumentApp, MailApp). A lógica pura fica em arquivos testáveis no Node.
4. Escreva ou atualize os testes em `tests/` e rode `node --test`.
5. Atualize `CHANGELOG.md` e marque a tarefa como feita em `docs/TAREFAS.md`.
6. Termine com: o que mudou, como o Caio testa manualmente (passo a passo) e o que ficou pendente.

## Estilo de código

- JavaScript do Apps Script (V8), sem TypeScript. Nomes em português, comentários curtos.
- Arquivos de lógica pura usam exportação condicional para rodar também no Node:
  `if (typeof module !== 'undefined') { module.exports = { ... }; }`
- Funções pequenas. Mensagens de erro em português, claras para a nutricionista.
- Fuso horário sempre `America/Sao_Paulo`. Valores em centavos (inteiros) na lógica; formatação em reais só na saída.
- Scripts de instalação e sincronização são **idempotentes**: rodar duas vezes não duplica nada.

## Ferramentas

- `clasp` para enviar e baixar o código do Apps Script. Os comandos mudam entre versões: confira `clasp --help` antes de usar.
- `node --test` para os testes.
