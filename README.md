# Kit do Consultório

Solução para consultórios de nutrição que roda **dentro da conta Google de cada nutricionista**: Agenda, Planilhas, Formulários e Apps Script. Não existe servidor próprio.

**Estado:** base e financeiro testados nos cenários descritos em [Resultados no Google](docs/RESULTADOS-GOOGLE-2026-09-30.md). **Somente dados fictícios; sem liberação para clientes.**

**Direção aprovada para o MVP:** a nutricionista usará uma interface gráfica própria; Planilhas, Agenda e Drive ficarão por trás dela. Essa interface ainda não foi implementada. O uso atual pelos menus da planilha é o caminho técnico validado. Consulte [MVP: interface sobre a base Google](docs/MVP-INTERFACE-GOOGLE.md) e [Tarefas](docs/TAREFAS.md).

## Estrutura

- `src/` — código do Apps Script (JavaScript V8).
- `tests/` — testes da lógica pura, rodados com `node --test`, sem dependências.
- `scripts/` — ferramentas de apoio (ciclo de revisão com o ChatGPT: `docs/CICLO-REVISAO.md`).
- `docs/` — especificação, tarefas, decisões, segurança e manutenção.

## Manuais

- `docs/MANUAL-NUTRICIONISTA.md`: uso no dia a dia.
- `docs/MANUAL-SUPORTE.md`: instalação, atualização e falhas comuns.
- `docs/VALIDACAO-NO-GOOGLE.md`: o que está implementado e o que ainda precisa ser conferido no Google.
- `docs/ROTEIRO-PILOTO.md`: passo a passo dos testes na conta de TESTE, com o resultado esperado de cada um.
- `docs/DUVIDAS-NUTRICIONISTA.md`: perguntas para conversar com a nutricionista antes de instalar.
- `docs/REVISAO-T00-T11.md`: revisão do código e dúvidas para o Caio.

## Por onde começar

1. Leia `docs/PRIMEIROS-PASSOS.md` e faça a parte manual.
2. Abra o Claude Code nesta pasta e cole o conteúdo de `PROMPT-CLAUDE-CODE.md`.
3. Siga `docs/TAREFAS.md`, uma tarefa por vez.
