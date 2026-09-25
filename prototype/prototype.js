/* PROTOTYPE — throwaway. Three variants of HQ Crion screens via ?variant= */

const AGENTES = [
  { id: "affix-0800", admin: "Affix", nome: "Clara Affix 0800" },
  { id: "affix-wa", admin: "Affix", nome: "Clara Affix WhatsApp" },
  { id: "alter-1", admin: "Alter", nome: "Clara Alter" },
  { id: "conecta-1", admin: "Conectaplan", nome: "Clara Conectaplan" }
];

const ATENDIMENTOS = [
  { id: "a1", admin: "Affix", agente: "Clara Affix 0800", agenteId: "affix-0800", quando: "11/09 09:12", motivo: "Rede credenciada", nota: 8.5, status: "Concluído", curadoria: false, custo: "R$ 1,42" },
  { id: "a2", admin: "Alter", agente: "Clara Alter", agenteId: "alter-1", quando: "11/09 10:03", motivo: "Boleto", nota: 6.0, status: "Concluído", curadoria: true, custo: "R$ 0,98" },
  { id: "a3", admin: "Conectaplan", agente: "Clara Conectaplan", agenteId: "conecta-1", quando: "11/09 11:40", motivo: "Não informado", nota: 9.0, status: "Concluído", curadoria: false, custo: "R$ 1,10" },
  { id: "a4", admin: "Affix", agente: "Clara Affix WhatsApp", agenteId: "affix-wa", quando: "11/09 12:15", motivo: "Carência", nota: 7.5, status: "Em andamento", curadoria: false, custo: "R$ 0,40" }
];

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  atendimentos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  vivo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 5v2M12 17v2M5 12H3M21 12h-2"/></svg>',
  fila: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  minhas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  manutencao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 7l3 3-8 8H6v-3l8-8z"/></svg>',
  usuarios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1"/><circle cx="17" cy="9" r="2"/><path d="M21 20v-1a4 4 0 0 0-3-3.87"/></svg>',
  ia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg>',
  regua: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20L20 4"/><path d="M9 20h.01M13 16h.01M17 12h.01"/></svg>'
};

const AREAS = {
  gestao: [
    ["dashboard", "Dashboard", "dashboard"],
    ["atendimentos", "Atendimentos", "atendimentos"],
    ["monitoramento", "Ao vivo", "vivo"],
    ["fila", "Fila de curadoria", "fila"],
    ["realizadas", "Curadorias realizadas", "minhas"],
    ["regua", "Régua", "regua"]
  ],
  curador: [
    ["atendimentos", "Atendimentos", "atendimentos"],
    ["monitoramento", "Ao vivo", "vivo"],
    ["fila", "Fila de curadoria", "fila"],
    ["minhas", "Minhas curadorias", "minhas"],
    ["regua", "Régua", "regua"]
  ],
  admin: [
    ["dashboard", "Dashboard", "dashboard"],
    ["atendimentos", "Atendimentos", "atendimentos"],
    ["monitoramento", "Ao vivo", "vivo"],
    ["fila", "Fila de curadoria", "fila"],
    ["realizadas", "Curadorias realizadas", "minhas"],
    ["manutencao", "Manutenção", "manutencao"],
    ["usuarios", "Usuários", "usuarios"],
    ["ia", "IA Avaliadora", "ia"],
    ["regua", "Régua", "regua"]
  ]
};

const VARIANT_NAMES = {
  A: "Spec Crion",
  B: "Editorial GEAP",
  C: "Inbox densos"
};

const state = {
  variant: "A",
  role: "gestao",
  screen: "login",
  collapsed: false,
  admin: "",
  agente: "",
  selectedId: "a1",
  periodSubmitted: false
};

function params() {
  return new URLSearchParams(location.search);
}

function readUrl() {
  const p = params();
  const v = (p.get("variant") || "A").toUpperCase();
  state.variant = VARIANT_NAMES[v] ? v : "A";
  state.screen = p.get("screen") || state.screen;
  state.role = p.get("role") || state.role;
  state.admin = p.get("admin") ?? state.admin;
  state.agente = p.get("agente") ?? state.agente;
  if (p.get("id")) state.selectedId = p.get("id");
}

