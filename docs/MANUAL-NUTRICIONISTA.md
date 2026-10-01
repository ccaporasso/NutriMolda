# Manual do Kit do Consultório (para a nutricionista)

> **Versão de teste.** Este manual descreve o que o kit faz hoje. Enquanto o Caio não instalar na sua conta e os testes não terminarem, nada aqui vale para o seu consultório de verdade.

## Para que serve

O kit fica dentro da **sua** planilha do Google. Ele:

1. traz as consultas da sua agenda para a planilha;
2. cria o valor a receber de cada consulta;
3. ajuda a marcar quem pagou, gerar o Pix e o recibo em PDF;
4. monta o relatório do mês para o contador (carnê-leão).

O kit **não** manda mensagem a paciente, não usa inteligência artificial e não guarda nada fora da sua conta Google.

## Antes de começar (uma vez só)

O Caio faz a instalação com você. Depois, na aba **Configurações**, preencha a coluna `valor` de cada linha:

| Linha | O que colocar | Exemplo |
|---|---|---|
| `nome_profissional` | Seu nome, como sai no recibo | Dra. Fulana de Tal |
| `crn` | Seu número no CRN | CRN-3 12345 |
| `valor_primeira_consulta_centavos` | Preço da primeira consulta. **Prefira o menu Configuração > Definir preços das consultas (em reais)**: você digita 150,00 e o kit grava 15000 (centavos) | R$ 150,00 → `15000` |
| `valor_retorno_centavos` | Preço do retorno (mesmo menu) | R$ 100,00 → `10000` |
| `chave_pix` | Sua chave Pix, exatamente como no banco: e-mail; CPF ou CNPJ só com números; telefone com +55 e DDD, sem espaços (+5511900000000); ou a chave aleatória | |
| `nome_recebedor_pix` | Seu nome como no banco, até 25 letras | |
| `cidade_recebedor_pix` | Sua cidade, até 15 letras | |
| `email_alertas` | E-mail que recebe os avisos de falha | |
| `calendario_id` | `primary` (agenda principal) ou o ID da agenda usada | `primary` |
| `prefixo_evento_consulta` | Início do título dos eventos de consulta | `Consulta` |

Se esquecer algo, o kit avisa qual linha falta. **Preço em branco ou zero nunca gera cobrança**: consulta gratuita você marca como cortesia.

Para os recibos: no menu **Kit do Consultório → Configuração → Criar modelo e pasta de recibos**. O kit cria o modelo do recibo (um documento que você pode editar) e uma pasta no seu Drive. Mantenha no modelo os campos entre `{{ }}`.

Para a sincronização automática: **Configuração → Ativar sincronização automática** (a cada hora). Faça uma vez.

## Dia a dia

### 1. Trazer a agenda
Menu **Sincronizar agenda**. As consultas aparecem na aba **Consultas**. Pode clicar quantas vezes quiser: não duplica.

- Só entram eventos cujo título **começa** com o prefixo (por exemplo, "Consulta — Ana S.").
- Se uma consulta ficar com `codigo_paciente` **em branco**, o kit não achou o paciente pelo e-mail ou telefone. Cadastre o paciente na aba **Pacientes** (com o mesmo e-mail ou telefone da marcação) e sincronize de novo, ou digite o código (P0001…) na linha.
- Consulta apagada ou cancelada na agenda vira `cancelada`. Para cancelar de vez, apague o evento na agenda: mudar o status só na planilha não desmarca o evento, e o kit avisa. Uma consulta `cancelada` nunca volta sozinha para `marcada`; se o evento voltou e você quer cobrar, mude o status à mão.
- Se o paciente foi identificado depois (você cadastrou o e-mail ou digitou o código), o kit ajusta o tipo para `retorno` quando já há consulta anterior. "Gerar valores a receber" pergunta antes de cobrar como `primeira` quem já tem consulta anterior: responda **Sim** se for mesmo primeira consulta (por exemplo, o paciente faltou na primeira ou voltou depois de muito tempo); **Não** deixa sem cobrança, e você troca o `tipo` para `retorno` e gera de novo.

### 2. Gerar os valores a receber
Menu **Gerar valores a receber**. Cada consulta marcada ou realizada ganha uma linha em **Pagamentos** com o status `a_receber`.

### 3. Registrar o pagamento
Na aba **Pagamentos**, clique na linha (ou arraste para várias) e use **Pagamento**:

