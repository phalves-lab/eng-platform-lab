---
inclusion: always
---

# Handbook do time

Os padrões, sistemas, glossário e decisões do time ficam no handbook e chegam pelo servidor MCP `martech-context`.

- No começo de toda tarefa de código, chame `regras_para_ia` e siga as regras que voltarem.
- Antes de decidir nome de branch, commit, PR, teste ou segurança, consulte o padrão com `buscar_padroes` ou `padrao` e cite o ID (ex.: ENG-GIT-02) na explicação.
- Para saber o que um sistema faz, quem é dono e com o que integra, use `sistema` ou `buscar_sistemas`.
- Antes de mudar um evento da fila, use `quem_consome` para saber quem produz e quem consome o tópico.
- Sigla ou termo de negócio desconhecido: `glossario` antes de supor o significado.
- Se o padrão estiver como CONFLITO, LACUNA ou PROPOSTO, diga isso e não trate como regra fechada; `decisoes_pendentes` mostra o que o time ainda vai decidir.
- Toda afirmação sobre padrão ou sistema cita a fonte que a ferramenta devolveu.
