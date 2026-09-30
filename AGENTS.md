# Instruções para revisores automáticos (Codex e similares)

Projeto: Kit do Consultório, automações em Google Apps Script para uma nutricionista. Leia `CLAUDE.md`, `docs/ESPECIFICACAO.md`, `docs/DECISOES.md` e `docs/TAREFAS.md`. Responda em português, sem jargão: quem decide não programa.

## Review guidelines

Ao revisar um pull request, confira nesta ordem:

1. A tarefa (`docs/TAREFAS.md`) cumpre os critérios de aceite? Falta ou sobra algo?
2. Erros de lógica: fuso `America/Sao_Paulo`, valores em centavos (inteiros), rodar duas vezes duplica algo (tudo deve ser idempotente), casos de borda (vazio, texto no lugar de número, acentos).
3. O que o Google simulado dos testes não prova (SpreadsheetApp, CalendarApp, DocumentApp, DriveApp, MailApp).
4. Regras que nunca mudam, e qualquer violação é prioridade ALTA: nenhum dado real de paciente; nenhum servidor próprio ou web app público; nenhuma automação não oficial do WhatsApp; a IA nunca escreve ao paciente; escopos mínimos justificados em `docs/DECISOES.md`; nenhum dado de saúde em registro, e-mail de alerta ou nome de arquivo (só o código do paciente); nenhuma dependência nova.
5. Os testes (`node --test`, só `node:test`) cobrem o que importa? Algum passa por engano?

Formato de cada comentário: prioridade (ALTA, MÉDIA ou BAIXA), arquivo e função, o problema e a correção esperada. Não reescreva o projeto, não sugira dependência nova e só aponte o que dá para justificar pelo diff.
