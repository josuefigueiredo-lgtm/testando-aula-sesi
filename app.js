// ===== utilidades =====
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fd = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "";
const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const hm = t => String(t).slice(0, 5);
const bt = (a, id, l, cls = "") => `<button class="btn p ${cls}" data-a="${a}" data-id="${id}">${l}</button>`;
const opts = (lista, sel, vazio) => (vazio !== undefined ? `<option value="">${vazio}</option>` : "") +
  lista.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(sel ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("");

async function api(url, metodo = "GET", corpo) {
  const r = await fetch("/api" + url, {
    method: metodo, headers: corpo ? { "Content-Type": "application/json" } : {},
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const j = r.status === 204 ? null : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro || "Não foi possível concluir a operação.");
  return j;
}
let tt;
function toast(m, erro) {
  const t = $("#toast"); t.textContent = m; t.className = erro ? "err" : ""; t.style.display = "block";
  clearTimeout(tt); tt = setTimeout(() => t.style.display = "none", 4500);
}
function acoes(el, mapa) {
  el.onclick = async e => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    try { await mapa[b.dataset.a]?.(+b.dataset.id, b); } catch (x) { toast(x.message, 1); }
  };
}
function tabela(cols, rows, vazio = "Nenhum registro encontrado.") {
  if (!rows.length) return `<p class="vazio">${vazio}</p>`;
  return `<table><thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>${rows.map(r =>
    `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function janela(html) {
  const d = document.createElement("dialog");
  d.innerHTML = `<div class="form">${html}<div class="acoes"><button class="btn sec" data-x>Fechar</button></div></div>`;
  document.body.append(d); d.showModal();
  d.addEventListener("close", () => d.remove());
  $("[data-x]", d).onclick = () => d.close();
  return d;
}
function campo(c, v) {
  const val = v ?? "", at = `name="${c.n}" ${c.req ? "required" : ""}`;
  let i;
  if (c.t === "select") i = `<select ${at}>${opts(c.o, val, c.vazio)}</select>`;
  else if (c.t === "multi") i = `<select name="${c.n}" multiple size="5">${c.o.map(([k, l]) =>
    `<option value="${k}" ${(val || []).includes(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  else i = `<input type="${c.t || "text"}" ${at} value="${esc(val)}" ${c.lo ? `list="dl_${c.n}"` : ""}>` +
    (c.lo ? `<datalist id="dl_${c.n}">${c.lo.map(n => `<option value="${esc(n)}">`).join("")}</datalist>` : "");
  return `<label class="${c.w || ""}">${c.l}${c.req ? " *" : ""}${i}</label>`;
}
function formModal(titulo, campos, vals, salvar) {
  const d = document.createElement("dialog");
  d.innerHTML = `<form class="form"><h3>${titulo}</h3><div class="grid">${campos.map(c => campo(c, vals[c.n])).join("")}</div>
    <p class="erro" hidden></p><div class="acoes"><button type="button" class="btn sec" data-x>Cancelar</button><button class="btn">Salvar</button></div></form>`;
  document.body.append(d); d.showModal();
  d.addEventListener("close", () => d.remove());
  $("[data-x]", d).onclick = () => d.close();
  const f = $("form", d);
  f.onsubmit = async e => {
    e.preventDefault();
    const data = new FormData(f), o = Object.fromEntries(data);
    campos.filter(c => c.t === "multi").forEach(c => o[c.n] = data.getAll(c.n).map(Number));
    try { await salvar(o); d.close(); } catch (x) { const p = $(".erro", d); p.textContent = x.message; p.hidden = false; }
  };
}
async function baixar(id) {
  const r = await fetch(`/api/planos/${id}/docx`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || "Erro ao gerar o documento Word.");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob()); a.download = "roteiro_estudo_semanal.docx"; a.click();
  URL.revokeObjectURL(a.href);
}

// ===== navegação =====
const IC = {
  dashboard: '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>',
  turmas: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4.5a3.5 3.5 0 010 7M18 15c2.5.7 4 2.5 4 6"/>',
  professores: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7"/>',
  horarios: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  planos: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  historico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const ROTAS = {
  dashboard: ["Dashboard", pgDash], turmas: ["Turmas e Alunos", pgTurmas], professores: ["Professores", pgProf],
  horarios: ["Horários e Aulas", pgHor], planos: ["Planos de Aula", pgPlano], historico: ["Histórico de Planos", pgHist]
};
async function rota() {
  const [r, arg] = (location.hash.slice(1) || "dashboard").split("/");
  const rr = ROTAS[r] ? r : "dashboard";
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.r === rr));
  $("#menu").classList.remove("aberto");
  const el = $("#app"); el.innerHTML = ""; el.onclick = el.oninput = el.onchange = null;
  try { await ROTAS[rr][1](el, arg); } catch (e) { el.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
async function carregarUsuarios() {
  const ps = await api("/professores").catch(() => []), sel = $("#usuario"), atual = localStorage.getItem("usuario");
  sel.innerHTML = ps.length ? opts(ps.map(p => [p.id, p.nome]), atual) : "<option>Cadastre um professor</option>";
  if (ps.length && !atual) localStorage.setItem("usuario", sel.value);
  sel.onchange = () => localStorage.setItem("usuario", sel.value);
}
$("#nav").innerHTML = Object.entries(ROTAS).map(([k, [t]]) =>
  `<a href="#${k}" data-r="${k}"><svg viewBox="0 0 24 24">${IC[k]}</svg>${t}</a>`).join("");
$("#burger").onclick = () => $("#menu").classList.toggle("aberto");
addEventListener("hashchange", rota);
carregarUsuarios().then(rota);

// ===== dashboard =====
async function pgDash(el) {
  const d = await api("/dashboard");
  const quando = h => h.em_dias === 0 ? "Hoje" : h.em_dias === 1 ? "Amanhã" : DIAS[h.dia];
  el.innerHTML = `<h2>Dashboard</h2><p class="sub">Visão geral com os dados cadastrados.</p>
  <div class="kpis">${[["Turmas", d.turmas], ["Alunos", d.alunos], ["Professores", d.professores], ["Planos de aula", d.planos]]
      .map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
  <div class="duas"><section class="painel"><h3>Próximas aulas</h3><div class="tab">${tabela([
        ["Quando", h => quando(h)], ["Horário", h => `${hm(h.inicio)}–${hm(h.fim)}`], ["Disciplina", h => esc(h.disciplina)],
        ["Turma", h => esc(h.turma)], ["Professor", h => esc(h.professor)]], d.proximas, "Nenhuma aula cadastrada para turmas ativas.")}</div></section>
  <section class="painel"><h3>Planos recentes</h3><div class="tab">${tabela([
        ["Data", p => fd(p.data_inicio)], ["Disciplina", p => `<a href="#planos/${p.id}">${esc(p.disciplina)}</a>`],
        ["Turma", p => esc(p.turma)], ["Professor", p => esc(p.professor)]], d.recentes, "Nenhum plano elaborado ainda.")}</div></section></div>`;
}

// ===== professores =====
async function pgProf(el) {
  let q = "", foco = false, tm;
  async function draw() {
    const ps = await api("/professores?q=" + encodeURIComponent(q));
    el.innerHTML = `<h2>Professores</h2><p class="sub">Cadastro dos docentes.</p>
    <div class="barra"><label>Pesquisar<input id="q" value="${esc(q)}" placeholder="Nome ou e-mail"></label><span class="gap"></span>
    <button class="btn" data-a="novo">Novo professor</button></div>
    <section class="painel tab">${tabela([["Nome", p => esc(p.nome)], ["E-mail", p => esc(p.email || "—")], ["Área", p => esc(p.area || "—")],
      ["Ações", p => bt("edit", p.id, "Editar", "sec") + bt("del", p.id, "Excluir", "perigo")]], ps, "Nenhum professor encontrado.")}</section>`;
    const i = $("#q"); if (foco) { i.focus(); i.setSelectionRange(99, 99); foco = false; }
    lista = ps;
  }
  let lista = [];
  const form = id => {
    const p = lista.find(x => x.id === id) || {};
    formModal(id ? "Editar professor" : "Novo professor", [
      { n: "nome", l: "Nome", req: 1, w: "full" }, { n: "email", l: "E-mail", t: "email" }, { n: "area", l: "Área / especialidade" }], p,
      async o => { await api(id ? "/professores/" + id : "/professores", id ? "PUT" : "POST", o); toast("Professor salvo."); await carregarUsuarios(); draw(); });
  };
  el.oninput = e => { if (e.target.id === "q") { q = e.target.value; foco = true; clearTimeout(tm); tm = setTimeout(draw, 250); } };
  acoes(el, {
    novo: () => form(null), edit: id => form(id),
    del: async id => { if (!confirm("Excluir este professor?")) return; await api("/professores/" + id, "DELETE"); toast("Professor excluído."); await carregarUsuarios(); draw(); }
  });
  await draw();
}

// ===== turmas e alunos =====
async function pgTurmas(el) {
  let aba = "turmas", q = "", fturma = "", foco = false, tm, ts = [], als = [];
  async function draw() {
    let corpo;
    if (aba === "turmas") {
      ts = await api("/turmas?q=" + encodeURIComponent(q));
      corpo = `<div class="barra"><label>Pesquisar turmas<input id="q" value="${esc(q)}" placeholder="Código, nome ou curso"></label><span class="gap"></span>
      <button class="btn" data-a="nova">Nova turma</button></div><section class="painel tab">${tabela([
        ["Código", t => esc(t.codigo)], ["Turma", t => esc(t.nome)], ["Curso", t => esc(t.curso)], ["Período", t => esc(t.periodo || "—")],
        ["Situação", t => `<span class="badge ${t.situacao === "ativa" ? "" : "off"}">${t.situacao === "ativa" ? "Ativa" : "Inativa"}</span>`],
        ["Alunos", t => t.alunos], ["Professores", t => esc(t.professores || "—")],
        ["Ações", t => bt("det", t.id, "Detalhes") + bt("editt", t.id, "Editar", "sec") +
          bt("sit", t.id, t.situacao === "ativa" ? "Inativar" : "Ativar", "sec") + bt("delt", t.id, "Excluir", "perigo")]], ts, "Nenhuma turma encontrada.")}</section>`;
    } else {
      const todas = await api("/turmas");
      als = await api(`/alunos?q=${encodeURIComponent(q)}&turma_id=${fturma}`);
      corpo = `<div class="barra"><label>Pesquisar alunos<input id="q" value="${esc(q)}" placeholder="Nome ou matrícula"></label>
      <label>Turma<select id="ft">${opts(todas.map(t => [t.id, `${t.codigo} – ${t.nome}`]), fturma, "Todas")}</select></label><span class="gap"></span>
      <button class="btn" data-a="novoa">Novo aluno</button></div><section class="painel tab">${tabela([
        ["Matrícula", a => esc(a.matricula)], ["Nome", a => esc(a.nome)], ["Turma", a => esc(a.turma || "Sem turma")],
        ["Ações", a => bt("edita", a.id, "Editar", "sec") + bt("dela", a.id, "Excluir", "perigo")]], als, "Nenhum aluno encontrado.")}</section>`;
    }
    el.innerHTML = `<h2>Turmas e Alunos</h2><p class="sub">Cadastro centralizado de turmas, alunos e professores responsáveis.</p>
    <div class="abas"><button class="${aba === "turmas" ? "on" : ""}" data-a="aba" data-id="0">Turmas</button>
    <button class="${aba === "alunos" ? "on" : ""}" data-a="aba" data-id="1">Alunos</button></div>${corpo}`;
    const i = $("#q"); if (foco && i) { i.focus(); i.setSelectionRange(99, 99); } foco = false;
  }
  async function formTurma(id) {
    const [ps, t] = await Promise.all([api("/professores"), id ? api("/turmas/" + id) : {}]);
    formModal(id ? "Editar turma" : "Nova turma", [
      { n: "codigo", l: "Código da turma", req: 1 }, { n: "nome", l: "Nome / identificação", req: 1 },
      { n: "curso", l: "Curso", req: 1, w: "full" }, { n: "periodo", l: "Período ou módulo" },
      { n: "situacao", l: "Situação", t: "select", o: [["ativa", "Ativa"], ["inativa", "Inativa"]] },
      { n: "professores", l: "Professores responsáveis (Ctrl/⌘ para vários)", t: "multi", o: ps.map(p => [p.id, p.nome]), w: "full" }],
      { ...t, professores: (t.professores || []).map(p => p.id) },
      async o => { await api(id ? "/turmas/" + id : "/turmas", id ? "PUT" : "POST", o); toast("Turma salva."); draw(); });
  }
  async function formAluno(id, turmaId) {
    const todas = await api("/turmas"), a = id ? als.find(x => x.id === id) : { turma_id: turmaId };
    formModal(id ? "Editar aluno" : "Novo aluno", [
      { n: "matricula", l: "Matrícula", req: 1 }, { n: "nome", l: "Nome do aluno", req: 1 },
      { n: "turma_id", l: "Turma", t: "select", vazio: "Sem turma", o: todas.map(t => [t.id, `${t.codigo} – ${t.nome}`]), w: "full" }], a,
      async o => { await api(id ? "/alunos/" + id : "/alunos", id ? "PUT" : "POST", o); toast("Aluno salvo."); draw(); });
  }
  async function detalhes(id) {
    const t = await api("/turmas/" + id);
    const d = janela(`<h3>${esc(t.codigo)} – ${esc(t.nome)}</h3>
    <p>${esc(t.curso)}${t.periodo ? " · " + esc(t.periodo) : ""} · <span class="badge ${t.situacao === "ativa" ? "" : "off"}">${t.situacao}</span></p>
    <p><b>Professores:</b> ${esc(t.professores.map(p => p.nome).join(", ") || "nenhum vinculado")}</p>
    <div class="barra"><b>Alunos matriculados (${t.alunos.length})</b><span class="gap"></span><button class="btn p" data-n>Novo aluno nesta turma</button></div>
    <div class="tab">${tabela([["Matrícula", a => esc(a.matricula)], ["Nome", a => esc(a.nome)]], t.alunos, "Nenhum aluno vinculado.")}</div>`);
    $("[data-n]", d).onclick = () => { d.close(); formAluno(null, id); };
  }
  el.oninput = e => { if (e.target.id === "q") { q = e.target.value; foco = true; clearTimeout(tm); tm = setTimeout(draw, 250); } };
  el.onchange = e => { if (e.target.id === "ft") { fturma = e.target.value; draw(); } };
  acoes(el, {
    aba: id => { aba = id ? "alunos" : "turmas"; q = ""; fturma = ""; draw(); },
    nova: () => formTurma(null), editt: id => formTurma(id), det: detalhes,
    sit: async id => { const t = ts.find(x => x.id === id); await api(`/turmas/${id}/situacao`, "PATCH", { situacao: t.situacao === "ativa" ? "inativa" : "ativa" }); toast("Situação atualizada."); draw(); },
    delt: async id => { if (!confirm("Excluir esta turma? Os alunos ficarão sem turma.")) return; await api("/turmas/" + id, "DELETE"); toast("Turma excluída."); draw(); },
    novoa: () => formAluno(null, fturma || null), edita: id => formAluno(id),
    dela: async id => { if (!confirm("Excluir este aluno?")) return; await api("/alunos/" + id, "DELETE"); toast("Aluno excluído."); draw(); }
  });
  await draw();
}

// ===== horários e aulas =====
function grade(hs) {
  const mi = t => { const [a, b] = t.split(":"); return +a * 60 + +b; };
  const H0 = Math.min(7, ...hs.map(h => Math.floor(mi(h.inicio) / 60))), H1 = Math.max(22, ...hs.map(h => Math.ceil(mi(h.fim) / 60))), PX = 44;
  const horas = Array.from({ length: H1 - H0 }, (_, i) => `<div>${String(H0 + i).padStart(2, "0")}:00</div>`).join("");
  const cols = DIAS.slice(1).map((d, i) => `<div class="gcol"><div class="gh">${d}</div><div class="gb" style="height:${(H1 - H0) * PX}px">${
    hs.filter(h => h.dia === i + 1).map(h => {
      const a = mi(h.inicio), b = mi(h.fim);
      return `<div class="bloco" data-a="edit" data-id="${h.id}" style="top:${(a - H0 * 60) / 60 * PX}px;height:${(b - a) / 60 * PX - 2}px" title="Clique para editar">
      <b>${esc(h.disciplina)}</b><span>${esc(h.turma)} · ${esc(h.professor)}</span><small>${hm(h.inicio)}–${hm(h.fim)}${h.ambiente ? " · " + esc(h.ambiente) : ""}</small></div>`;
    }).join("")}</div></div>`).join("");
  return `<div class="grade"><div class="gcol gh0"><div class="gh"></div>${horas}</div>${cols}</div>`;
}
async function pgHor(el) {
  const f = { professor_id: "", turma_id: "", disciplina_id: "" };
  let hs = [];
  async function draw() {
    const qs = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&");
    const [h, ps, ts, ds] = await Promise.all([api("/horarios?" + qs), api("/professores"), api("/turmas"), api("/disciplinas")]);
    hs = h;
    const ver = f.professor_id || f.turma_id;
    const nome = [f.professor_id && ps.find(p => p.id == f.professor_id)?.nome, f.turma_id && ts.find(t => t.id == f.turma_id)?.codigo].filter(Boolean).join(" · ");
    el.innerHTML = `<h2>Horários e Aulas</h2><p class="sub">Distribuição das aulas por professor, turma e disciplina. Conflitos são bloqueados ao salvar.</p>
    <div class="barra"><label>Professor<select data-f="professor_id">${opts(ps.map(p => [p.id, p.nome]), f.professor_id, "Todos")}</select></label>
    <label>Turma<select data-f="turma_id">${opts(ts.map(t => [t.id, `${t.codigo} – ${t.nome}`]), f.turma_id, "Todas")}</select></label>
    <label>Disciplina<select data-f="disciplina_id">${opts(ds.map(d => [d.id, d.nome]), f.disciplina_id, "Todas")}</select></label>
    <span class="gap"></span><button class="btn" data-a="novo">Nova aula</button></div>
    <section class="painel"><h3>Grade semanal${nome ? " – " + esc(nome) : ""}</h3>${ver ? grade(h) +
        '<p class="livre">Áreas em branco indicam horários livres. Clique em uma aula para editar.</p>'
        : '<p class="vazio">Selecione um professor ou uma turma para ver a grade semanal.</p>'}</section>
    <section class="painel tab"><h3>Aulas cadastradas</h3>${tabela([
        ["Dia", x => DIAS[x.dia]], ["Horário", x => `${hm(x.inicio)}–${hm(x.fim)}`], ["Carga", x => x.carga_horaria + " h"],
        ["Disciplina", x => esc(x.disciplina)], ["Turma", x => esc(x.turma)], ["Professor", x => esc(x.professor)], ["Ambiente", x => esc(x.ambiente || "—")],
        ["Ações", x => bt("edit", x.id, "Editar", "sec") + bt("del", x.id, "Excluir", "perigo")]], h, "Nenhuma aula cadastrada.")}</section>`;
  }
  async function form(id) {
    const [ps, ts, ds] = await Promise.all([api("/professores"), api("/turmas"), api("/disciplinas")]);
    const h = id ? hs.find(x => x.id === id) : { professor_id: f.professor_id, turma_id: f.turma_id };
    if (!ps.length || !ts.length) throw new Error("Cadastre ao menos um professor e uma turma antes de criar horários.");
    formModal(id ? "Editar aula" : "Nova aula", [
      { n: "professor_id", l: "Professor", t: "select", req: 1, vazio: "Selecione", o: ps.map(p => [p.id, p.nome]) },
      { n: "turma_id", l: "Turma", t: "select", req: 1, vazio: "Selecione", o: ts.filter(t => t.situacao === "ativa" || t.id == h.turma_id).map(t => [t.id, `${t.codigo} – ${t.nome}`]) },
      { n: "disciplina", l: "Disciplina / unidade curricular", req: 1, lo: ds.map(d => d.nome), w: "full" },
      { n: "dia", l: "Dia da semana", t: "select", req: 1, o: DIAS.slice(1).map((d, i) => [i + 1, d]) },
      { n: "ambiente", l: "Ambiente ou laboratório (opcional)" },
      { n: "inicio", l: "Início", t: "time", req: 1 }, { n: "fim", l: "Término", t: "time", req: 1 }],
      { ...h, inicio: h.inicio && hm(h.inicio), fim: h.fim && hm(h.fim) },
      async o => { await api(id ? "/horarios/" + id : "/horarios", id ? "PUT" : "POST", o); toast("Aula salva."); draw(); });
  }
  el.onchange = e => { const k = e.target.dataset.f; if (k) { f[k] = e.target.value; draw(); } };
  acoes(el, {
    novo: () => form(null), edit: form,
    del: async id => { if (!confirm("Excluir esta aula?")) return; await api("/horarios/" + id, "DELETE"); toast("Aula excluída."); draw(); }
  });
  await draw();
}

// ===== planos de aula =====
async function pgPlano(el, id) {
  const [todas, ps, ds, p] = await Promise.all([api("/turmas"), api("/professores"), api("/disciplinas"), id ? api("/planos/" + id) : {}]);
  const ts = todas.filter(t => t.situacao === "ativa" || t.id == p.turma_id);
  if (!ts.length || !ps.length) {
    el.innerHTML = `<h2>Planos de Aula</h2><p class="vazio">Cadastre ao menos uma turma ativa e um professor para elaborar planos. <a href="#turmas">Turmas</a> · <a href="#professores">Professores</a></p>`;
    return;
  }
  const usuario = localStorage.getItem("usuario");
  el.innerHTML = `<h2>${id ? "Editar plano de aula" : "Plano de aula"}</h2>
  <p class="sub">A redação é organizada pela própria aplicação a partir do que você informa, sem serviços externos.</p>
  <div class="plano"><form class="painel" id="fp"><div class="grid">
    <label>Turma *<select name="turma_id" required>${opts(ts.map(t => [t.id, `${t.codigo} – ${t.nome}`]), p.turma_id, "Selecione")}</select></label>
    <label>Professor *<select name="professor_id" required>${opts(ps.map(x => [x.id, x.nome]), p.professor_id || usuario, "Selecione")}</select></label>
    <label>Disciplina / unidade curricular *<input name="disciplina" list="dl" required><datalist id="dl"></datalist></label>
    <label>Curso<input id="curso" readonly placeholder="Preenchido pela turma"></label>
    <label>Data da aula *<input type="date" name="data_inicio" required></label>
    <label>Data final (se for um período)<input type="date" name="data_fim"></label>
    <label class="full">Conteúdo *<textarea name="conteudo" rows="2" required></textarea></label>
    <label class="full">Atividade descrita pelo professor *<textarea name="atividade" rows="3" required></textarea></label>
    <div class="full"><button type="button" class="btn sec" id="red">Organizar redação</button></div>
    <label class="full">Estratégia<textarea name="estrategia" rows="2" placeholder="Preenchida por “Organizar redação” ou ao salvar; pode ser editada"></textarea></label>
    <label class="full">Atividade em sala (texto final)<textarea name="atividade_sala" rows="3"></textarea></label>
  </div><p class="erro" hidden></p>
  <div class="acoes"><button type="button" class="btn sec" id="docx" ${id ? "" : "disabled"}>Baixar Word</button><button class="btn">Salvar plano</button></div></form>
  <section><div class="folha" id="previa"></div></section></div>`;
  const fm = $("#fp"), F = fm.elements;
  for (const k of ["disciplina", "data_inicio", "data_fim", "conteudo", "atividade", "estrategia", "atividade_sala"])
    F[k].value = (p[k] || "").toString().slice(0, k.startsWith("data") ? 10 : 9999);
  const previa = () => {
    const v = Object.fromEntries(new FormData(fm)), t = ts.find(x => x.id == v.turma_id), pr = ps.find(x => x.id == v.professor_id);
    const data = v.data_inicio ? fd(v.data_inicio) + (v.data_fim && v.data_fim !== v.data_inicio ? " a " + fd(v.data_fim) : "") : "—";
    const ou = (s, aviso) => s ? esc(s) : `<i>${aviso}</i>`;
    $("#previa").innerHTML = `<div class="c"><small>Ensino Médio com Itinerário de Formação Técnica e Profissional</small>
    <p><b>${esc(t?.curso || "Curso")}</b><br>Turma ${esc(t?.nome || "—")}</p><h3>Roteiro de Estudo Semanal</h3><b>${data}</b></div>
    <table style="margin-top:12px"><thead><tr><th>Unidade Curricular</th><th>Docente</th><th>Objeto de conhecimento / Conteúdo</th><th>Desenvolvimento das atividades</th></tr></thead>
    <tbody><tr><td>${ou(v.disciplina, "—")}</td><td>${esc(pr?.nome || "—")}</td><td><pre>${ou(v.conteudo, "—")}</pre></td>
    <td><b>Estratégia:</b><br>${ou(v.estrategia, "gerada ao salvar")}<br><br><b>Atividade em sala:</b><br>${ou(v.atividade_sala, "gerada ao salvar")}</td></tr></tbody></table>`;
  };
  async function aoTurma() {
    if (!F.turma_id.value) { $("#curso").value = ""; return previa(); }
    const [t, hs] = await Promise.all([api("/turmas/" + F.turma_id.value), api("/horarios?turma_id=" + F.turma_id.value)]);
    $("#curso").value = t.curso;
    const ids = t.professores.map(x => x.id), atual = F.professor_id.value || p.professor_id || usuario;
    const lista = ids.length && (!atual || ids.includes(+atual)) ? ps.filter(x => ids.includes(x.id)) : ps;
    F.professor_id.innerHTML = opts(lista.map(x => [x.id, x.nome]), atual, "Selecione");
    const nomes = [...new Set(hs.map(h => h.disciplina))];
    $("#dl").innerHTML = (nomes.length ? nomes : ds.map(d => d.nome)).map(n => `<option value="${esc(n)}">`).join("");
    previa();
  }
  F.turma_id.onchange = aoTurma; fm.oninput = previa;
  $("#red").onclick = async () => {
    try {
      const r = await api("/planos/redacao", "POST", { conteudo: F.conteudo.value, atividade: F.atividade.value });
      F.estrategia.value = r.estrategia; F.atividade_sala.value = r.atividade_sala; previa();
    } catch (x) { toast(x.message, 1); }
  };
  $("#docx").onclick = () => baixar(id).catch(x => toast(x.message, 1));
  fm.onsubmit = async e => {
    e.preventDefault();
    const er = $(".erro", fm); er.hidden = true;
    try {
      const r = await api(id ? "/planos/" + id : "/planos", id ? "PUT" : "POST", Object.fromEntries(new FormData(fm)));
      toast("Plano salvo."); const h = "#planos/" + r.id;
      location.hash === h ? rota() : location.hash = h;
    } catch (x) { er.textContent = x.message; er.hidden = false; }
  };
  await aoTurma();
}

// ===== histórico =====
async function pgHist(el) {
  let q = "", ft = "", fp = "", foco = false, tm;
  async function draw() {
    const [pl, ts, ps] = await Promise.all([api(`/planos?q=${encodeURIComponent(q)}&turma_id=${ft}&professor_id=${fp}`), api("/turmas"), api("/professores")]);
    el.innerHTML = `<h2>Histórico de Planos</h2><p class="sub">Planejamentos já elaborados.</p>
    <div class="barra"><label>Pesquisar<input id="q" value="${esc(q)}" placeholder="Conteúdo, disciplina ou turma"></label>
    <label>Turma<select data-f="t">${opts(ts.map(t => [t.id, `${t.codigo} – ${t.nome}`]), ft, "Todas")}</select></label>
    <label>Professor<select data-f="p">${opts(ps.map(x => [x.id, x.nome]), fp, "Todos")}</select></label><span class="gap"></span>
    <a class="btn" href="#planos" style="text-decoration:none">Novo plano</a></div>
    <section class="painel tab">${tabela([["Data", x => fd(x.data_inicio) + (x.data_fim !== x.data_inicio ? " a " + fd(x.data_fim) : "")],
      ["Turma", x => esc(x.turma)], ["Disciplina", x => esc(x.disciplina)], ["Professor", x => esc(x.professor)],
      ["Conteúdo", x => esc(x.conteudo.length > 60 ? x.conteudo.slice(0, 60) + "…" : x.conteudo)],
      ["Ações", x => `<a class="btn p sec" style="text-decoration:none;display:inline-block" href="#planos/${x.id}">Abrir / editar</a>` +
        bt("word", x.id, "Word", "sec") + bt("del", x.id, "Excluir", "perigo")]], pl, "Nenhum plano encontrado.")}</section>`;
    const i = $("#q"); if (foco) { i.focus(); i.setSelectionRange(99, 99); foco = false; }
  }
  el.oninput = e => { if (e.target.id === "q") { q = e.target.value; foco = true; clearTimeout(tm); tm = setTimeout(draw, 250); } };
  el.onchange = e => { const k = e.target.dataset.f; if (k) { k === "t" ? ft = e.target.value : fp = e.target.value; draw(); } };
  acoes(el, {
    word: baixar,
    del: async id => { if (!confirm("Excluir este plano?")) return; await api("/planos/" + id, "DELETE"); toast("Plano excluído."); draw(); }
  });
  await draw();
}
