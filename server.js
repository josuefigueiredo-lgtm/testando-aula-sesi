require("dotenv").config();
const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");

const PORT = process.env.PORT || 3000;
const FLASK = process.env.FLASK_API_URL || "http://127.0.0.1:5000";
const DB = process.env.DB_NAME || "assistente_pedagogico";
const conexao = {
  host: process.env.DB_HOST || "localhost",
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || ""
};
const pool = mysql.createPool({
  ...conexao, database: DB, charset: "utf8mb4", dateStrings: true,
  waitForConnections: true, connectionLimit: 10
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- utilidades ----------
class Erro extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const q = (sql, p) => pool.query(sql, p).then(r => r[0]);
const txt = (v, max = 255) => String(v ?? "").trim().slice(0, max);
const need = (o, campos) => {
  const f = Object.keys(campos).filter(c => !txt(o[c], 5000));
  if (f.length) throw new Erro("Preencha: " + f.map(c => campos[c]).join(", ") + ".");
};
const like = v => `%${txt(v)}%`;
const hhmm = t => String(t).slice(0, 5);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dataExtenso = d => { const [a, m, dia] = String(d).slice(0, 10).split("-"); return `${+dia} de ${MESES[m - 1]} de ${a}`; };

// ---------- esquema (CREATE IF NOT EXISTS: preserva dados) ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS professores(
    id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(120) NOT NULL UNIQUE,
    email VARCHAR(120) NULL UNIQUE, area VARCHAR(120) NULL)`,
  `CREATE TABLE IF NOT EXISTS turmas(
    id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(30) NOT NULL UNIQUE,
    nome VARCHAR(80) NOT NULL, curso VARCHAR(120) NOT NULL, periodo VARCHAR(60) NULL,
    situacao ENUM('ativa','inativa') NOT NULL DEFAULT 'ativa')`,
  `CREATE TABLE IF NOT EXISTS turma_professores(
    turma_id INT NOT NULL, professor_id INT NOT NULL, PRIMARY KEY(turma_id, professor_id),
    FOREIGN KEY(turma_id) REFERENCES turmas(id) ON DELETE CASCADE,
    FOREIGN KEY(professor_id) REFERENCES professores(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS alunos(
    id INT AUTO_INCREMENT PRIMARY KEY, matricula VARCHAR(30) NOT NULL UNIQUE,
    nome VARCHAR(120) NOT NULL, turma_id INT NULL,
    FOREIGN KEY(turma_id) REFERENCES turmas(id) ON DELETE SET NULL)`,
  `CREATE TABLE IF NOT EXISTS disciplinas(
    id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(120) NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS horarios(
    id INT AUTO_INCREMENT PRIMARY KEY, professor_id INT NOT NULL, turma_id INT NOT NULL,
    disciplina_id INT NOT NULL, dia TINYINT NOT NULL, inicio TIME NOT NULL, fim TIME NOT NULL,
    ambiente VARCHAR(80) NULL,
    FOREIGN KEY(professor_id) REFERENCES professores(id),
    FOREIGN KEY(turma_id) REFERENCES turmas(id),
    FOREIGN KEY(disciplina_id) REFERENCES disciplinas(id))`,
  `CREATE TABLE IF NOT EXISTS planos(
    id INT AUTO_INCREMENT PRIMARY KEY, turma_id INT NOT NULL, professor_id INT NOT NULL,
    disciplina_id INT NOT NULL, data_inicio DATE NOT NULL, data_fim DATE NOT NULL,
    conteudo TEXT NOT NULL, atividade TEXT NOT NULL, estrategia TEXT NOT NULL,
    atividade_sala TEXT NOT NULL, criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(turma_id) REFERENCES turmas(id),
    FOREIGN KEY(professor_id) REFERENCES professores(id),
    FOREIGN KEY(disciplina_id) REFERENCES disciplinas(id))`
];

async function disciplinaId(nome) {
  const r = await pool.query(
    "INSERT INTO disciplinas(nome) VALUES(?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)", [nome]);
  return r[0].insertId;
}
const achou = (r, msg) => { if (!r.affectedRows) throw new Erro(msg, 404); };

// ---------- professores ----------
const profDados = b => {
  need(b, { nome: "Nome" });
  const email = txt(b.email, 120);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Erro("E-mail inválido.");
  return [txt(b.nome, 120), email || null, txt(b.area, 120) || null];
};
app.get("/api/professores", async (req, res) =>
  res.json(await q("SELECT * FROM professores WHERE nome LIKE ? OR email LIKE ? ORDER BY nome", [like(req.query.q), like(req.query.q)])));
app.post("/api/professores", async (req, res) => {
  const r = await pool.query("INSERT INTO professores(nome,email,area) VALUES(?,?,?)", profDados(req.body));
  res.status(201).json({ id: r[0].insertId });
});
app.put("/api/professores/:id", async (req, res) => {
  achou((await pool.query("UPDATE professores SET nome=?,email=?,area=? WHERE id=?", [...profDados(req.body), req.params.id]))[0], "Professor não encontrado.");
  res.json({ ok: true });
});
app.delete("/api/professores/:id", async (req, res) => {
  achou((await pool.query("DELETE FROM professores WHERE id=?", [req.params.id]))[0], "Professor não encontrado.");
  res.status(204).end();
});

// ---------- turmas ----------
app.get("/api/turmas", async (req, res) => {
  const b = like(req.query.q);
  res.json(await q(`SELECT t.*,
    (SELECT COUNT(*) FROM alunos a WHERE a.turma_id=t.id) alunos,
    (SELECT GROUP_CONCAT(p.nome ORDER BY p.nome SEPARATOR ', ') FROM turma_professores tp
       JOIN professores p ON p.id=tp.professor_id WHERE tp.turma_id=t.id) professores
    FROM turmas t WHERE t.codigo LIKE ? OR t.nome LIKE ? OR t.curso LIKE ?
    ORDER BY t.situacao, t.codigo`, [b, b, b]));
});
app.get("/api/turmas/:id", async (req, res) => {
  const [t] = await q("SELECT * FROM turmas WHERE id=?", [req.params.id]);
  if (!t) throw new Erro("Turma não encontrada.", 404);
  t.alunos = await q("SELECT * FROM alunos WHERE turma_id=? ORDER BY nome", [t.id]);
  t.professores = await q(`SELECT p.id,p.nome FROM turma_professores tp
    JOIN professores p ON p.id=tp.professor_id WHERE tp.turma_id=? ORDER BY p.nome`, [t.id]);
  res.json(t);
});
async function salvarTurma(id, b) {
  need(b, { codigo: "Código", nome: "Nome", curso: "Curso" });
  const v = [txt(b.codigo, 30), txt(b.nome, 80), txt(b.curso, 120), txt(b.periodo, 60) || null, b.situacao === "inativa" ? "inativa" : "ativa"];
  const ids = [...new Set((b.professores || []).map(Number).filter(Boolean))];
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    if (id) achou((await c.query("UPDATE turmas SET codigo=?,nome=?,curso=?,periodo=?,situacao=? WHERE id=?", [...v, id]))[0], "Turma não encontrada.");
    else id = (await c.query("INSERT INTO turmas(codigo,nome,curso,periodo,situacao) VALUES(?,?,?,?,?)", v))[0].insertId;
    await c.query("DELETE FROM turma_professores WHERE turma_id=?", [id]);
    if (ids.length) await c.query("INSERT INTO turma_professores(turma_id,professor_id) VALUES ?", [ids.map(p => [id, p])]);
    await c.commit();
    return id;
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}
app.post("/api/turmas", async (req, res) => res.status(201).json({ id: await salvarTurma(null, req.body) }));
app.put("/api/turmas/:id", async (req, res) => res.json({ id: await salvarTurma(+req.params.id, req.body) }));
app.patch("/api/turmas/:id/situacao", async (req, res) => {
  achou((await pool.query("UPDATE turmas SET situacao=? WHERE id=?", [req.body.situacao === "inativa" ? "inativa" : "ativa", req.params.id]))[0], "Turma não encontrada.");
  res.json({ ok: true });
});
app.delete("/api/turmas/:id", async (req, res) => {
  achou((await pool.query("DELETE FROM turmas WHERE id=?", [req.params.id]))[0], "Turma não encontrada.");
  res.status(204).end();
});

// ---------- alunos ----------
app.get("/api/alunos", async (req, res) => {
  const b = like(req.query.q), p = [b, b];
  let w = "(a.nome LIKE ? OR a.matricula LIKE ?)";
  if (req.query.turma_id) { w += " AND a.turma_id=?"; p.push(req.query.turma_id); }
  res.json(await q(`SELECT a.*,t.codigo turma FROM alunos a LEFT JOIN turmas t ON t.id=a.turma_id WHERE ${w} ORDER BY a.nome`, p));
});
const alunoDados = b => {
  need(b, { matricula: "Matrícula", nome: "Nome" });
  return [txt(b.matricula, 30), txt(b.nome, 120), b.turma_id ? +b.turma_id : null];
};
app.post("/api/alunos", async (req, res) =>
  res.status(201).json({ id: (await pool.query("INSERT INTO alunos(matricula,nome,turma_id) VALUES(?,?,?)", alunoDados(req.body)))[0].insertId }));
app.put("/api/alunos/:id", async (req, res) => {
  achou((await pool.query("UPDATE alunos SET matricula=?,nome=?,turma_id=? WHERE id=?", [...alunoDados(req.body), req.params.id]))[0], "Aluno não encontrado.");
  res.json({ ok: true });
});
app.delete("/api/alunos/:id", async (req, res) => {
  achou((await pool.query("DELETE FROM alunos WHERE id=?", [req.params.id]))[0], "Aluno não encontrado.");
  res.status(204).end();
});

// ---------- disciplinas ----------
app.get("/api/disciplinas", async (req, res) => res.json(await q("SELECT * FROM disciplinas ORDER BY nome")));

// ---------- horários ----------
const HORARIO_SQL = `SELECT h.*, p.nome professor, t.codigo turma, t.nome turma_nome, t.curso, d.nome disciplina,
  ROUND(TIME_TO_SEC(TIMEDIFF(h.fim,h.inicio))/3600,2) carga_horaria
  FROM horarios h JOIN professores p ON p.id=h.professor_id
  JOIN turmas t ON t.id=h.turma_id JOIN disciplinas d ON d.id=h.disciplina_id`;
app.get("/api/horarios", async (req, res) => {
  const w = [], p = [];
  for (const k of ["professor_id", "turma_id", "disciplina_id"])
    if (req.query[k]) { w.push(`h.${k}=?`); p.push(req.query[k]); }
  res.json(await q(`${HORARIO_SQL} ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY h.dia, h.inicio`, p));
});
async function salvarHorario(id, b) {
  need(b, { professor_id: "Professor", turma_id: "Turma", disciplina: "Disciplina", dia: "Dia", inicio: "Início", fim: "Término" });
  const dia = +b.dia, re = /^\d{2}:\d{2}/;
  if (!(dia >= 1 && dia <= 6)) throw new Erro("Dia da semana inválido.");
  if (!re.test(b.inicio) || !re.test(b.fim)) throw new Erro("Horário inválido.");
  const ini = hhmm(b.inicio), fim = hhmm(b.fim);
  if (fim <= ini) throw new Erro("O horário de término deve ser posterior ao de início.");
  const conf = await q(`${HORARIO_SQL} WHERE h.dia=? AND h.inicio<? AND h.fim>?
    AND (h.professor_id=? OR h.turma_id=?) AND h.id<>?`, [dia, fim, ini, b.professor_id, b.turma_id, id || 0]);
  if (conf.length) {
    const c = conf.find(x => x.professor_id == b.professor_id) || conf[0];
    const quem = c.professor_id == b.professor_id ? `O professor ${c.professor}` : `A turma ${c.turma}`;
    throw new Erro(`Conflito de horário: ${quem} já tem aula de ${c.disciplina} (${c.turma}) das ${hhmm(c.inicio)} às ${hhmm(c.fim)}.`, 409);
  }
  const did = await disciplinaId(txt(b.disciplina, 120));
  const v = [b.professor_id, b.turma_id, did, dia, ini, fim, txt(b.ambiente, 80) || null];
  if (id) achou((await pool.query("UPDATE horarios SET professor_id=?,turma_id=?,disciplina_id=?,dia=?,inicio=?,fim=?,ambiente=? WHERE id=?", [...v, id]))[0], "Horário não encontrado.");
  else id = (await pool.query("INSERT INTO horarios(professor_id,turma_id,disciplina_id,dia,inicio,fim,ambiente) VALUES(?,?,?,?,?,?,?)", v))[0].insertId;
  // associa o professor à turma (responsável), sem duplicar
  await pool.query("INSERT IGNORE INTO turma_professores(turma_id,professor_id) VALUES(?,?)", [b.turma_id, b.professor_id]);
  return id;
}
app.post("/api/horarios", async (req, res) => res.status(201).json({ id: await salvarHorario(null, req.body) }));
app.put("/api/horarios/:id", async (req, res) => res.json({ id: await salvarHorario(+req.params.id, req.body) }));
app.delete("/api/horarios/:id", async (req, res) => {
  achou((await pool.query("DELETE FROM horarios WHERE id=?", [req.params.id]))[0], "Horário não encontrado.");
  res.status(204).end();
});

// ---------- planos de aula (sem IA: redação por regras) ----------
function redigir(conteudo, atividade) {
  const frase = s => {
    s = txt(s, 3000).replace(/\s+/g, " ");
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return /[.!?]$/.test(s) ? s : s + ".";
  };
  const pratica = /\b(cri|desenvolv|prat|exerc|constru|implement|aplic|elabor|monta|program)/i.test(atividade);
  const c = txt(conteudo, 300).replace(/[.\s]+$/, "");
  return {
    estrategia: `Aula expositiva e dialogada sobre ${c}${pratica ? ", com aplicação prática dos conceitos" : ""}.`,
    atividade_sala: frase(atividade)
  };
}
app.post("/api/planos/redacao", (req, res) => {
  need(req.body, { conteudo: "Conteúdo", atividade: "Atividade" });
  res.json(redigir(req.body.conteudo, req.body.atividade));
});
const PLANO_SQL = `SELECT pl.*, t.codigo turma, t.nome turma_nome, t.curso, p.nome professor, d.nome disciplina
  FROM planos pl JOIN turmas t ON t.id=pl.turma_id JOIN professores p ON p.id=pl.professor_id
  JOIN disciplinas d ON d.id=pl.disciplina_id`;
app.get("/api/planos", async (req, res) => {
  const w = ["(pl.conteudo LIKE ? OR d.nome LIKE ? OR t.codigo LIKE ? OR t.nome LIKE ?)"], b = like(req.query.q), p = [b, b, b, b];
  for (const k of ["turma_id", "professor_id"]) if (req.query[k]) { w.push(`pl.${k}=?`); p.push(req.query[k]); }
  res.json(await q(`${PLANO_SQL} WHERE ${w.join(" AND ")} ORDER BY pl.data_inicio DESC, pl.id DESC`, p));
});
app.get("/api/planos/:id", async (req, res) => {
  const [p] = await q(`${PLANO_SQL} WHERE pl.id=?`, [req.params.id]);
  if (!p) throw new Erro("Plano não encontrado.", 404);
  res.json(p);
});
async function salvarPlano(id, b) {
  need(b, { turma_id: "Turma", professor_id: "Professor", disciplina: "Disciplina", data_inicio: "Data da aula", conteudo: "Conteúdo", atividade: "Atividade" });
  const ini = txt(b.data_inicio, 10), fim = txt(b.data_fim, 10) || ini;
  if (fim < ini) throw new Erro("A data final não pode ser anterior à data inicial.");
  const r = redigir(b.conteudo, b.atividade);
  const did = await disciplinaId(txt(b.disciplina, 120));
  const v = [b.turma_id, b.professor_id, did, ini, fim, txt(b.conteudo, 5000), txt(b.atividade, 5000),
    txt(b.estrategia, 5000) || r.estrategia, txt(b.atividade_sala, 5000) || r.atividade_sala];
  if (id) achou((await pool.query(`UPDATE planos SET turma_id=?,professor_id=?,disciplina_id=?,data_inicio=?,data_fim=?,
    conteudo=?,atividade=?,estrategia=?,atividade_sala=? WHERE id=?`, [...v, id]))[0], "Plano não encontrado.");
  else id = (await pool.query(`INSERT INTO planos(turma_id,professor_id,disciplina_id,data_inicio,data_fim,
    conteudo,atividade,estrategia,atividade_sala) VALUES(?,?,?,?,?,?,?,?,?)`, v))[0].insertId;
  return id;
}
app.post("/api/planos", async (req, res) => res.status(201).json({ id: await salvarPlano(null, req.body) }));
app.put("/api/planos/:id", async (req, res) => res.json({ id: await salvarPlano(+req.params.id, req.body) }));
app.delete("/api/planos/:id", async (req, res) => {
  achou((await pool.query("DELETE FROM planos WHERE id=?", [req.params.id]))[0], "Plano não encontrado.");
  res.status(204).end();
});
// Mantém o contrato original com a API Flask (docxtpl + modelo Word)
app.get("/api/planos/:id/docx", async (req, res) => {
  const [p] = await q(`${PLANO_SQL} WHERE pl.id=?`, [req.params.id]);
  if (!p) throw new Erro("Plano não encontrado.", 404);
  const ini = dataExtenso(p.data_inicio), fim = dataExtenso(p.data_fim);
  let r;
  try {
    r = await fetch(`${FLASK}/gerar-pdf`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: ini === fim ? ini : `${ini} até ${fim}`,
        unidade_curricular: p.disciplina, docente: p.professor, curso: p.curso, turma: p.turma_nome,
        conteudo: p.conteudo,
        desenvolvimento: `Estratégia: ${p.estrategia}\n\nAtividade em sala: ${p.atividade_sala}`
      })
    });
  } catch { throw new Erro("Não foi possível conectar à API do Word (Flask). Verifique se ela está em execução.", 502); }
  if (!r.ok) throw new Erro("A API do Word retornou erro ao gerar o documento.", 502);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", 'attachment; filename="roteiro_estudo_semanal.docx"');
  res.send(Buffer.from(await r.arrayBuffer()));
});

// ---------- dashboard ----------
app.get("/api/dashboard", async (req, res) => {
  const [c] = await q(`SELECT (SELECT COUNT(*) FROM turmas) turmas,
    (SELECT COUNT(*) FROM turmas WHERE situacao='ativa') turmas_ativas,
    (SELECT COUNT(*) FROM alunos) alunos, (SELECT COUNT(*) FROM professores) professores,
    (SELECT COUNT(*) FROM planos) planos`);
  const hs = await q(`${HORARIO_SQL} WHERE t.situacao='ativa'`);
  const agora = new Date(), min = agora.getHours() * 60 + agora.getMinutes(), hoje = agora.getDay();
  const proximas = hs.map(h => {
    const [a, b] = h.inicio.split(":"), m = +a * 60 + +b;
    let d = (h.dia - hoje + 7) % 7;
    if (d === 0 && m <= min) d = 7;
    return { ...h, em_dias: d, _o: d * 1440 + m };
  }).sort((a, b) => a._o - b._o).slice(0, 6);
  const recentes = await q(`${PLANO_SQL} ORDER BY pl.criado_em DESC, pl.id DESC LIMIT 5`);
  res.json({ ...c, proximas, recentes });
});

// ---------- erros ----------
app.use((e, req, res, next) => {
  let s = e.status || 500, m = e.message;
  if (e.code === "ER_DUP_ENTRY") { s = 409; m = "Já existe um registro com esses dados (valor duplicado)."; }
  else if (e.code === "ER_ROW_IS_REFERENCED_2") { s = 409; m = "Não é possível excluir: existem registros vinculados (horários, planos). Para turmas, prefira inativar."; }
  else if (e.code === "ER_NO_REFERENCED_ROW_2") { s = 400; m = "Registro relacionado inexistente."; }
  else if (!e.status) { console.error(e); m = "Erro interno do servidor."; }
  res.status(s).json({ erro: m });
});

// ---------- inicialização ----------
(async () => {
  const c = await mysql.createConnection(conexao);
  await c.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.end();
  for (const s of SCHEMA) await pool.query(s);
  app.listen(PORT, () => console.log(`Assistente Pedagógico em http://localhost:${PORT}`));
})().catch(e => { console.error("Falha ao iniciar (verifique o MySQL e o .env):", e.message); process.exit(1); });
