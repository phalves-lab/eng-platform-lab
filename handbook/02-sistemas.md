---
title: Handbook do laboratório, sistemas
type: documento
status: draft
dono: '@phalves-lab/arquitetura'
revisado_em: 2026-03-15
---

# Sistemas do laboratório

## 1. Visão geral

API de solicitações de campanha, esteira de review com IA e painel de métricas.

## 2. Fichas por sistema

### 2.1 Aplicações

### API de solicitações de campanha

- **O que é:** API Fastify com as regras de solicitação, aprovação e rejeição de campanhas.
- **Dono:** time api-owners.
- **Stack e repositórios:** `apps/api`, Node 22, Fastify, Postgres.
- **Integra com:** Postgres.
- **Status:** produção do laboratório.
- **Riscos conhecidos:** aprovação dupla acima de R$ 50 mil depende de regra de domínio.
- **Fontes:** catalog/modules/campaign-requests.yaml

### Painel de review

- **O que é:** app estático com fila de review, Minha fila, alertas e métricas.
- **Dono:** time platform.
- **Stack e repositórios:** `apps/panel`, Vite, React, shadcn/ui.
- **Integra com:** coletor eng-metrics, GitHub Pages.
- **Status:** produção do laboratório.
- **Fontes:** catalog/modules/eng-metrics.yaml

### 2.2 Ferramentas

### Bot de review

- **O que é:** revisa PRs em 3 camadas com verificação adversarial e comenta o sinal.
- **Dono:** time platform.
- **Stack e repositórios:** `tools/review-bot`, Gemini.
- **Integra com:** GitHub, fixtures de tasks e páginas.
- **Status:** produção do laboratório.
- **Riscos conhecidos:** precisão medida no golden set; perde defeitos que dependem do formato de saída de ferramentas.
- **Fontes:** catalog/modules/review-bot.yaml

### Servidor de contexto

- **O que é:** servidor MCP só de leitura que entrega padrões, sistemas, glossário e decisões à IA.
- **Dono:** time platform.
- **Stack e repositórios:** `tools/mcp-context`, SDK MCP.
- **Integra com:** Claude Code, Cursor e qualquer cliente MCP.
- **Status:** piloto.
- **Fontes:** catalog/modules/mcp-context.yaml

### 2.3 Serviços de apoio

### Worker de notificações

- **O que é:** worker fictício que avisa quem pediu a campanha quando a solicitação muda de situação.
- **Dono:** time mensageria.
- **Stack e repositórios:** `lab-demo/notificacoes-worker`, Node 22, fila sintética.
- **Integra com:** API de solicitações de campanha, pelos eventos de `04-eventos.md`.
- **Status:** produção do laboratório.
- **Riscos conhecidos:** aviso duplicado quando o mesmo evento chega duas vezes; o consumo precisa ser idempotente.
- **Fontes:** catalog/dora/repos.yaml

### Worker do portal

- **O que é:** worker de coleta que grava métricas, espelho do Jira, deploys e incidentes no banco do portal.
- **Dono:** time platform.
- **Stack e repositórios:** `apps/portal-worker`, Node 22.
- **Integra com:** GitHub, Jira e os eventos de `04-eventos.md`.
- **Status:** piloto.
- **Fontes:** catalog/modules/portal-worker.yaml

### Portal de engenharia

- **O que é:** portal com Minha página, review, handbook, entregas, projetos e qualidade.
- **Dono:** time platform.
- **Stack e repositórios:** `apps/portal-api`, `apps/portal-web`, NestJS, Next.js.
- **Integra com:** Worker do portal, servidor de contexto e os eventos de `04-eventos.md`.
- **Status:** piloto.
- **Fontes:** catalog/modules/portal.yaml
