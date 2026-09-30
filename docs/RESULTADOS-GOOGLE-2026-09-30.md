# Resultados de validação no Google — 30/09/2026

## Alcance

Kit do Consultório, somente cópia descartável, agendas secundárias e pacientes fictícios. Código base 979b2021609170c7caedeb68ee53d6eacfed1691; correção D32/PR12 em 3ad3b963128bced923eb906a802eb7d77350539d. A revisão local da PR6 terminou sem achados pendentes no escopo conferido. Este registro resume o relatório de auditoria atualizado após a confirmação bancária, mantendo fora do repositório público os IDs da conta Google, a chave Pix e o destinatário pessoal.

Os testes reais validam os cenários abaixo. Não significam liberação de todos os fluxos nem prontidão para pacientes reais.

| Caso | Evidência / resultado |
|---|---|
| Instalação repetida | Sete abas básicas e chaves preservadas, sem duplicação; fuso São Paulo e formatos/listas conferidos nas faixas testadas |
| Configurações / preços | R$ 150,00 e R$ 1.234,56 gravados como 15000 e 123456; nome Pix de 33 caracteres recusado, abreviado para 18 e aceito no reteste |
| Cobranças e pagamento | Duas cobranças sintéticas criadas pelo menu, repetição com zero novas, seleção marcada paga/Pix com data correta |
| Recibos / D32 | Falha de cópia do modelo reproduzida e corrigida mantendo drive.file. PDFs de R$ 150,00 e R$ 1.234,56 inspecionados, links preservados na repetição, rascunhos na lixeira |
| Recibo incompleto / cabeçalho | Ausência de valor recusada sem PDF/link; campos número e valor apenas no cabeçalho preencheram o terceiro PDF de uma página A4 |
| Relatório e CSV | Dois recebimentos consolidados em R$ 1.384,56, acentos/valores conferidos; repetição no mesmo arquivo e aba |
| Gerador / agenda | Recusa inicial sem escrita; seis pacientes e nove eventos fictícios; repetição sem duplicação; recriação apenas do evento próprio apagado |
| Cancelamento e remarcação | Evento cancelado confirmado pelo Calendar; remarcação para março de 2027 atualizou a consulta sem duplicar; consulta cancelada manualmente não foi reaberta |
| Grade e origem | Consultas ampliada de cinco para 512 linhas com formatos/listas; troca entre duas agendas preservou consultas de outras origens, inclusive na repetição |
| Pacotes | Vigente de 15/09 consumido uma vez, antigo preservado; recusa por esgotamento; renovação de 30/09 usada sem reatribuir histórico; contadores finais 0, 1, 1 |
| Cabeçalho alterado | Troca de F1/G1 em Pagamentos recusada antes de escrita; dados/formatos/listas preservados; restauração exata |
| Produção / gatilho | Pacote sem geradores instalado somente na cópia, arquivos/manifesto conferidos; criação de um gatilho horário e repetição sem outro; execução automática com Registro de sucesso |
| Produção / menu | Sincronização interativa executada pelo usuário e conferida no Registro às 15:49:52 de São Paulo; zero novas/atualizadas/canceladas, uma a identificar |
| Alerta real | Falha deliberada de teste registrada e e-mail recebido; Registro e mensagem completa conferidos às 16:39:35. Corpo sem dados de pacientes |
| Pix no banco | Geração confirmada pelo usuário; recebedor e R$ 150,00 confirmados no aplicativo bancário sem concluir o pagamento. Prévia não foi acessada pelo assistente |

## Estado final e origem das evidências

Leitura nativa final: 15 consultas e seis pagamentos com IDs únicos, três pacotes com usadas 0/1/1. PG000001, PG000002 e PG000005 mantêm seus três PDFs; PG000003/PG000004 são pagos de pacote e valor zero; PG000006 é o exemplo Pix a_receber de 15000 centavos, sem data de pagamento ou recibo. O relatório/CSV antigo não foi regenerado após PG000005 e não inclui esse terceiro recibo.

Recebimento do alerta foi confirmado pelo usuário e também conferido diretamente no Gmail e no Registro. A geração e prévia bancária do Pix foram confirmadas pelo usuário. A exclusão do único gatilho foi informada pelo usuário após autorização específica; zero gatilhos não foi conferido novamente no painel.

O pacote de produção instalado tem 131364 caracteres em Principal.gs, SHA-256 62db8b2e619d46fb148438b618fd26d9da694a32d7d3e296da50268b064daf79. Declara calendar.events.readonly. A autorização ampla anterior não foi revogada; a nova tela de consentimento não foi inspecionada. Não afirmar revogação ou aprovação visual de novos consentimentos.

Antes da integração, os oito arquivos da PR12 foram conferidos contra o GitHub por SHA de blob: sem diferenças. Executado novamente: 342 testes selecionados, zero falhas, e empacotamento de 28 módulos JS mais manifesto. O único teste nativo de subprocessos conferir e salvar permanece excluído pelo limite de ambiente previamente documentado; os sete comandos CLI equivalentes haviam passado na revisão anterior. Git diff --check passou. Nenhum teste exploratório novo foi criado para esta consolidação.

## O que falta

1. Interface própria do MVP e conexão com a base Google: D33, UI00–UI03, docs/MVP-INTERFACE-GOOGLE.md.
2. D21: decidir como registrar venda de pacotes no relatório com a contadora. Consumo de consulta com valor zero não comprova a venda do pacote.
3. Conferência real dos casos ainda sem evidência: mesmo nome com CPFs distintos/ausente; preço muito baixo; recusa de chave Pix com pontuação; cortesia; marcar presença/falta; comando na aba errada; limpeza completa do gerador. Falha entre escritas de pagamento/pacote, pacotes inválidos/duplicados e cotas/rede não foram injetados no Google.
4. Rever identidade/permissões para a interface e conferir o estado final dos acessos e gatilhos. A execução funcional não comprova isolamento de contas.
5. Piloto e decisões de operação com nutricionista/contadora; regras P1–P11 da fase 2b permanecem abertas. Os módulos T20–T24 são esqueleto, sem formulário/painel instalado.
6. Editor de planos e portal do paciente ainda não foram implementados neste kit; não atribuir a eles os testes acima.

Caio autorizou expressamente a integração no GitHub em 30/09/2026. Isso permite consolidar o código validado; instalação na cliente e uso de dados reais continuam fora desta rodada. A revisão automática permanece pausada. Cenários aprovados só devem ser repetidos após mudança ou falha relevante.
