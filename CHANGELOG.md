# Registro de mudanças

## [não lançado]

- 2026-09-29: estrutura inicial de documentação criada (especificação, tarefas, decisões, segurança, manutenção).
- 2026-09-29: repositório recomeçado do zero como Kit do Consultório.
- 2026-09-29: T00 (parte do Code): `src/appsscript.json` com fuso `America/Sao_Paulo`, V8 e só o escopo `spreadsheets.currentonly`; `src/Principal.js`; `tests/estrutura.test.js`; `.gitignore`; `.clasp.json.exemplo`. Escopos justificados em `docs/DECISOES.md` (D16).
- 2026-09-29: T01: `src/Esquema.js` (abas, cabeçalhos, listas e plano de instalação, lógica pura), `src/Instalador.js` (menu "Kit do Consultório" e `instalarPlanilha`, idempotente, cabeçalhos protegidos em modo aviso) e `tests/esquema.test.js`. Nenhum escopo novo.
- 2026-09-29: T01 (correções da revisão): Configurações com cabeçalho estranho não recebe chaves; CPF, telefone e códigos ficam como texto (não perdem zero à esquerda); leitura não quebra em aba com menos colunas; aba padrão vazia reconhecida em português, inglês e espanhol.
