# martech-context

Servidor MCP só de leitura sobre o handbook: padrões, sistemas, glossário, decisões pendentes e contratos de evento. Toda resposta cita o arquivo e a seção de origem.

| Ferramenta           | O que devolve                                                 |
| -------------------- | ------------------------------------------------------------- |
| `regras_para_ia`     | Regras curtas que o agente segue em qualquer tarefa de código |
| `padrao`             | Texto completo de um padrão pelo ID                           |
| `buscar_padroes`     | Padrões por termo, área ou status                             |
| `sistema`            | Ficha de um sistema: dono, stack, integrações, riscos         |
| `buscar_sistemas`    | Sistemas que citam um termo                                   |
| `glossario`          | Definição de termo, sigla ou métrica                          |
| `decisoes_pendentes` | Conflitos e lacunas por prioridade                            |
| `buscar`             | Busca livre em todo o handbook                                |
| `quem_consome`       | Quem produz e quem consome um tópico ou evento da fila        |

Lê `handbook/` do repositório por padrão. Para outro handbook, passe a pasta como argumento ou em `MARTECH_HANDBOOK_DIR`.

## Claude Code

```bash
claude mcp add martech-context -- npx tsx <repo>/tools/mcp-context/src/cli.ts
```

## Kiro

Quem abre este repositório no Kiro já recebe o servidor pela configuração do workspace em `.kiro/settings/mcp.json`, com as 9 ferramentas em `autoApprove` (são todas de leitura). O steering em `.kiro/steering/handbook.md` manda o agente chamar `regras_para_ia` no começo da tarefa e citar o ID do padrão.

Para usar em outro repositório, adicione em `~/.kiro/settings/mcp.json` (vale para todos os workspaces) ou em `.kiro/settings/mcp.json` do repositório, com caminho absoluto:

```json
{
  "mcpServers": {
    "martech-context": {
      "command": "npx",
      "args": ["tsx", "<repo>/tools/mcp-context/src/cli.ts"],
      "env": { "MARTECH_HANDBOOK_DIR": "<pasta do handbook>" },
      "autoApprove": [
        "regras_para_ia",
        "padrao",
        "buscar_padroes",
        "sistema",
        "buscar_sistemas",
        "glossario",
        "decisoes_pendentes",
        "buscar",
        "quem_consome"
      ]
    }
  }
}
```

Copie também `.kiro/steering/handbook.md` para `.kiro/steering/` do repositório (ou `~/.kiro/steering/` para todos). Depois de salvar, o Kiro reconecta o servidor sozinho; confira no painel MCP Servers.

## Cursor e outros clientes

O formato `mcpServers` é o mesmo em `.cursor/mcp.json` e na maioria dos clientes MCP via stdio: comando `npx`, argumentos `tsx <repo>/tools/mcp-context/src/cli.ts`.
