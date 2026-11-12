# Assistente Pedagógico – SENAI (v2)

## Como rodar
1. Tenha o MySQL em execução e copie `.env.example` para `.env` (ajuste DB_USER / DB_PASSWORD). Remova `OPENAI_API_KEY` do seu `.env` antigo.
2. `npm install` (o `openai`, o `pdf-parse` e o `cors` foram removidos; entrou `mysql2`).
3. `node server.js` – o banco e as tabelas são criados automaticamente (`CREATE ... IF NOT EXISTS`, dados existentes são preservados).
4. A API Flask continua igual: `py pdf_api\main.py` (necessária só para "Baixar Word").

Acesse http://localhost:3000

## Estrutura
- `server.js` – API REST (professores, turmas, alunos, disciplinas, horários, planos, dashboard) + contrato com o Flask inalterado.
- `public/` – `index.html`, `style.css`, `app.js` (páginas: Dashboard, Turmas e Alunos, Professores, Horários e Aulas, Planos de Aula, Histórico).

## Banco (relacionamentos)
turmas 1—N alunos · turmas N—N professores (turma_professores) · horarios → professor, turma, disciplina · planos → turma, professor, disciplina.
Códigos de turma, matrículas, nomes/e-mails de professores e disciplinas são únicos.

## Regras
- Conflito de horário: bloqueia professor ou turma com aulas sobrepostas no mesmo dia.
- Redação do plano: regras na própria aplicação (organiza o texto do professor, sem inventar conteúdo); o texto pode ser editado antes de salvar.
