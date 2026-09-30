# Segurança e LGPD — lista de verificação

## Sempre

- [ ] Só dados inventados no desenvolvimento e nos testes.
- [ ] Nenhum nome de paciente ou dado de saúde em registros, alertas, nomes de arquivo ou commits.
- [ ] Nenhuma chave, senha ou identificador real no repositório.
- [ ] Permissões mínimas, justificadas em `DECISOES.md`.
- [ ] Planilha compartilhada só com quem precisa. Nunca "qualquer pessoa com o link".
- [ ] Verificação em dois fatores na conta Google de teste e na da cliente.

## Onde o kit guarda nome e CPF

- Recibo em PDF e CSV do relatório trazem nome e CPF de quem pagou (necessário para o recibo e para o carnê-leão). Ficam só na pasta do Drive da nutricionista.
- [ ] Pasta de recibos compartilhada só com quem precisa (nunca "qualquer pessoa com o link").
- [ ] Nome dos arquivos só com número do recibo, código do paciente ou mês (o teste automático de recibo e de relatório confere).
- [ ] Registro e e-mails de alerta sem nome, CPF, e-mail nem texto de erro (fixo: módulo e tipo).

## Antes do primeiro dado real

- [ ] Resposta do RH, por escrito, sobre a atividade paralela.
- [ ] Contrato com sigilo, papel de operador de dados, prazo de suporte e obrigação de apagar dados ao final.
- [ ] Aviso de privacidade e textos de consentimento revisados por advogado.
- [ ] Aviso de uso de ferramentas automatizadas e de que não é canal de urgência.
- [ ] Revisão de segurança feita por uma pessoa desenvolvedora.
- [ ] Taxa de faltas e de retornos da nutricionista nos meses anteriores anotada, para comparar depois.

## Papéis

- **A nutricionista** é a controladora dos dados e a responsável clínica.
- **Você** é operador quando acessa dados para dar suporte. Fora disso, não acessa.
