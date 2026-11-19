/* Catálogo + visualizador 3D da MAD.U (Google Model Viewer). Produtos ficam em js/catalog.js. */
const PADRAO = {
  modelo: "produto.glb",
  descricao: "Modelo 3D do produto",
  anguloInicial: [48, 74],
  campoDeVisao: 30,
  zoomMinimo: 0.6,
  zoomMaximo: 10,
  exposicao: 1.15,
  intensidadeSombra: 0.9,
  suavidadeSombra: 1,
  bibliotecas: ["https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js"]
};
const cfg = Object.assign({}, PADRAO, window.VIEWER_CONFIG || {});
const cat = Object.assign({ site: {}, categorias: [], produtos: [] }, window.CATALOGO || {});

const $ = (id) => document.getElementById(id);
const stage = $("stage"), mv = $("viewer"), loader = $("loader"), vistaCatalogo = $("viewCatalogo");
const touch = matchMedia("(pointer: coarse)").matches;
const tituloPagina = cat.site.titulo || "Catálogo";

let filtro = "todos";
let atual = null;          // produto aberto no visualizador
let ultimoCard = null;     // card que abriu o visualizador (para devolver o foco)
let scrollGuardado = 0;
let srcCarregado = null;   // endereço do modelo já enviado ao model-viewer
let tokenCarga = 0;        // descarta respostas de uma carga que já não vale

/* ---------- Biblioteca model-viewer (só baixa quando necessário) ---------- */
function comTempo(promessa, ms) {
  return Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), ms))]);
}
let promessaLib = null;
function carregarBiblioteca() {
  if (customElements.get("model-viewer")) return Promise.resolve();
  if (!promessaLib) {
    promessaLib = (async () => {
      let ultimo;
      for (const url of cfg.bibliotecas) {
        try {
          await comTempo(import(url), 20000);
          await customElements.whenDefined("model-viewer");
          return;
        } catch (e) { ultimo = e; console.warn("Falha ao carregar", url, e); }
      }
      throw ultimo || new Error("nenhum endereço disponível");
    })();
    promessaLib.catch(() => { promessaLib = null; });   // permite tentar de novo
  }
  return promessaLib;
}

/* ---------- Catálogo: filtros e grade ---------- */
const ICONE_CUBO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4l11 6v12l-11 6-11-6V10z"/><path d="M5 10l11 6 11-6M16 16v12"/></svg>';

function rotuloCategoria(p) {
  const c = cat.categorias.find((x) => x.id === p.categoria);
  return c ? c.rotulo : "";
}

function criarFiltros() {
  const box = $("filtros");
  box.textContent = "";
  const itens = [{ id: "todos", rotulo: "Todos" }].concat(cat.categorias.filter((c) => c.filtro !== false));
  for (const item of itens) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = item.rotulo;
    b.dataset.filtro = item.id;
    b.setAttribute("aria-pressed", String(item.id === filtro));
    b.addEventListener("click", () => {
      filtro = item.id;
      for (const outro of box.children) outro.setAttribute("aria-pressed", String(outro.dataset.filtro === filtro));
      renderGrade();
    });
    box.appendChild(b);
  }
}

function criarCard(p) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.className = "card";
  b.dataset.id = p.id;

  const media = document.createElement("span");
  media.className = "card__media";
  media.setAttribute("aria-hidden", "true");
  media.innerHTML = ICONE_CUBO;   // texto fixo do próprio código, sem dados externos

  const nome = document.createElement("span");
  nome.className = "card__nome";
  nome.textContent = p.nome;

  const rot = rotuloCategoria(p);
  const cta = document.createElement("span");
  cta.className = "card__cta";
  cta.textContent = "Ver em 3D";

  b.append(media);
  if (rot) {
    const c = document.createElement("span");
    c.className = "card__cat";
    c.textContent = rot;
    b.append(c);
  }
  b.append(nome, cta);

  // Só a biblioteca é adiantada ao passar o mouse/foco; o modelo .glb NÃO baixa antes do clique.
  const adiantar = () => { carregarBiblioteca().catch(() => {}); };
  b.addEventListener("pointerenter", adiantar, { once: true });
  b.addEventListener("focus", adiantar, { once: true });
  b.addEventListener("click", () => { ultimoCard = b; abrir(p); });

  li.appendChild(b);
  return li;
}

