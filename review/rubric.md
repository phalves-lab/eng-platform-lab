## Severidade

- **critica:** quebra regra de negócio escrita na task ou na documentação, perde ou corrompe dado, abre falha de segurança (acesso indevido, segredo exposto, injeção) ou derruba o serviço.
- **alta:** comportamento errado em caso de borda provável, migração incompatível com a versão anterior, erro silenciado, condição de corrida em fluxo concorrente.
- **media:** caso de borda improvável sem tratamento, falta de validação em entrada interna, teste que não prova o que diz provar.
- **baixa:** nome confuso, duplicação pequena, mensagem de erro pouco útil.

## O que não é achado

- Preferência de estilo que o lint e o formatter já cobrem.
- Sugestão de refatoração sem bug associado.
- Hipótese sem cenário concreto de falha.

## Regras do repositório que a revisão confere

- Regra de negócio fica no domínio (`apps/api/src/domain`), não na camada HTTP.
- Erro de domínio volta como `Result`, não como exceção.
- Teste que cobre critério de aceite precisa falhar se a regra for removida.
- Migração de banco é compatível com a versão anterior (expandir e contrair).
- Segredo nunca no código, em log ou em prompt.
