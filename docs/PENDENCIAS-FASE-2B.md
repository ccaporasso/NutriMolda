# Pendências da fase 2b (esqueleto de T20 a T24)

Esta fase está só em **esqueleto**: lógica pura em `src/`, testada com dados inventados, **sem nada criado no Google** (nenhum formulário, aba nova, gatilho ou menu) e **sem escopo novo**. O que depende da nutricionista ou de decisão do Caio está marcado no código como `PENDENTE Pn` e listado aqui. Enquanto uma pendência estiver aberta, o valor no código é só um exemplo para os testes.

Regras que continuam valendo: a IA nunca escreve para o paciente (D5), nada chega ao paciente sem ela aprovar (D8), não responder nunca gera cobrança (D9), mensagens neutras sem dado de saúde (D11), nenhum WhatsApp não oficial (D3).

| # | Pendência | Quem decide | Onde está no código | Situação |
|---|---|---|---|---|
| P1 | Texto da pergunta semanal e opções de resposta (hoje: sim, mais ou menos, ainda não) | Nutricionista | `OPCOES_RESPOSTA` em `src/Respostas.js` | aberta |
| P2 | Haverá campo de nota escrita? Tamanho máximo? Nota livre pode trazer dado de saúde: precisa de aviso ao paciente e de decisão do advogado | Nutricionista e advogado | `MAX_NOTA` em `src/Respostas.js` | aberta |
| P8 | Criação do formulário real (o Google só informa o `entry.NNN` do campo do código depois de o formulário existir) e o escopo de Formulários, se o kit for criá-lo sozinho | Caio | `montarLinkFormulario` em `src/Respostas.js` | aberta; sem escopo novo por enquanto |
| P3 | Limites do painel: quantos dias de silêncio (hoje 14), quantos "ainda não" seguidos (hoje 2), quantos dias sem retorno marcado (hoje 7) | Nutricionista | `PARAMETROS_PRESENCA` em `src/Presenca.js` | aberta |
| P4 | Como a nota é marcada como lida (senão a mesma nota aparece para sempre) e onde o painel aparece (aba, menu, e-mail semanal) | Caio e nutricionista | `calcularPresenca` em `src/Presenca.js` | aberta |
| P5 | Que pedidos de ajuste o paciente pode fazer (hoje: troca de alimento e outro) e por onde chegam (formulário, WhatsApp). Pedido em texto livre pode ter dado de saúde | Nutricionista e Caio | `TIPOS_AJUSTE` em `src/FilaAjustes.js` | aberta |
| P6 | A tabela de substituições aprovada por ela (D7) e o formato dela. Sem a tabela, todo pedido vai para ela decidir | Nutricionista | `buscarNaTabela` em `src/FilaAjustes.js` | aberta |
