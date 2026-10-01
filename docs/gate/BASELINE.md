# Baseline do Gate de Continuidade (antes de qualquer alteração)

Fotografia tirada em 01/10/2026, antes do primeiro commit desta rodada. Evidência E1 (execução observada), no ambiente local.

| Item | Valor |
|---|---|
| Commit inicial | `4ead36c3076967f6842f19b26df0befc660ac6a5` (main) |
| Branch de trabalho | `claude/gate-continuidade-96uxks` |
| Data | 01/10/2026 |
| Node | v22.22.0 |
| Sistema | Linux 6.18.44 x86_64 |
| Arquivos em `src/` | 30 módulos `.js` + `appsscript.json`, 3129 linhas de JS |
| Arquivos de teste | 28 em `tests/*.js` + 3 de apoio em `tests/apoio/` |

## Resultados

- `git status`: árvore limpa (HEAD solto na main).
- `git diff --check`: sem problemas.
- `node --test`: **343 testes, 343 aprovados, 0 falhos, 0 ignorados**, ~1,7 s.
- `node scripts/empacotar-producao.js`: sucesso. "Pacote de produção montado em dist/producao/ (28 arquivos)". Ficaram de fora: `DadosTeste.js`, `GeradorTeste.js`. (28 módulos `.js` de produção = 30 menos os 2 excluídos; o manifesto `appsscript.json` sai além deles, 29 arquivos na pasta.)
- Escopos de produção (manifesto): `spreadsheets.currentonly`, `script.send_mail`, `calendar.events.readonly`, `script.scriptapp`, `documents`, `drive.file`.

Cobertura percentual nesta data: **N/M** (nunca medida). Passa a ser medida na etapa C.
