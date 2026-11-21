---
title: Handbook do laboratório, contratos de evento
type: documento
status: draft
dono: '@phalves-lab/arquitetura'
revisado_em: 2026-11-10
---

# Contratos de evento

Quem produz e quem consome cada tópico da fila sintética do laboratório. O nome do produtor e de cada consumidor é o nome da ficha em `02-sistemas.md`; consumidores vêm separados por vírgula. Evento novo ou consumidor novo entra nesta tabela no mesmo PR que muda o código.

## Tópicos e eventos

| Tópico                 | Evento                | Produtor                        | Consumidores                                      | O que carrega                                       |
| ---------------------- | --------------------- | ------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| campanhas.solicitacoes | solicitacao.criada    | API de solicitações de campanha | Worker de notificações                            | id da solicitação, BU, valor e quem pediu           |
| campanhas.solicitacoes | solicitacao.aprovada  | API de solicitações de campanha | Worker de notificações, Worker do portal          | id da solicitação, aprovadores e data da aprovação  |
| campanhas.solicitacoes | solicitacao.rejeitada | API de solicitações de campanha | Worker de notificações                            | id da solicitação e motivo da rejeição              |
| notificacoes.envios    | envio.falhou          | Worker de notificações          | API de solicitações de campanha, Worker do portal | id da solicitação, canal e quantidade de tentativas |
| portal.coletas         | coleta.concluida      | Worker do portal                | Portal de engenharia                              | coletor, conjunto de dados e horário da coleta      |

## Regras dos contratos

- Campo novo em evento é opcional para quem consome; remover ou renomear campo exige versão nova do evento.
- Todo consumidor trata evento repetido sem efeito duplicado.
- Consumidor que não for uma ficha de sistema aparece como nome solto, sem link.