function renderGrade() {
  const lista = cat.produtos.filter((p) => filtro === "todos" || p.categoria === filtro);
  const grade = $("grade");
  grade.textContent = "";
  for (const p of lista) grade.appendChild(criarCard(p));
  $("vazio").hidden = lista.length > 0;
  $("contagem").textContent = lista.length === 1 ? "1 produto" : `${lista.length} produtos`;
}

/* ---------- Visualizador ---------- */
const [thetaDeg, phiDeg] = cfg.anguloInicial;
let flip = 0;
function posicaoInicial() {
  flip = 1 - flip;
  mv.cameraOrbit = `${thetaDeg + flip * 0.001}deg ${phiDeg}deg auto`;
  const c = mv.getBoundingBoxCenter && mv.getBoundingBoxCenter();
  if (c) mv.cameraTarget = `${c.x}m ${c.y + flip * 0.000001}m ${c.z}m`;
  mv.fieldOfView = `${cfg.campoDeVisao}deg`;
}
function zoom(fator) {
  const o = mv.getCameraOrbit();
  const r = Math.min(cfg.zoomMaximo, Math.max(cfg.zoomMinimo, o.radius * fator));
  mv.cameraOrbit = `${o.theta}rad ${o.phi}rad ${r}m`;
}

const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsSupported = !!(stage.requestFullscreen || stage.webkitRequestFullscreen);
function sairTelaCheia() { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f) f.call(document); }
function toggleFull() { if (fsEl()) sairTelaCheia(); else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage); }
function syncFull() {
  const on = !!fsEl();
  document.body.classList.toggle("is-fullscreen", on);
  $("btnFull").setAttribute("aria-label", on ? "Sair da tela cheia" : "Tela cheia");
  $("btnFull").title = on ? "Sair da tela cheia" : "Tela cheia";
}
document.addEventListener("fullscreenchange", syncFull);
document.addEventListener("webkitfullscreenchange", syncFull);
if (!fsSupported) $("btnFull").hidden = true;

let hintTimer;
function mostrarDica() { const h = $("hint"); h.hidden = false; requestAnimationFrame(() => h.classList.add("is-visible")); hintTimer = setTimeout(esconderDica, 7000); }
function esconderDica() { clearTimeout(hintTimer); $("hint").classList.remove("is-visible"); }
$("hint").textContent = touch ? "Arraste para girar · Pince para aproximar" : "Arraste para girar · Role para aproximar";

function mostrarLoader() {
  loader.classList.remove("is-done");
  loader.classList.add("is-indeterminate");
  $("loaderFill").style.width = "0%";
  $("loaderLabel").textContent = "Carregando";
}
function mostrarErro(titulo, msg) {
  loader.classList.add("is-done");
  $("errorTitle").textContent = titulo;
  $("errorMsg").textContent = msg;
  $("error").hidden = false;
  $("btnRetry").focus();
}
function esconderErro() { $("error").hidden = true; }

function enderecoDoModelo(p, extra) {
  const base = p.modelo || cfg.modelo;
  const partes = [];
  if (p.versao) partes.push("v=" + encodeURIComponent(p.versao));
  if (extra) partes.push(extra);
  return partes.length ? `${base}${base.includes("?") ? "&" : "?"}${partes.join("&")}` : base;
}

async function carregarModelo(p, forcar) {
  const token = ++tokenCarga;
  mostrarLoader();
  esconderErro();
  $("controls").hidden = true;
  esconderDica();
  try {
    await carregarBiblioteca();
  } catch (e) {
    if (token === tokenCarga) mostrarErro("Não foi possível carregar o 3D", "O componente de visualização não pôde ser baixado. Verifique sua conexão com a internet e tente novamente.");
    return;
  }
  if (token !== tokenCarga) return;

  const src = enderecoDoModelo(p, forcar ? "t=" + Date.now() : "");
  if (!forcar && src === srcCarregado && mv.loaded) { aoCarregar(); return; }   // já está na tela: não baixa de novo
  srcCarregado = src;
  mv.setAttribute("alt", p.descricao || cfg.descricao);
  mv.setAttribute("src", src);
}