- **Marcar como pago (Pix)**, **Marcar como pago (cartão)** e **Marcar como pago (dinheiro):** gravam a forma e a data de hoje.
- **Marcar como cortesia:** valor zero, sem cobrança (o kit pede confirmação).
- **Marcar como consulta de pacote:** gasta uma consulta do pacote **mais recente** do paciente (aba **Pacotes**). Sempre preencha o `inicio` (AAAA-MM-DD, uma data real). Para renovar, acrescente uma linha nova com o `inicio` de hoje ou posterior; não apague nem mude a linha do pacote antigo, e não deixe dois pacotes do mesmo paciente com o mesmo início.

Se o paciente faltou: na aba **Consultas**, clique na linha e use **Consulta → Marcar como faltou**. O kit não cobra nem perdoa sozinho: você decide em Pagamentos.

### 4. Pix copia e cola
Clique na linha a receber e use **Gerar Pix copia e cola**. Copie o texto e mande ao paciente. **Na primeira vez**, confira no aplicativo do seu banco (sem pagar) se o valor e o seu nome aparecem certos.

### 5. Recibo em PDF
Depois de marcar como pago, preencha na linha de Pagamentos:

- `pagador_nome`: quem pagou (nome completo);
- `pagador_cpf`: opcional; se preencher, confira os 11 números;
- `data_pagamento` já vem preenchida (formato AAAA-MM-DD).

Clique na linha e use **Gerar recibo em PDF**. O PDF vai para a pasta de recibos e o link aparece na coluna `link_recibo`. Recibo já feito não é feito de novo: se você apagar só o link e o PDF antigo continuar na pasta, o kit **religa** o PDF antigo em vez de criar outro. Para gerar um recibo novo do mesmo pagamento (por exemplo, para corrigir o nome), mande o PDF antigo para a lixeira do Drive **e** apague o link em `link_recibo`. Se aparecer o aviso de que já existem dois PDFs do mesmo pagamento, deixe só um na pasta e tente de novo; o kit nunca cria um terceiro. Se aparecer o aviso de que o kit "não consegue confirmar" que o PDF da pasta mostra o mesmo valor, data e forma de pagamento, abra o PDF: se ele não vale mais (por exemplo, o pagamento foi apagado e refeito, ou o valor foi corrigido), mande-o para a lixeira e gere de novo; se vale, cole o link dele na coluna `link_recibo`. O kit prefere parar a ligar o recibo errado.

### 6. Relatório do mês
Menu **Relatório do mês (aba e CSV)**. Digite o mês (`2026-09`) ou deixe em branco para o mês atual. O kit cria a aba "Relatório AAAA-MM" e o arquivo `Relatorio-AAAA-MM.csv` na pasta de recibos, para mandar ao contador. Confira o total antes de enviar. Se aparecer aviso de "sem CPF", é porque falta o CPF de algum pagador.

## Cuidados

- Compartilhe a planilha e a pasta de recibos **só com quem precisa**. Nunca "qualquer pessoa com o link".
- Não escreva dados de saúde nas colunas do kit. Use só o código do paciente (P0001).
- Não apague nem renomeie os cabeçalhos da primeira linha de cada aba (o Google avisa antes de deixar editar).
- O relatório e o recibo têm nome e CPF de quem pagou: trate como dado pessoal.

## Se algo der errado

Toda falha é registrada na aba **Registro** e enviada por e-mail para `email_alertas`. Veja a lista abaixo; se não resolver, mande ao Caio a **data e hora** e o que você estava fazendo (**sem** nome de paciente).

| O que aconteceu | O que fazer |
|---|---|
| "Há problemas na aba Configurações" | Leia a lista na tela: cada linha diz qual chave preencher. Corrija e tente de novo. |
| Consultas não aparecem ou vieram poucas | Confira se o título do evento começa com o prefixo e se o `calendario_id` está certo. Sincronize de novo. |
| Consulta sem `codigo_paciente` | Cadastre o paciente com o e-mail ou telefone da marcação, ou digite o código na linha. |
| Não gera cobrança | Preço em branco ou zero em Configurações (em centavos: R$ 150,00 = `15000`), ou consulta sem paciente. |
| Recibo não sai | A mensagem diz o que falta: `pagador_nome`, `data_pagamento`, CPF inválido, pagamento ainda não pago, ou modelo sem os campos `{{ }}`. |
