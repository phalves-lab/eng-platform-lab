# portal-worker

Worker de coleta do portal de engenharia. Cada coletor implementa `Collector` (`name`, `schedule`, `run(ctx)`) e o `Scheduler` roda todos no boot e a cada intervalo, sem sobrepor execuções do mesmo coletor. O log sai em JSON, uma linha por evento. As migrations de `packages/database` são aplicadas no boot.

## Observabilidade e imagem

Cada execução de coletor roda dentro de um span `collector.run` e alimenta as métricas `portal_worker.collector.runs` e `portal_worker.collector.duration` (por coletor e status). A exportação OTLP só liga com `OTEL_ENABLED=true` e `OTEL_EXPORTER_OTLP_ENDPOINT`. Compilado (`npm run build -w @lab/portal-worker`), o worker sobe com `npm start -w @lab/portal-worker`. Com `WORKER_HEARTBEAT_FILE`, o worker reescreve o arquivo a cada 30 s e `node dist/healthcheck.js` sai com 0 enquanto ele tiver menos de 90 s, que é o healthcheck da imagem (`apps/portal-worker/Dockerfile`).

## Coletores

| Coletor       | O que faz                                                                               | Liga com                                |
| ------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| `eng-metrics` | Calcula a fila de review e as métricas do `tools/eng-metrics` e grava o snapshot do dia | sempre                                  |
| `jira`        | Espelha issues, transições de status, sprints e épicos do Jira no Postgres              | `WORKER_JIRA_SOURCE=fixture` ou `cloud` |

## Coletor do Jira

O coletor fala com o Jira só por leitura e grava com upsert idempotente pelo `JiraRepository`: rodar duas vezes não duplica nada. Nenhum caminho de código escreve no Jira.

- **Adaptador fixture** (`fixture`): lê `fixtures/jira-board/*.json`, um arquivo por projeto fictício (`LAB` e `OPS`, dois componentes cada, 10 semanas de histórico com bloqueios e itens envelhecendo). As datas andam em semanas inteiras até a semana atual, então o board continua vivo sem editar o arquivo.
- **Adaptador Jira Cloud** (`cloud`): REST v3 `POST /rest/api/3/search/jql` com `expand=changelog` e paginação por `nextPageToken`, changelog extra por `GET /rest/api/3/issue/{key}/changelog` quando a busca corta o histórico, e sprints pela agile API (`GET /rest/agile/1.0/board/{id}/sprint`). O cliente HTTP só expõe `GET` e a busca, autentica por e-mail e token e respeita `Retry-After` em 429 e 503 (até 3 tentativas, espera máxima de 60 s).
- **Workflow**: o mapa de status para categoria (a fazer, em andamento, em review, bloqueado, concluído) fica em `catalog/jira/workflow.yaml`, com status extras por projeto. O status cru é gravado como veio; a categoria é aplicada na leitura, então mudar o YAML não exige coletar de novo. Status sem categoria aparece no log como `jira.unmapped_statuses`.

### Rodar uma vez com o adaptador fixture

```bash
docker compose up -d
DATABASE_URL=postgres://lab:lab@localhost:5433/lab npm run collect:jira -w @lab/portal-worker
```

O comando aplica as migrations, roda o coletor uma vez e sai com código 1 se a coleta falhar. Para ligar o coletor no worker agendado, defina `WORKER_JIRA_SOURCE` junto das demais variáveis.

### Variáveis

| Variável                                                   | Padrão                                | Uso                                                      |
| ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| `WORKER_JIRA_SOURCE`                                       | `off` no worker, `fixture` no comando | `off`, `fixture` ou `cloud`                              |
| `WORKER_JIRA_FIXTURES_DIR`                                 | `fixtures/jira-board`                 | Pasta das fixtures do adaptador fixture                  |
| `WORKER_JIRA_WORKFLOW`                                     | `catalog/jira/workflow.yaml`          | Mapa de status para categoria                            |
| `WORKER_JIRA_PROJECTS`                                     | vazio                                 | Chaves dos projetos no Jira Cloud, separadas por vírgula |
| `WORKER_JIRA_BOARDS`                                       | vazio                                 | Boards de onde vêm as sprints, como `LAB=12,OPS=34`      |
| `WORKER_JIRA_SPRINT_FIELD`                                 | `customfield_10020`                   | Campo de sprint da instância                             |
| `WORKER_JIRA_LOOKBACK_DAYS`                                | `120`                                 | Janela de issues atualizadas (épicos entram sempre)      |
| `ATLASSIAN_SITE`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` | vazio                                 | Credenciais só de leitura do adaptador `cloud`           |