function aoCarregar() {
  $("loaderFill").style.width = "100%";
  loader.classList.add("is-done");
  $("controls").hidden = false;
  setTimeout(mostrarDica, 900);
  window.__viewerReady = true;
}

mv.setAttribute("camera-orbit", `${thetaDeg}deg ${phiDeg}deg auto`);
mv.setAttribute("field-of-view", `${cfg.campoDeVisao}deg`);
mv.setAttribute("min-camera-orbit", `auto 5deg ${cfg.zoomMinimo}m`);
mv.setAttribute("max-camera-orbit", `auto 95deg ${cfg.zoomMaximo}m`);
mv.setAttribute("exposure", cfg.exposicao);
mv.setAttribute("shadow-intensity", cfg.intensidadeSombra);
mv.setAttribute("shadow-softness", cfg.suavidadeSombra);
mv.addEventListener("progress", (e) => {
  const p = e.detail.totalProgress;
  if (p > 0 && p < 1) {
    loader.classList.remove("is-indeterminate");
    $("loaderFill").style.width = Math.round(p * 100) + "%";
    $("loaderLabel").textContent = `Carregando ${Math.round(p * 100)}%`;
  }
});
mv.addEventListener("load", aoCarregar);
mv.addEventListener("error", () => {
  srcCarregado = null;
  const onde = atual ? (atual.modelo || cfg.modelo) : cfg.modelo;
  mostrarErro("Não foi possível abrir o modelo", "O arquivo 3D não foi encontrado ou está inválido. Confira se o arquivo existe em " + onde + ".");
});
mv.addEventListener("camera-change", (e) => { if (e.detail && e.detail.source === "user-interaction") esconderDica(); });

$("btnZoomIn").addEventListener("click", () => zoom(0.78));
$("btnZoomOut").addEventListener("click", () => zoom(1 / 0.78));
$("btnReset").addEventListener("click", posicaoInicial);
$("btnFull").addEventListener("click", toggleFull);
$("btnRetry").addEventListener("click", () => { if (atual) carregarModelo(atual, true); });

/* ---------- Navegação catálogo <-> visualizador (mesma página) ---------- */
function abrir(p, opcoes) {
  const empurrar = !opcoes || opcoes.empurrar !== false;
  atual = p;
  scrollGuardado = window.scrollY;
  $("vNome").textContent = p.nome;
  const rot = rotuloCategoria(p);
  $("vCategoria").textContent = rot;
  $("vCategoria").hidden = !rot;
  document.title = `${p.nome} — ${tituloPagina}`;
  vistaCatalogo.hidden = true;
  stage.hidden = false;
  document.body.classList.add("em-visualizador");
  if (empurrar) history.pushState({ produto: p.id }, "", "#" + p.id);
  carregarModelo(p);
  $("btnVoltar").focus();
}

function fechar() {
  if (fsEl()) sairTelaCheia();
  tokenCarga++;                       // cancela carga em andamento
  atual = null;
  stage.hidden = true;
  vistaCatalogo.hidden = false;
  document.body.classList.remove("em-visualizador");
  document.title = tituloPagina;
  window.scrollTo(0, scrollGuardado);
  if (ultimoCard && document.contains(ultimoCard)) ultimoCard.focus({ preventScroll: true });
}

function voltar() {
  if (history.state && history.state.produto) history.back();   // o popstate fecha
  else fechar();
}
$("btnVoltar").addEventListener("click", voltar);
$("btnVoltarErro").addEventListener("click", voltar);
window.addEventListener("popstate", (e) => {
  const id = e.state && e.state.produto;
  const p = id && cat.produtos.find((x) => x.id === id);
  if (p) abrir(p, { empurrar: false }); else if (atual) fechar();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && atual && !fsEl()) voltar(); });

/* ---------- Início ---------- */
$("tituloCatalogo").textContent = tituloPagina;
document.title = tituloPagina;
// Ao carregar a página nada abre sozinho: o modelo só baixa depois do clique em um produto.
if (location.hash) history.replaceState(null, "", location.pathname + location.search);
criarFiltros();
renderGrade();
