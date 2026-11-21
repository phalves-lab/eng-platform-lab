---
title: Handbook do laboratório, sistemas
type: documento
status: draft
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
