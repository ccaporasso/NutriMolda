# Dúvidas para a nutricionista

Perguntas para conversar com ela **antes** de instalar qualquer coisa na conta dela e antes de qualquer dado real. Escritas em linguagem de consultório, sem termo técnico. Cada uma diz por que perguntamos e o que muda no kit.

**Como usar:** o Caio faz as perguntas numa conversa, anota a resposta na última coluna e, se ela pedir, mostra a tela do kit de teste (com dados inventados). Nada aqui pede dado de paciente: as perguntas são sobre a rotina dela.

## A. Agenda

| # | Pergunta | Por que perguntamos | O que muda no kit | Resposta |
|---|---|---|---|---|
| 1 | Como o paciente marca hoje: página de agendamento do Google, WhatsApp, por telefone? | O kit lê a agenda; se a marcação não cair na agenda, não há o que trazer para a planilha | Se for por WhatsApp, ela lança o evento à mão; o kit continua igual | |
| 2 | Como o título do evento aparece? Dá para começar sempre com "Consulta"? | O kit só considera evento cujo título **começa** com um prefixo | Define o `prefixo_evento_consulta` | |
| 3 | O e-mail ou o telefone do paciente aparece no evento (convidado ou descrição)? | É assim que o kit reconhece o paciente. Sem isso, a consulta fica "a identificar" e ela digita o código | Quantas linhas ela terá de completar à mão | |
| 4 | A agenda das consultas é só das consultas, ou mistura compromissos pessoais? | Evento sem o prefixo é ignorado, mas ela precisa saber disso | Confirma o prefixo e o `calendario_id` | |
| 5 | Quando um paciente cancela, ela apaga o evento na agenda? | O kit só marca `cancelada` quando o evento some ou é cancelado **na agenda**. Cancelar só na planilha não vale (dúvida 5 da revisão) | Ajuste no manual ou na regra de reativação | |
| 6 | O paciente costuma remarcar? Como? | Remarcar na agenda muda data e hora na planilha; remarcar por fora, não | Orientação de rotina | |

## B. Valores, cobrança e pagamento

| # | Pergunta | Por que perguntamos | O que muda no kit | Resposta |
|---|---|---|---|---|
| 7 | Quanto cobra pela primeira consulta e pelo retorno? Muda por horário, por presencial ou online, ou por plano? | O kit tem só dois preços. Preço em branco ou zero nunca gera cobrança | Se houver mais de dois preços, é uma nova tarefa | |
| 8 | Ela prefere ver a cobrança **assim que a consulta é marcada** ou só **depois que acontece**? | Hoje a cobrança nasce para consulta marcada, inclusive as de semanas à frente (dúvida 4) | Pode mudar para gerar só a partir do dia da consulta | |
| 9 | Quando o paciente falta, ela cobra? Sempre, nunca, depende? | O kit não decide: ela escolhe entre cobrar ou marcar cortesia | Se houver regra fixa, dá para automatizar depois | |
| 10 | Como recebe: Pix, cartão, dinheiro? Alguma maquininha? | O kit registra Pix, cartão, dinheiro, pacote e cortesia | Outra forma exigiria mudança | |
| 11 | Quem paga é sempre o próprio paciente? Às vezes um responsável ou uma empresa? | O recibo sai em nome de quem pagou, com CPF opcional | Confirma o texto do recibo | |
| 12 | Vende pacotes de consultas? Como ele é pago (à vista, parcelado)? Em que data entra o dinheiro? | A aba Pacotes não guarda data de recebimento, e o relatório hoje **não** inclui a venda do pacote (D21 em aberto) | Pode ser preciso nova coluna e nova regra | |
| 13 | Os valores digitados na configuração: ela se sente à vontade em digitar em **centavos** (R$ 150,00 = 15000)? | Digitar 150 gera cobrança de R$ 1,50 sem aviso (dúvida 1 da revisão) | Pode passar a aceitar reais com vírgula, ou exigir confirmação | |

## C. Pix e recibo

