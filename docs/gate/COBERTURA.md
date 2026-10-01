# Cobertura de testes (Gate de Continuidade, etapa C)

Medida com a cobertura nativa do Node, sem dependência nova:

```
node scripts/cobertura.js            # tabela por módulo
node scripts/cobertura.js --detalhe  # linhas e ramos não executados
node scripts/cobertura.js --exigir   # exit 1 se um módulo crítico cair abaixo do piso (usado pelo gate)
```

**Escopo e limite da medida.** Mede o código de `src/` executado pela suíte contra o Google **simulado**. Cobertura alta mostra que o código
roda; não prova que o Google real se comporta como o simulador. Os testes são a única evidência (E2); nenhuma linha daqui é E1.
A medida não existia antes desta rodada (N/M); no começo, o código carregado no simulador nem era contado (achado A-10).

## Mapa por módulo

| Módulo | Linhas | Ramos (branches) | Funções | Criticidade |
|---|---|---|---|---|
| Acoes.js | 100.0% (147/147) | 100.0% (89/89) | 100.0% (20/20) | crítica |
| Agenda.js | 100.0% (269/269) | 100.0% (134/134) | 100.0% (32/32) | crítica |
| Alertas.js | 100.0% (59/59) | 100.0% (16/16) | 100.0% (5/5) | crítica |
| Configuracoes.js | 100.0% (242/242) | 100.0% (112/112) | 100.0% (14/14) | crítica |
| DadosTeste.js | 100.0% (179/179) | 100.0% (65/65) | 100.0% (33/33) | só teste |
| DriveAvancado.js | 100.0% (88/88) | 100.0% (32/32) | 100.0% (13/13) | crítica |
| Esquema.js | 100.0% (157/157) | 94.8% (55/58) | 100.0% (18/18) | normal |
| Execucao.js | 100.0% (42/42) | 100.0% (11/11) | 100.0% (4/4) | crítica |
| FilaAjustes.js | 100.0% (72/72) | 95.7% (45/47) | 100.0% (10/10) | normal |
| Formatos.js | 100.0% (110/110) | 100.0% (60/60) | 100.0% (12/12) | crítica |
| Frases.js | 100.0% (65/65) | 97.5% (39/40) | 100.0% (7/7) | normal |
| GeradorRecibo.js | 100.0% (185/185) | 100.0% (82/82) | 100.0% (19/19) | crítica |
| GeradorTeste.js | 100.0% (158/158) | 89.3% (50/56) | 100.0% (14/14) | só teste |
| GerarAReceber.js | 100.0% (45/45) | 100.0% (11/11) | 100.0% (4/4) | crítica |
| GerarRelatorio.js | 100.0% (51/51) | 100.0% (20/20) | 100.0% (5/5) | crítica |
| Instalador.js | 100.0% (89/89) | 100.0% (38/38) | 100.0% (11/11) | normal |
| LeitorAbas.js | 100.0% (106/106) | 97.1% (67/69) | 100.0% (15/15) | crítica |
| LeitorConfiguracoes.js | 100.0% (30/30) | 100.0% (16/16) | 100.0% (3/3) | crítica |
| Menu.js | 100.0% (178/178) | 100.0% (56/56) | 100.0% (31/31) | crítica |
| Modos.js | 100.0% (39/39) | 100.0% (21/21) | 100.0% (3/3) | normal |
| Pagamentos.js | 100.0% (143/143) | 100.0% (78/78) | 100.0% (20/20) | crítica |
| Pix.js | 100.0% (108/108) | 100.0% (63/63) | 100.0% (6/6) | crítica |
| Precos.js | 100.0% (51/51) | 100.0% (30/30) | 100.0% (5/5) | crítica |
| Presenca.js | 100.0% (72/72) | 95.7% (44/46) | 100.0% (15/15) | normal |
| Principal.js | 100.0% (9/9) | 100.0% (1/1) | 100.0% (0/0) | normal |
| Recibo.js | 100.0% (164/164) | 100.0% (73/73) | 100.0% (17/17) | crítica |
| Registro.js | 100.0% (106/106) | 97.2% (35/36) | 100.0% (11/11) | crítica |
| Relatorio.js | 100.0% (175/175) | 100.0% (95/95) | 100.0% (26/26) | crítica |
| Respostas.js | 100.0% (61/61) | 86.7% (26/30) | 100.0% (5/5) | normal |
| SincronizarAgenda.js | 100.0% (166/166) | 100.0% (82/82) | 100.0% (24/24) | crítica |
| **Total src/** | **100.0%** (3366/3366) | **98.7%** (1546/1567) | **100.0%** (402/402) | |

## Pisos do gate

Módulos críticos (dinheiro, consulta, documento, configuração, segurança): linhas ≥ 99%, ramos ≥ 95%, funções ≥ 99% (`scripts/cobertura.js`).
O piso está abaixo do medido de propósito: não é meta de 100%, é uma trava contra regressão.

## Ramos de módulos críticos não executados

| Módulo:linha | Classificação | Justificativa |
|---|---|---|
| LeitorAbas.js:12 (`valor === undefined \|\| null`) | DEFENSIVO | `getValues()` do Planilhas devolve texto vazio, não `undefined`/`null`; o ramo protege contra uma API que mudasse. |
| LeitorAbas.js:20 (`typeof folha.getLastColumn === 'function'`) | DEFENSIVO | Só serve a planilhas simuladas antigas que não têm o método; no Google ele existe. |
| Registro.js:20 (`match(/\d/g) \|\| []`) | INATINGÍVEL | O trecho casado pela expressão sempre contém dígito; o `\|\| []` nunca é usado. Não removido para não mexer em máscara de dado pessoal sem necessidade. |

Ramos de módulos **não** críticos (`Esquema`, `FilaAjustes`, `Frases`, `Presenca`, `Respostas`) são, em geral, a dupla via do Node/Google
(`typeof x !== 'undefined' ? x : require(...)`): o caminho `require` só existe no Node e o outro só no Google (GOOGLE REAL / INATINGÍVEL em um
único ambiente). `GeradorTeste.js` só existe no pacote de teste (SÓ TESTE).

## Classificação geral

- **TESTAR**: feito para todos os ramos que a revisão julgou de valor (ver `tests/ramos-criticos.test.js`).
- **TESTAR e endurecer** (`Configuracoes.js`, `errosPorChave || {}`): ramo antes não exercitado; resultado sem a separação por chave agora devolve todos os erros (na dúvida, interrompe), com teste em `tests/configuracao-dominios.test.js`. Nenhum ramo de módulo crítico sobra fora dos três DEFENSIVO/INATINGÍVEL da tabela acima.
- **REMOVER**: removido código morto (`linhaPacoteAtualizada`; alternativa `|| 0` impossível em `lerReais`).
- **GOOGLE REAL**: o resultado do `drive.file`, de `appProperties`, de `Calendar`, de `LockService` real só se observa no Google (ver `GOOGLE-REAL.md`).
