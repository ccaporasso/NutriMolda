# Registro de mudanças

## [não lançado]

- 2026-09-29: estrutura inicial de documentação criada (especificação, tarefas, decisões, segurança, manutenção).
- 2026-09-29: repositório recomeçado do zero como Kit do Consultório.
- 2026-09-29: T00 (parte do Code): `src/appsscript.json` com fuso `America/Sao_Paulo`, V8 e só o escopo `spreadsheets.currentonly`; `src/Principal.js`; `tests/estrutura.test.js`; `.gitignore`; `.clasp.json.exemplo`. Escopos justificados em `docs/DECISOES.md` (D16).
- 2026-09-29: T01: `src/Esquema.js` (abas, cabeçalhos, listas e plano de instalação, lógica pura), `src/Instalador.js` (menu "Kit do Consultório" e `instalarPlanilha`, idempotente, cabeçalhos protegidos em modo aviso) e `tests/esquema.test.js`. Nenhum escopo novo.
- 2026-09-29: T01 (correções da revisão): Configurações com cabeçalho estranho não recebe chaves; CPF, telefone e códigos ficam como texto (não perdem zero à esquerda); leitura não quebra em aba com menos colunas; aba padrão vazia reconhecida em português, inglês e espanhol.
- 2026-09-29: T02: `src/Configuracoes.js` (validação pura das Configurações: chave ausente, valor inválido, limites do Pix de 25 e 15 caracteres, e-mail, preços em centavos inteiros) e `src/LeitorConfiguracoes.js` (`lerConfiguracoes`, que lê a aba e para com a lista de erros em português). Trava `precoParaCobranca`: preço ausente, zero ou inválido bloqueia a cobrança (nova decisão D17). Testes em `tests/configuracoes.test.js`. Nenhum escopo novo.
- 2026-09-29: T02 (revisão): a coluna `valor` de Configurações agora é gravada como texto pelo instalador (não perde zeros à esquerda); campo textual que chega como número, data ou verdadeiro/falso, principalmente `chave_pix`, dá erro e nunca é corrigido automaticamente; preços continuam em centavos e não são multiplicados nem ganham zeros (nova decisão D18). Novo `tests/instalador.test.js` roda o instalador contra uma planilha simulada.
- 2026-09-30: T06: `src/Pix.js` (Pix copia e cola em lógica pura: CRC16-CCITT, campos do padrão, valor em centavos, nome e cidade sem acento, erros em português sem mostrar a chave) e `tests/pix.test.js`. Nenhum escopo novo.
