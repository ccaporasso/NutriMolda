# Registro: crescimento e política de retenção (Gate, item 37)

**Em uma frase:** a aba Registro cresce de 8.760 a 17.520 linhas por ano (1 a 2 por execução do gatilho de hora em hora), nenhuma operação do kit a lê, e o kit nunca apaga nem gira o histórico sozinho; arquivar é uma decisão explícita de gente (decisão do Caio, abaixo).

## Quanto cresce (medido no Google simulado: `tests/registro-crescimento.test.js`)

A sincronização automática roda de hora em hora: 24 x 365 = **8.760 execuções por ano**.

| Situação da execução automática | Linhas gravadas | Por ano (8.760 execuções) |
|---|---|---|
| Tudo certo | 1 (`sincronizacao`, `info`) | 8.760 |
| Problema que ela corrige (cabeçalho, configuração, aba) | 1 por execução; e-mail no máximo 1 por dia por causa | 8.760 |
| Outra operação em andamento (trava) | 1 (`info`) | 8.760 |
| Pior caso: erro inesperado e e-mail de alerta impossível | 2 por execução (a falha e o aviso de que o e-mail não saiu) | 17.520 |

As ações dela (gerar a receber, relatório, recibo, pacote) gravam 1 linha cada, algumas dezenas por mês.

**Tamanho:** 4 colunas por linha. No pior caso são 17.520 x 4 = 70.080 células por ano. O limite do Google Planilhas é de 10.000.000 de células por planilha, somando todas as abas: o Registro usaria menos de 1% desse teto por ano (conta feita aqui, não observada no Google). Não é o Registro que vai encher a planilha.

**Custo para as operações:** nenhum. O Registro só recebe linhas no fim (`appendRow`, `src/Alertas.js`) e nenhum código o lê. Com 100.000 linhas no Registro, sincronizar e gerar relatório fazem exatamente as mesmas chamadas à planilha, à Agenda e ao Drive que com o Registro vazio (teste `Registro com 100.000 linhas...`).

## Política

1. **Nada é apagado.** O kit não apaga, não corta e não gira o Registro sozinho (teste: nenhum código chama apagar ou limpar sobre o Registro). O histórico só some se uma pessoa mandar, conscientemente.
2. **Revisão anual, em janeiro**, por quem dá suporte: abrir a aba Registro e olhar o tamanho. Abaixo de **20.000 linhas** (cerca de 2,3 anos de sincronização normal): nada a fazer.
3. **Passou de 20.000 linhas, ou o Registro ficou lento ao abrir:** arquivar à mão, em três passos explícitos: (a) criar uma planilha nova no Drive dela chamada "Registro do Kit até AAAA-MM"; (b) copiar para lá as linhas antigas (o Registro só tem data, módulo, nível e mensagem sem nome, sem CPF, e-mail ou dado de saúde: regra 6 do projeto; códigos de paciente, no máximo); (c) só depois de conferir a cópia, apagar essas linhas no Registro, mantendo o cabeçalho. Anotar na primeira célula da planilha de arquivo quem arquivou e em que data.
4. **Prazo de guarda do Registro:** não há prazo definido. Sugestão para o Caio decidir: guardar 24 meses de Registro corrente mais os arquivos, e revisar junto da política de LGPD (`docs/SEGURANCA-LGPD.md`).
5. **Arquivar por item de menu** ("Arquivar Registro antigo") não foi criado: exigiria definir onde fica o arquivo (outra aba ou outra planilha), o prazo e quem confirma. É a solução natural se a revisão manual se mostrar chata, mas é decisão do Caio.

## Decisões que ficam com o Caio

| # | Decisão | Recomendação |
|---|---|---|
| 1 | Prazo de guarda do Registro e o limiar de 20.000 linhas | Manter 24 meses no Registro corrente; revisar em janeiro |
| 2 | A sincronização automática continua gravando 1 linha por hora mesmo quando nada mudou? | Manter até o piloto: é a única prova de que o gatilho está vivo. Se incomodar, trocar por 1 linha por dia quando nada mudou (sem apagar nada) |
| 3 | Erro inesperado (fora do conjunto "problema de uso") manda e-mail a cada execução do gatilho; hoje só os problemas de uso têm limite de 1 e-mail por dia (A-17) | Aplicar o mesmo limite de 1 por dia e por módulo; muda o que a especificação diz ("todo erro gera e-mail") |

## O que não foi medido (N/M)

- Latência real do `appendRow` com dezenas de milhares de linhas no Google Planilhas.
- Tempo de execução real da sincronização automática e a cota diária de tempo de gatilhos do Google (o valor depende do tipo de conta e deve ser conferido na conta dela). Roteiro em `docs/gate/GOOGLE-REAL.md`.