function writeUrl() {
  const p = params();
  p.set("variant", state.variant);
  p.set("screen", state.screen);
  p.set("role", state.role);
  if (state.admin) p.set("admin", state.admin); else p.delete("admin");
  if (state.agente) p.set("agente", state.agente); else p.delete("agente");
  if (state.screen === "detalhe") p.set("id", state.selectedId); else p.delete("id");
  history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

function firstArea(role) {
  return role === "curador" ? "atendimentos" : "dashboard";
}

function filteredRows() {
  return ATENDIMENTOS.filter((row) => {
    if (state.admin && row.admin !== state.admin) return false;
    if (state.agente) {
      const ag = AGENTES.find((a) => a.id === state.agente);
      if (ag && row.agente !== ag.nome) return false;
    }
    return true;
  });
}

function agentesDoAdmin() {
  return AGENTES.filter((a) => !state.admin || a.admin === state.admin);
}

function recorteA() {
  const agentes = agentesDoAdmin();
  const agentDisabled = !state.admin;
  return `
    <div class="a-recorte">
      <select id="sel-admin">
        <option value="">Todas</option>
        ${["Affix", "Alter", "Conectaplan"].map((n) => `<option value="${n}" ${state.admin === n ? "selected" : ""}>${n}</option>`).join("")}
      </select>
      <select id="sel-agente" ${agentDisabled ? "disabled" : ""}>
        <option value="">Todos os agentes</option>
        ${agentes.map((a) => `<option value="${a.id}" ${state.agente === a.id ? "selected" : ""}>${a.nome}</option>`).join("")}
      </select>
    </div>`;
}

function bindRecorte() {
  const admin = document.getElementById("sel-admin");
  const agente = document.getElementById("sel-agente");
  if (admin) {
    admin.onchange = () => {
      state.admin = admin.value;
      state.agente = "";
      render();
    };
  }
  if (agente) {
    agente.onchange = () => {
      state.agente = agente.value;
      render();
    };
  }
}

function cascaClick(screen) {
  state.admin = "";
  state.agente = "";
  state.screen = screen;
  render();
}

function openDetail(id, carryRecorte) {
  state.selectedId = id;
  state.screen = "detalhe";
  if (!carryRecorte) {
    /* keep current recorte when coming from list/KPI */
  }
  render();
}

function icon(name) {
  return ICONS[name] || ICONS.atendimentos;
}

function renderALogin() {
  return `
    <div class="a-login">
      <form class="a-login-card" id="login-form">
        <img src="./logo-crion.png" alt="Crion" />
        <h1>Entrar no HQ</h1>
        <p>Qualidade das Claras · Affix, Alter e Conectaplan</p>
        <label class="a-field">E-mail<input value="ana@crion" /></label>
        <label class="a-field">Senha<input type="password" value="••••••••" /></label>
        <label class="a-field">Papel neste protótipo
          <select id="login-role">
            <option value="gestao" ${state.role === "gestao" ? "selected" : ""}>Gestão</option>
            <option value="curador" ${state.role === "curador" ? "selected" : ""}>Curador</option>
            <option value="admin" ${state.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
        </label>
        <button class="a-cta" type="submit">Entrar</button>
      </form>
    </div>`;
}

function renderACasca() {
  const areas = AREAS[state.role];
  const collapsed = state.collapsed ? " is-collapsed" : "";
  return `
    <div class="a-shell${collapsed}">
      <aside class="a-casca">
        <button class="a-brand" data-act="marca"><img src="./logo-crion.png" alt="Crion" /></button>
        <nav class="a-nav">
          ${areas.map(([id, label, ic]) => `
            <button class="${state.screen === id ? "active" : ""}" data-area="${id}">
              ${icon(ic)}<span>${label}</span>
            </button>`).join("")}
        </nav>
        <div class="a-casca-foot">
          <strong>Ana Souza · ${state.role === "gestao" ? "Gestão" : state.role === "curador" ? "Curador" : "Admin"}</strong>
          <div>
            <button type="button" data-act="collapse">${state.collapsed ? "▸" : "◂"}</button>
            <button class="leave" type="button" data-act="sair">Sair</button>
          </div>
        </div>
      </aside>
      <main class="a-main">${renderAScreen()}</main>
    </div>`;
}

function kpiClick(admin) {
  state.admin = admin;
  state.agente = "";
  state.screen = "atendimentos";
  render();
}

function evalPanel(title, nota, aprovado, items) {
  const chips = { ok: "Atendido", no: "Não atendido", na: "Não se aplica" };
  return `
    <section class="a-eval">
      <header class="a-eval-head">
        <h2>${title}</h2>
        <div class="a-score ${aprovado ? "" : "is-fail"}">
          <strong>${Number(nota).toFixed(1).replace(".", ",")}</strong>
          <span>${aprovado ? "Aprovado" : "Reprovado"}</span>
        </div>
      </header>
      <div class="a-crit-grid">
        ${items.map(([nome, estado, pts, critico]) => `
          <article class="a-crit-card is-${estado}">
            <div class="a-crit-top">
              <h3>${nome}</h3>
              <span class="a-pts">${pts} pt</span>
            </div>
            ${critico ? '<span class="critico">Crítico</span>' : ""}
            <span class="a-chip ${estado}">${chips[estado]}</span>
          </article>`).join("")}
      </div>
    </section>`;
}

function renderAScreen() {
  const rows = filteredRows();
  if (state.screen === "dashboard") {
    return `
      <div class="a-head">
        <h1>Dashboard</h1>
        ${recorteA()}
      </div>
      <div class="a-kpis">
        <button class="a-kpi" data-kpi="Affix"><small>Atendimentos</small><strong>${rows.length}</strong></button>
        <button class="a-kpi" data-kpi=""><small>Nota média IA</small><strong>7,8</strong></button>
        <button class="a-kpi" data-kpi="Alter"><small>SLA</small><strong>82%</strong></button>
        <button class="a-kpi" data-kpi="Conectaplan"><small>Concordância</small><strong>71%</strong></button>
      </div>
      <div class="a-panel">KPIs com Administradora no data-kpi carregam o Recorte para Atendimentos. Casca não.</div>`;
  }
  if (state.screen === "atendimentos" || state.screen === "fila" || state.screen === "minhas" || state.screen === "realizadas") {
    const title =
      state.screen === "fila" ? "Fila de Curadoria" :
      state.screen === "minhas" ? "Minhas Curadorias" :
      state.screen === "realizadas" ? "Curadorias Realizadas" : "Atendimentos";
    const list = state.screen === "fila" ? rows.filter((r) => !r.curadoria && r.status === "Concluído") : rows;
    return `
      <div class="a-head">
        <h1>${title}</h1>
        ${recorteA()}
      </div>
      <div class="a-filters">
        <input placeholder="Início" value="${state.periodSubmitted ? "01/09/2026" : ""}" />
        <input placeholder="Fim" value="${state.periodSubmitted ? "11/09/2026" : ""}" />
        <select><option>Status</option><option>Concluído</option></select>
        <select><option>Nota</option><option>7,5</option></select>
      </div>
      <div class="a-panel">
        ${list.map((r) => `
          <div class="a-row">
            <div>
              <button class="link" data-open="${r.id}">${r.agente} · ${r.quando}</button>
              <div class="a-meta">${r.motivo} · ${r.status}${state.role !== "curador" ? ` · ${r.custo}` : ""}</div>
            </div>
            <span class="a-badge">${r.admin}</span>
            <strong>${r.nota.toFixed(1)}</strong>
          </div>`).join("") || "<p>Nenhum Atendimento neste Recorte.</p>"}
      </div>`;
  }
  if (state.screen === "detalhe") {
    const r = ATENDIMENTOS.find((x) => x.id === state.selectedId) || ATENDIMENTOS[0];
    const showCurador = r.curadoria;
    return `
      <div class="a-head">
        <div>
          <button class="a-cta" style="width:auto;padding:8px 14px" data-act="voltar">Voltar à lista</button>
          <h1 style="margin-top:12px">Atendimento</h1>
        </div>
      </div>
      <p class="a-meta">Resumo: conferência da Avaliação da IA neste contato da ${r.admin}.</p>
      <div class="a-facts">
        <div><dt>Administradora</dt><dd><span class="a-badge">${r.admin}</span></dd></div>
        <div><dt>Agente de Voz</dt><dd>${r.agente}</dd></div>
        <div><dt>Motivo de Contato</dt><dd>${r.motivo}</dd></div>
        <div><dt>${state.role === "curador" ? "Status" : "Custo"}</dt><dd>${state.role === "curador" ? r.status : r.custo}</dd></div>
      </div>
      <div class="a-audio-row">
        <div class="a-player" title="player">
          <button class="a-play" type="button" aria-label="Reproduzir">▶</button>
          <span class="a-time">0:12 / 2:41</span>
          <div class="a-wave" aria-hidden="true"></div>
        </div>
        ${state.role !== "curador" ? `<button class="a-dl" type="button">Download de Áudio</button>` : ""}
      </div>
      <div class="a-workspace ${showCurador ? "" : "ia-only"}">
        ${evalPanel("Avaliação da IA", r.nota, r.nota >= 7, [
          ["Saudação", "ok", "1,0", false],
          ["Informação de Protocolo", showCurador ? "no" : "ok", "1,0", true],
          ["Palavras proibidas", "ok", "1,0", false],
          ["Validação de e-mail", "na", "0,5", false]
        ])}
        ${showCurador ? evalPanel("Avaliação do Curador", 6, false, [
          ["Saudação", "ok", "1,0", false],
          ["Informação de Protocolo", "no", "1,0", true]
        ]) : ""}
      </div>
      <section class="a-transcript">
        <h2>Transcrição</h2>
        <div class="a-thread">
          <article class="a-turn a-turn-agent">
            <div class="a-turn-col">
              <span class="a-rail" aria-hidden="true"></span>
              <div>
                <div class="a-turn-meta">${r.agente} · 0:04</div>
                <p class="a-bubble">Olá, aqui é a Clara da ${r.admin}. Em que posso ajudar?</p>
              </div>
            </div>
            <div></div>
          </article>
          <article class="a-turn a-turn-user">
            <div></div>
            <div class="a-turn-col">
              <div>
                <div class="a-turn-meta">Cliente · 0:12</div>
                <p class="a-bubble">Preciso da rede credenciada do meu plano.</p>
              </div>
              <span class="a-rail" aria-hidden="true"></span>
            </div>
          </article>
          <article class="a-turn a-turn-agent">
            <div class="a-turn-col">
              <span class="a-rail" aria-hidden="true"></span>
              <div>
                <div class="a-turn-meta">${r.agente} · 0:18</div>
                <p class="a-bubble">Claro. Me confirma o CPF do titular para eu localizar o contrato.</p>
              </div>
            </div>
            <div></div>
          </article>
        </div>
      </section>`;
  }
  if (state.screen === "monitoramento") {
    return `<div class="a-head"><h1>Monitoramento ao Vivo</h1>${recorteA()}</div><div class="a-panel">Observação em texto, sem áudio. Casca diz “Ao vivo”.</div>`;
  }
  if (state.screen === "regua") {
    return `<div class="a-head"><h1>Régua de Avaliação</h1></div><p>Uma Régua para todas as Claras. Soma 10. Aprovação ≥ 7,0.</p><div class="a-panel"><div class="a-crit"><span>Saudação</span><strong>1,0</strong></div><div class="a-crit"><span>Informação de Protocolo (crítico)</span><strong>1,0</strong></div></div>`;
  }
  return `<div class="a-head"><h1>${state.screen}</h1></div><div class="a-panel">Tela do inventário, superfície A.</div>`;
}

function renderB() {
  if (state.screen === "login") {
    return `<div class="b-login"><div class="b-login-hero"><h1>HQ GEAP look</h1></div><div class="b-login-form"><form class="b-card" id="login-form"><p>Duas colunas · marca teal</p><button class="a-cta" type="submit">Entrar</button></form></div></div>`;
  }
  return `<div class="b-shell"><aside class="b-casca"><strong>GEAP</strong>${AREAS[state.role].map(([id, label]) => `<button class="${state.screen===id?"active":""}" data-area="${id}">${id==="dashboard"?"Abrir Dashboard da Gestão":"Consultar "+label}</button>`).join("")}</aside><main class="b-main"><div class="b-eyebrow">Qualidade de agente</div><h1>${state.screen}</h1><p class="b-summary">Chrome editorial: eyebrow, Georgia, resumo. Faixa escura. Card assimétrico. Esta variante é o clone visual que a entrevista recusou.</p><div class="b-kpis"><div class="b-kpi">142</div><div class="b-kpi">7,8</div><div class="b-kpi">82%</div></div>${filteredRows().map((r)=>`<div class="b-row">${r.agente} · ${r.admin}</div>`).join("")}</main></div>`;
}

function renderC() {
  if (state.screen === "login") {
    return `<div class="c-login"><form id="login-form"><h1>Inbox</h1><button class="a-cta" type="submit">Enter</button></form></div>`;
  }
  const rows = filteredRows();
  return `<div class="c-shell">
    <aside class="c-rail">${AREAS[state.role].map(([id]) => `<button class="${state.screen===id?"active":""}" data-area="${id}">•</button>`).join("")}</aside>
    <section class="c-list">
      <h2>Carteiras (contexto de casca)</h2>
      <div class="c-tree">▸ Affix<br/>▸ Alter<br/>▸ Conectaplan</div>
      ${rows.map((r) => `<div class="c-item ${state.selectedId===r.id?"active":""}" data-open="${r.id}">${r.agente}<br/><small>${r.motivo}</small></div>`).join("")}
    </section>
    <main class="c-detail">
      <h1>Thread</h1>
      <table class="c-table"><thead><tr><th>Agente</th><th>Admin</th><th>Nota</th></tr></thead><tbody>${rows.map((r)=>`<tr><td>${r.agente}</td><td>${r.admin}</td><td>${r.nota}</td></tr>`).join("")}</tbody></table>
      <div class="c-thread">Layout lista | detalhe | árvore na casca — o inbox que o spec recusa.</div>
    </main>
  </div>`;
}

function renderSwitcher() {
  document.getElementById("proto-switcher").innerHTML = `
    <button type="button" id="prev-v" aria-label="Anterior">←</button>
    <span>${state.variant} (${VARIANT_NAMES[state.variant]})</span>
    <button type="button" id="next-v" aria-label="Próxima">→</button>`;
  document.getElementById("prev-v").onclick = () => cycle(-1);
  document.getElementById("next-v").onclick = () => cycle(1);
}

function cycle(dir) {
  const keys = ["A", "B", "C"];
  const i = keys.indexOf(state.variant);
  state.variant = keys[(i + dir + 3) % 3];
  render();
}

function renderState() {
  document.getElementById("proto-state").textContent =
    `PROTOTYPE state\nvariant: ${state.variant} ${VARIANT_NAMES[state.variant]}\nrole: ${state.role}\nscreen: ${state.screen}\nrecorte.admin: ${state.admin || "Todas"}\nrecorte.agente: ${state.agente || "Todos"}\ncollapsed: ${state.collapsed}\nurl: ${location.search}`;
}

function bindApp() {
  const login = document.getElementById("login-form");
  if (login) {
    login.onsubmit = (e) => {
      e.preventDefault();
      const roleSel = document.getElementById("login-role");
      if (roleSel) state.role = roleSel.value;
      state.screen = firstArea(state.role);
      state.admin = "";
      state.agente = "";
      render();
    };
  }
  document.querySelectorAll("[data-area]").forEach((btn) => {
    btn.onclick = () => cascaClick(btn.getAttribute("data-area"));
  });
  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = () => openDetail(btn.getAttribute("data-open"), true);
  });
  document.querySelectorAll("[data-kpi]").forEach((btn) => {
    btn.onclick = () => kpiClick(btn.getAttribute("data-kpi"));
  });
  const marca = document.querySelector("[data-act=marca]");
  if (marca) marca.onclick = () => cascaClick(firstArea(state.role));
  const sair = document.querySelector("[data-act=sair]");
  if (sair) sair.onclick = () => { state.screen = "login"; render(); };
  const col = document.querySelector("[data-act=collapse]");
  if (col) col.onclick = () => { state.collapsed = !state.collapsed; render(); };
  const voltar = document.querySelector("[data-act=voltar]");
  if (voltar) voltar.onclick = () => { state.screen = "atendimentos"; render(); };
  bindRecorte();
}

function render() {
  writeUrl();
  document.body.dataset.variant = state.variant;
  const root = document.getElementById("app");
  if (state.variant === "A") root.innerHTML = state.screen === "login" ? renderALogin() : renderACasca();
  else if (state.variant === "B") root.innerHTML = renderB();
  else root.innerHTML = renderC();
  renderSwitcher();
  renderState();
  bindApp();
}

document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.key === "ArrowLeft") cycle(-1);
  if (e.key === "ArrowRight") cycle(1);
});

readUrl();
render();
