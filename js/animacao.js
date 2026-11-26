/* MAD.U — clique no produto para abrir; outro clique faz o contrário (model-viewer).
   Vale para qualquer .glb que tenha animação. */
(() => {
  "use strict";

  const viewer = document.getElementById("viewer");
  const hint = document.getElementById("drawerHint");

  if (!viewer) return;

  /* ------------------------------------------------------------------
     AJUSTES
     SO_PARTES_ANIMADAS:
       false = clicar em qualquer parte do produto abre/fecha (padrão)
       true  = só clicar nas peças que se movem abre/fecha
     EXCECOES (opcional): modelos que precisam de um ponto "aberto"
       diferente do fim da animação.
       arquivo      : trecho do nome do .glb (expressão regular)
       fracaoAberta : 0 a 1 (1 = fim da animação)
  ------------------------------------------------------------------ */
  const SO_PARTES_ANIMADAS = false;

  const PADRAO = { fracaoAberta: 1 };

  const EXCECOES = [
    { arquivo: /AnimadinhosOne1\.1\.glb$/i, fracaoAberta: 65 / 110 }
  ];

  let nomeAnimacao = null;
  let estado = "indisponivel";
  let meshesAnimadas = new Set();

  let quadroRAF = 0;
  let token = 0;

  let arrastou = false;
  let ponteiroAtivo = null;
  let ignorarClique = false;

  function caminhoAtual() {
    const src = viewer.getAttribute("src") || "";

    try {
      return decodeURIComponent(new URL(src, document.baseURI).pathname);
    } catch (_) {
      return src.split("?")[0];
    }
  }

  function configAtual() {
    const caminho = caminhoAtual();
    return EXCECOES.find(m => m.arquivo.test(caminho)) || PADRAO;
  }

  function mostrarDica() {
    if (!hint) return;

    hint.hidden = false;

    requestAnimationFrame(() => {
      hint.classList.add("is-visible");
    });
  }

  function esconderDica() {
    if (!hint) return;

    hint.classList.remove("is-visible");
    hint.hidden = true;
  }

  function pararMovimento() {
    token++;

    if (quadroRAF) {
      cancelAnimationFrame(quadroRAF);
    }

    quadroRAF = 0;
  }

  /* Descobre quais malhas pertencem às peças que a animação mexe. */
  function coletarMeshesAnimadas(gltf, indiceAnimacao) {
    const nodes = gltf && Array.isArray(gltf.nodes) ? gltf.nodes : [];
    const anims = gltf && Array.isArray(gltf.animations) ? gltf.animations : [];
    const anim = anims[indiceAnimacao] || anims[0];

    if (!anim) return new Set();

    const raizes = new Set();

    (anim.channels || []).forEach(c => {
      if (c && c.target && Number.isInteger(c.target.node)) {
        raizes.add(c.target.node);
      }
    });

    const encontrados = new Set();
    const visitados = new Set();

    function percorrer(indice) {
      if (visitados.has(indice) || !nodes[indice]) return;

      visitados.add(indice);

      const no = nodes[indice];

      if (Number.isInteger(no.mesh)) {
        encontrados.add(no.mesh);
      }

      (no.children || []).forEach(percorrer);
    }

    raizes.forEach(percorrer);

    return encontrados;
  }

  function preparar() {
    pararMovimento();

    nomeAnimacao = null;
    meshesAnimadas = new Set();
    estado = "indisponivel";

    const gltf = viewer.originalGltfJson;
    const animacoes = viewer.availableAnimations || [];

    nomeAnimacao = animacoes.length ? animacoes[0] : null;

    viewer.pause();

    if (!nomeAnimacao) {
      esconderDica();
      return;
    }

    if (animacoes.length > 1) {
      console.warn(
        "[MAD.U] O modelo tem " + animacoes.length +
        " animações, mas só a primeira é usada: " + nomeAnimacao +
        ". Junte as animações em um clipe só.",
        animacoes
      );
    }

    if (SO_PARTES_ANIMADAS) {
      meshesAnimadas = coletarMeshesAnimadas(gltf, 0);

      if (!meshesAnimadas.size) {
        console.warn(
          "[MAD.U] Não achei as peças animadas; vou aceitar clique em qualquer parte do produto."
        );
      }
    }

    viewer.animationName = nomeAnimacao;
    viewer.currentTime = 0;

    estado = "fechada";

    mostrarDica();

    console.info(
      "[MAD.U] Animação pronta: " + nomeAnimacao +
      " (" + (Number(viewer.duration) || 0).toFixed(2) + " s)"
    );
  }

  function moverPara(destino, estadoFinal) {
    if (!nomeAnimacao || !viewer.loaded) return;

    const duracao = Number(viewer.duration) || 0;

    if (!duracao) return;

    const alvo = Math.max(0, Math.min(duracao, destino));

    const inicio = Number(viewer.currentTime) || 0;
    const diferenca = alvo - inicio;

    pararMovimento();

    const meuToken = token;

    viewer.pause();

    if (Math.abs(diferenca) < 0.001) {
      viewer.currentTime = alvo;
      estado = estadoFinal;
      return;
    }

    estado = estadoFinal === "aberta" ? "abrindo" : "fechando";

    const tempoTotal = Math.abs(diferenca) * 1000;

    let relogioInicial = null;

    function animar(agora) {
      if (meuToken !== token) return;

      if (relogioInicial === null) {
        relogioInicial = agora;
      }

      const progresso = Math.min(1, (agora - relogioInicial) / tempoTotal);

      viewer.currentTime = inicio + diferenca * progresso;

      if (progresso < 1) {
        quadroRAF = requestAnimationFrame(animar);
      } else {
        viewer.currentTime = alvo;
        quadroRAF = 0;
        estado = estadoFinal;
      }
    }

    quadroRAF = requestAnimationFrame(animar);
  }

  /* Um clique abre; o clique seguinte faz o contrário (fecha).
     Se clicar no meio do movimento, ele inverte dali mesmo. */
  function alternar() {
    if (!viewer.loaded || !nomeAnimacao) return;

    const duracao = Number(viewer.duration) || 0;

    if (!duracao) return;

    const config = configAtual();

    if (estado === "fechada" || estado === "fechando") {
      moverPara(duracao * config.fracaoAberta, "aberta");
    } else {
      moverPara(0, "fechada");
    }
  }

  function aoClicar(evento) {
    if (!nomeAnimacao || estado === "indisponivel") return;

    if (ignorarClique || arrastou) return;

    if (typeof viewer.surfaceFromPoint !== "function") return;

    const superficie = viewer.surfaceFromPoint(evento.clientX, evento.clientY);

    if (!superficie) return;

    if (SO_PARTES_ANIMADAS && meshesAnimadas.size) {
      const indiceMalha = Number.parseInt(
        String(superficie).trim().split(/\s+/)[0],
        10
      );

      if (!Number.isInteger(indiceMalha) || !meshesAnimadas.has(indiceMalha)) {
        return;
      }
    }

    alternar();
  }

  // Detecta arrasto sem interferir nos controles da câmera.

  viewer.addEventListener(
    "pointerdown",
    evento => {
      ponteiroAtivo = {
        id: evento.pointerId,
        x: evento.clientX,
        y: evento.clientY
      };

      arrastou = false;
    },
    { passive: true }
  );

  viewer.addEventListener(
    "pointermove",
    evento => {
      if (!ponteiroAtivo || evento.pointerId !== ponteiroAtivo.id) return;

      const dx = evento.clientX - ponteiroAtivo.x;
      const dy = evento.clientY - ponteiroAtivo.y;

      if (Math.hypot(dx, dy) > 8) {
        arrastou = true;
      }
    },
    { passive: true }
  );

  function finalizarPonteiro(evento) {
    if (ponteiroAtivo && evento.pointerId === ponteiroAtivo.id) {
      ignorarClique = arrastou;

      ponteiroAtivo = null;

      window.setTimeout(() => {
        ignorarClique = false;
        arrastou = false;
      }, 0);
    }
  }

  viewer.addEventListener("pointerup", finalizarPonteiro, { passive: true });
  viewer.addEventListener("pointercancel", finalizarPonteiro, { passive: true });

  viewer.addEventListener("click", aoClicar);

  viewer.addEventListener("load", preparar);

  if (viewer.loaded) {
    preparar();
  }
})();