| # | Pergunta | Por que perguntamos | O que muda no kit | Resposta |
|---|---|---|---|---|
| 14 | Qual tipo de chave Pix usa (CPF, e-mail, telefone, aleatória)? Como o nome aparece no app do banco? | O texto do Pix leva a chave, o nome (até 25 letras) e a cidade (até 15) | Ela precisa conferir o nome no app antes de mandar | |
| 15 | Já emite recibo hoje? Tem um modelo? O que o paciente, o plano de saúde ou o contador pedem que conste? | O recibo do kit traz nome e CRN, pagador, valor, data, descrição e CPF opcional | Ajuste do modelo (o texto é editável no Google Docs) | |
| 16 | Precisa de recibo para reembolso de plano de saúde? Ele exige algum texto ou dado específico (por exemplo, CID)? | **Nenhum dado de saúde entra no recibo do kit** | Se exigir, decidir com o advogado antes | |
| 17 | Quer recibo de todo pagamento ou só quando o paciente pede? | O kit gera um recibo por vez, pelo menu | Nenhuma mudança; só orienta a rotina | |
| 18 | O recibo da venda de um pacote: como emite? | O kit não emite recibo de pacote hoje | Nova tarefa, se necessário | |

## D. Contador e carnê-leão

| # | Pergunta | Por que perguntamos | O que muda no kit | Resposta |
|---|---|---|---|---|
| 19 | Ela usa o carnê-leão? O contador pediria o relatório em qual formato (planilha, CSV, PDF)? | O relatório sai em aba e em CSV (`;` e vírgula decimal). **Mostrar um exemplo fictício à contadora** | Ajuste de colunas e de formato | |
| 20 | A contadora precisa do CPF de todo pagador? E de outras informações (data de cada pagamento, forma)? | O relatório junta os recebimentos por pagador, com nome e CPF, e avisa quando falta CPF | Pode incluir uma linha por pagamento | |
| 21 | Ela quer registrar despesas (livro-caixa) na planilha? | A aba Despesas existe, mas nenhum relatório a usa ainda | Nova tarefa, se quiser | |
| 22 | Em que dia do mês fecha os números com o contador? | Define quando rodar o relatório | Pode virar lembrete | |

## E. Rotina, segurança e privacidade

| # | Pergunta | Por que perguntamos | O que muda no kit | Resposta |
|---|---|---|---|---|
| 23 | Mais alguém mexe na agenda ou na planilha (secretária, sócia)? | A planilha e a pasta de recibos têm nome e CPF de quem pagou; só quem precisa pode ver | Regras de compartilhamento | |
| 24 | A conta Google dela tem verificação em duas etapas? Usa o computador sozinha? | É a principal proteção dos dados | Ligar antes de qualquer instalação | |
| 25 | Que e-mail deve receber os avisos de falha? Prefere receber ou só consultar a aba Registro? | O kit avisa por e-mail; cada aviso traz só módulo e horário | Define `email_alertas` | |
| 26 | Ela já tem aviso de privacidade e texto de consentimento para os pacientes? | Exigência da D12 antes de qualquer dado real (revisado por advogado) | Bloqueia o início do piloto até existir | |
| 27 | Os pacientes sabem que os dados de agendamento passam pela ferramenta? Ela concorda com os limites (só planilha e agenda dela, sem servidor, sem IA, sem mensagem automática ao paciente)? | Transparência e consentimento | Texto do aviso | |
| 28 | Quais são hoje a taxa de faltas e a de retornos, mesmo aproximadas? | Para comparar depois do kit (item de `docs/SEGURANCA-LGPD.md`) | Nenhuma; só registro | |

## F. Piloto

| # | Pergunta | Por que perguntamos | O que muda no kit | Resposta |
|---|---|---|---|---|
| 29 | Quantos atendimentos por semana? Em que época há menos movimento para começar? | Define o tamanho do piloto | Escolha da data | |
| 30 | O que seria um "deu certo" para ela depois de um mês (menos digitação, menos falta, recibo rápido)? | Critério de sucesso | Prioridade das próximas tarefas | |
| 31 | Quem ela chama quando algo trava? Qual horário funciona? | Suporte | Manual de suporte e combinação de prazo | |

## Antes do primeiro dado real (lembrete, D12)

- [ ] Resposta do RH por escrito sobre a atividade paralela.
- [ ] Contrato com sigilo, papel de operador, prazo de suporte e obrigação de apagar dados ao final.
- [ ] Aviso de privacidade e consentimento revisados por advogado.
- [ ] Revisão de segurança por uma pessoa desenvolvedora.
- [ ] Roteiro `docs/ROTEIRO-PILOTO.md` concluído na conta de TESTE, com as diferenças decididas.
