/* Visualizador 3D — lógica da página. A configuração fica em js/config.js */

const cfg = Object.assign({
  titulo: "", subtitulo: "", modelo: "models/produto.glb", descricao: "Modelo 3D do produto",
  anguloInicial: [48, 74], campoDeVisao: 30, zoomMinimo: 0.6, zoomMaximo: 10,
  exposicao: 1.15, intensidadeSombra: 0.9, suavidadeSombra: 1,
  bibliotecas: ["https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js"]
}, window.VIEWER_CONFIG || {});

const $ = (id) => document.getElementById(id);
const stage = $("stage"), mv = $("viewer"), loader = $("loader");
const touch = matchMedia("(pointer: coarse)").matches;

/* ---------- Textos ---------- */
document.title = cfg.titulo ? `${cfg.titulo} — Visualização 3D` : "Visualização 3D";
if (cfg.titulo || cfg.subtitulo) {
  $("titulo").textContent = cfg.titulo;
  $("subtitulo").textContent = cfg.subtitulo;
  $("subtitulo").hidden = !cfg.subtitulo;
  $("brand").hidden = false;
}
$("hint").textContent = touch
  ? "Arraste para girar · Pince para aproximar"
  : "Arraste para girar · Role para aproximar";

/* ---------- Estados de tela ---------- */
function showError(title, msg) {
  loader.classList.add("is-done");
  $("errorTitle").textContent = title;
  $("errorMsg").textContent = msg;
  $("error").hidden = false;
}
$("btnRetry").addEventListener("click", () => location.reload());

/* ---------- Carrega a biblioteca (tenta cada endereço em ordem) ---------- */
function comTempo(promessa, ms) {
  return Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), ms))]);
}
async function carregarBiblioteca() {
  if (customElements.get("model-viewer")) return;
  let ultimo;
  for (const url of cfg.bibliotecas) {
    try {
      await comTempo(import(url), 20000);
      await customElements.whenDefined("model-viewer");
      return;
    } catch (e) { ultimo = e; console.warn("Falha ao carregar", url, e); }
  }
  throw ultimo || new Error("nenhum endereço disponível");
}

/* ---------- Câmera ---------- */
const [thetaDeg, phiDeg] = cfg.anguloInicial;
let flip = 0;   // alterna a cada reset uma diferença imperceptível, para o componente
                // não ignorar um valor "igual ao anterior" depois que o usuário moveu a câmera

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

/* ---------- Tela cheia ---------- */
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsSupported = !!(stage.requestFullscreen || stage.webkitRequestFullscreen);
function toggleFull() {
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
}
function syncFull() {
  const on = !!fsEl();
  document.body.classList.toggle("is-fullscreen", on);
  $("btnFull").setAttribute("aria-label", on ? "Sair da tela cheia" : "Tela cheia");
  $("btnFull").title = on ? "Sair da tela cheia" : "Tela cheia";
}
document.addEventListener("fullscreenchange", syncFull);
document.addEventListener("webkitfullscreenchange", syncFull);
if (!fsSupported) $("btnFull").hidden = true;   // ex.: iPhone — a página já ocupa toda a tela

/* ---------- Dica ---------- */
let hintTimer;
function mostrarDica() {
  const h = $("hint"); h.hidden = false;
  requestAnimationFrame(() => h.classList.add("is-visible"));
  hintTimer = setTimeout(esconderDica, 7000);
}
function esconderDica() { clearTimeout(hintTimer); $("hint").classList.remove("is-visible"); }

/* ---------- Inicialização ---------- */
async function iniciar() {
  loader.classList.add("is-indeterminate");
  $("loaderLabel").textContent = "Carregando";
  try {
    await carregarBiblioteca();
  } catch (e) {
    showError("Não foi possível carregar o 3D",
      "O componente de visualização não pôde ser baixado. Verifique sua conexão com a internet e tente novamente.");
    return;
  }

  mv.setAttribute("alt", cfg.descricao);
  mv.setAttribute("camera-orbit", `${thetaDeg}deg ${phiDeg}deg auto`);
  mv.setAttribute("field-of-view", `${cfg.campoDeVisao}deg`);
  mv.setAttribute("min-camera-orbit", `auto 5deg ${cfg.zoomMinimo}m`);   // 5° evita travar no polo
  mv.setAttribute("max-camera-orbit", `auto 95deg ${cfg.zoomMaximo}m`);  // não deixa entrar no chão
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
  mv.addEventListener("load", () => {
    $("loaderFill").style.width = "100%";
    loader.classList.add("is-done");
    $("controls").hidden = false;
    setTimeout(mostrarDica, 900);
    window.__viewerReady = true;
  }, { once: true });
  mv.addEventListener("error", (e) => {
    console.error("Erro no modelo:", e.detail);
    showError("Não foi possível abrir o modelo",
      "O arquivo 3D não foi encontrado ou está inválido. Confira se o arquivo existe em " + cfg.modelo + ".");
  });
  mv.addEventListener("camera-change", (e) => {
    if (e.detail && e.detail.source === "user-interaction") esconderDica();
  });

  $("btnZoomIn").addEventListener("click", () => zoom(0.78));
  $("btnZoomOut").addEventListener("click", () => zoom(1 / 0.78));
  $("btnReset").addEventListener("click", posicaoInicial);
  $("btnFull").addEventListener("click", toggleFull);

  mv.setAttribute("src", cfg.modelo);   // só agora começa a baixar o GLB
}

iniciar();
