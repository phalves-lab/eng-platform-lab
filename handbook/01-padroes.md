---
title: Handbook do laboratório, padrões
type: documento
status: draft
dono: '@phalves-lab/platform'
revisado_em: 2026-11-21
---

# Padrões do laboratório

## ENG-GIT: branches e commits

### ENG-GIT-01 · Base e produção

- **Regra:** use `develop` como base de integração e `main` como produção. Mudança entra só por PR na fila de merge.
- **Status:** VIGENTE
- **Por quê:** separar integração de produção e impedir mudança sem checks.
- **Fonte:** policy/rulesets/main.json
- **Na prática hoje:** ruleset bloqueia push direto e exige os checks obrigatórios nas duas branches.

### ENG-GIT-02 · Nome de branch

- **Regra:** nomeie a branch como `<tipo>/LAB-<n>-slug`, com tipo feat, fix, chore, docs ou hotfix e slug de 2 a 4 palavras.
- **Status:** VIGENTE
- **Por quê:** a task da branch liga o PR ao board e ao bot de review.
- **Fonte:** tools/review-bot/src/pr-hygiene.ts
- **Na prática hoje:** o check hygiene reprova branch sem task.

### ENG-GIT-03 · Commits

- **Regra:** use Conventional Commits, com header de até 72 caracteres.
- **Status:** VIGENTE
- **Por quê:** histórico legível e nota de release automática.
- **Fonte:** commitlint.config.js

## ENG-PR: review e merge

### ENG-PR-01 · Template de PR

- **Regra:** preencha o template com task, contexto de negócio, o que mudou, como testar, SQL, ENV e uso de IA.
- **Status:** VIGENTE
- **Por quê:** o revisor e o bot precisam do contexto de negócio.
- **Fonte:** .github/PULL_REQUEST_TEMPLATE.md

### ENG-PR-02 · Review por IA

- **Regra:** o bot de review só comenta e dá um sinal (pronto, pendências ou ajustes); ele nunca aprova nem bloqueia.
- **Status:** VIGENTE
- **Por quê:** quem responde pelo código é o autor, e quem aprova é uma pessoa.
- **Fonte:** review/rubric.md

### ENG-PR-03 · Aprovações humanas

- **Regra:** quantas aprovações cada PR precisa quando houver mais de um revisor no time?
- **Status:** LACUNA
- **Por quê:** o laboratório roda com uma pessoa só.
- **Fonte:** policy/rulesets/main.json

## ENG-QA: testes

### ENG-QA-01 · Cobertura do diff

- **Regra:** pelo menos 70% das linhas alteradas precisam estar cobertas por teste.
- **Status:** VIGENTE
- **Por quê:** cobrar o código novo sem punir o legado.
- **Fonte:** scripts/diff-coverage.mjs

## ENG-SEC: segurança

### ENG-SEC-01 · Segredos

- **Regra:** segredo nunca entra em código, página, log ou prompt; só em secret do GitHub ou variável de ambiente local.
- **Status:** VIGENTE
- **Por quê:** segredo vazado vira incidente.
- **Fonte:** .github/workflows/security.yml
- **Na prática hoje:** trufflehog no CI e push protection ligados.
- **Dono:** @phalves-lab/seguranca
- **Revisado em:** 2026-08-20

### ENG-SEC-02 · Dados confidenciais e IA

- **Regra:** dado confidencial nunca vai para a chave pessoal de IA do laboratório.
- **Status:** VIGENTE
- **Por quê:** a chave do laboratório não tem contrato corporativo.
- **Fonte:** tools/review-bot/src/boundary.ts

## ENG-REPO: configuração do repositório

### ENG-REPO-01 · CI reutilizável

- **Regra:** o CI do repositório chama o workflow reutilizável da esteira (`uses: <dono>/<repo>/.github/workflows/<arquivo>.yml@<ref>` ou `./.github/workflows/<arquivo>.yml`) em vez de copiar os passos.
- **Status:** VIGENTE
- **Por quê:** um gate corrigido num lugar vale para todos os repositórios.
- **Fonte:** .github/workflows/ci.yml

### ENG-REPO-02 · AGENTS.md atualizado

- **Regra:** todo repositório tem `AGENTS.md` na raiz com stack, arquitetura, comandos e o que não fazer, revisado nos últimos 90 dias.
- **Status:** VIGENTE
- **Por quê:** o agente de IA e quem chega ao repositório leem o mesmo contexto.
- **Fonte:** AGENTS.md

### ENG-REPO-03 · Versão do Node

- **Regra:** o `.nvmrc` fixa uma versão LTS aceita em `catalog/scorecard/policy.yaml`.
- **Status:** VIGENTE
- **Por quê:** CI, máquina de dev e produção rodam a mesma versão.
- **Fonte:** .nvmrc

### ENG-REPO-04 · Alertas de dependência e de código

- **Regra:** alertas abertos do Dependabot e do code scanning são tratados; crítico e alto não ficam abertos.
- **Status:** VIGENTE
- **Por quê:** vulnerabilidade conhecida é a mais barata de explorar.
- **Fonte:** .github/dependabot.yml

### ENG-REPO-05 · Release com resumo

- **Regra:** o repositório tem o workflow `release-summary.yml` e os rótulos `release` e `pre-release-notes`.
- **Status:** VIGENTE
- **Por quê:** o portal monta a PR de release e a nota a partir deles.
- **Fonte:** catalog/releases/

## IA: uso de agentes

### IA-01 · Avaliação do bot

- **Regra:** mudança em prompt ou no bot passa pelo golden set, com pontuação mínima de 0,8.
- **Status:** VIGENTE
- **Por quê:** medir precisão antes de publicar.
- **Fonte:** .github/workflows/evals.yml
- **Dono:** @phalves-lab/ia
- **Revisado em:** 2026-04-02

### IA-02 · Modelo do bot

- **Regra:** usar Gemini ou Claude no bot de review?
- **Status:** PROPOSTO
- **Por quê:** comparar precisão e custo no golden set antes de decidir.
- **Fonte:** plano do laboratório
- **Dono:** @phalves-lab/ia

## Para IA

1. Trabalhe em branch `<tipo>/LAB-<n>-slug` e nunca faça push direto em `main` ou `develop` (ENG-GIT-01, ENG-GIT-02).
2. Use Conventional Commits (ENG-GIT-03).
3. Preencha o template de PR com o contexto de negócio (ENG-PR-01).
4. Cubra com teste pelo menos 70% das linhas que alterar (ENG-QA-01).
5. Nunca escreva segredo em código, log, página ou prompt (ENG-SEC-01).
