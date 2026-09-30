# Kit do Consultório

Solução configurável para consultórios de nutrição, com o **WhatsApp oficial como canal do paciente** e uma **interface própria para a nutricionista**. A direção do MVP é facilitar agendamento e acompanhamento, mostrando fatos sobre pacientes que precisam de atenção. Planilhas, Agenda e Apps Script formam a base inicial; a integração com a Meta exige uma ponte com tratamento mínimo de dados e persistência definida. Desenho em [WhatsApp: ponte e base Google](docs/WHATSAPP-PONTE-COFRE.md) (planejado, não implementado).

**Estado:** base e financeiro testados nos cenários descritos em [Resultados no Google](docs/RESULTADOS-GOOGLE-2026-09-30.md). **Somente dados fictícios; sem liberação para clientes.**

**Direção aprovada para o MVP:** WhatsApp e interface própria evoluem sobre o mesmo contrato (D42). Primeira entrega: liberar paciente → agendar → visualizar consulta → encaminhar ao atendimento humano. Remarcação, cancelamento e check-ins vêm em incrementos posteriores. O financeiro validado é complemento (D40). O uso atual pelos menus da planilha é o caminho técnico validado; a nova jornada ainda não foi construída. Consulte [MVP: interface sobre a base Google](docs/MVP-INTERFACE-GOOGLE.md) e [Tarefas](docs/TAREFAS.md).

**Próximo trabalho do Claude:** [bloco B1 — núcleo testável e interface local](docs/CLAUDE-BLOCO-1.md), sem depender de login, hospedagem ou credenciais da Meta. [Prompt de execução](PROMPT-CLAUDE-CODE.md).

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

1. Atualize sua cópia a partir de `main`, preservando trabalho local existente.
2. Abra o Claude Code no repositório e use `PROMPT-CLAUDE-CODE.md`; ele aponta para B1 e seus critérios de aceite.
3. Siga os incrementos do bloco e registre resultados. `docs/PRIMEIROS-PASSOS.md` continua sendo o guia de instalação futura; não é pré-requisito do trabalho local.
