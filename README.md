# Kit do Consultório

Solução para consultórios de nutrição que roda **dentro da conta Google de cada nutricionista**: Agenda, Planilhas, Formulários e Apps Script. Não existe servidor próprio.

**Estado:** em construção. Fase 2a (base e financeiro). **Somente dados fictícios.**

## Estrutura

- `src/` — código do Apps Script (JavaScript V8).
- `tests/` — testes da lógica pura, rodados com `node --test`, sem dependências.
- `scripts/` — ferramentas de apoio (ciclo de revisão com o ChatGPT: `docs/CICLO-REVISAO.md`).
- `docs/` — especificação, tarefas, decisões, segurança e manutenção.

## Manuais

- `docs/MANUAL-NUTRICIONISTA.md`: uso no dia a dia.
- `docs/MANUAL-SUPORTE.md`: instalação, atualização e falhas comuns.
- `docs/VALIDACAO-NO-GOOGLE.md`: o que está implementado e o que ainda precisa ser conferido no Google.

## Por onde começar

1. Leia `docs/PRIMEIROS-PASSOS.md` e faça a parte manual.
2. Abra o Claude Code nesta pasta e cole o conteúdo de `PROMPT-CLAUDE-CODE.md`.
3. Siga `docs/TAREFAS.md`, uma tarefa por vez.
