/* MAD.U — interação exclusiva com a primeira gaveta do Animadinhos One */
(() => {
  "use strict";

  const viewer = document.getElementById("viewer");
  const hint = document.getElementById("drawerHint");

  if (!viewer) return;

  const ARQUIVO_ALVO = "AnimadinhosOne1.1.glb";
  const FRACAO_ABERTA = 65 / 110;

  let nomeAnimacao = null;
  let estado = "indisponivel";
  let meshesGaveta = new Set();

  let quadroRAF = 0;
  let token = 0;

  let arrastou = false;
  let ponteiroAtivo = null;
  let ignorarClique = false;

  function modeloAlvoAtivo() {
    const src = viewer.getAttribute("src") || "";

    try {
      const caminho = new URL(src, document.baseURI).pathname;

      return (
        caminho.endsWith("/" + ARQUIVO_ALVO) ||
        caminho === ARQUIVO_ALVO
      );
    } catch (_) {
      return src.split("?")[0].endsWith(ARQUIVO_ALVO);
    }
  }

  function mostrarDica() {
    if (
      !hint ||
      !modeloAlvoAtivo() ||
      !meshesGaveta.size
    ) return;

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

  function coletarMeshesDaGaveta(gltf) {
    const nodes =
      gltf && Array.isArray(gltf.nodes)
        ? gltf.nodes
        : [];

    const raiz = nodes.findIndex(
      n =>
        String(n.name || "")
          .trim()
          .toLowerCase() === "gaveta"
    );

    if (raiz < 0) return new Set();

    const encontrados = new Set();
    const visitados = new Set();

    function percorrer(indice) {
      if (
        visitados.has(indice) ||
        !nodes[indice]
      ) return;

      visitados.add(indice);

      const no = nodes[indice];

      if (Number.isInteger(no.mesh)) {
        encontrados.add(no.mesh);
      }

      (no.children || []).forEach(percorrer);
    }

    percorrer(raiz);

    return encontrados;
  }

  function preparar() {
    pararMovimento();

    nomeAnimacao = null;
    meshesGaveta = new Set();
    estado = "indisponivel";

    if (!modeloAlvoAtivo()) {
      esconderDica();
      return;
    }

    const gltf = viewer.originalGltfJson;

    meshesGaveta = coletarMeshesDaGaveta(gltf);

    const animacoes = viewer.availableAnimations || [];

    nomeAnimacao = animacoes.length
      ? animacoes[0]
      : null;

    viewer.pause();

    if (
      !nomeAnimacao ||
      !meshesGaveta.size
    ) {
      console.warn(
        "[MAD.U] Não foi possível preparar a interação da gaveta.",
        {
          animacoes,
          meshesGaveta: [...meshesGaveta]
        }
      );

      esconderDica();
      return;
    }

    viewer.animationName = nomeAnimacao;
    viewer.currentTime = 0;

    estado = "fechada";

    mostrarDica();

    console.info(
      "[MAD.U] Primeira gaveta identificada. Malhas:",
      [...meshesGaveta]
    );
  }

  function moverPara(destino, estadoFinal) {
    if (
      !nomeAnimacao ||
      !viewer.loaded ||
      !modeloAlvoAtivo()
    ) return;

    const duracao = Number(viewer.duration) || 0;

    if (!duracao) return;

    const alvo = Math.max(
      0,
      Math.min(duracao, destino)
    );

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

    estado =
      estadoFinal === "aberta"
        ? "abrindo"
        : "fechando";

    const tempoTotal = Math.abs(diferenca) * 1000;

    let relogioInicial = null;

    function animar(agora) {
      if (meuToken !== token) return;

      if (relogioInicial === null) {
        relogioInicial = agora;
      }

      const progresso = Math.min(
        1,
        (agora - relogioInicial) / tempoTotal
      );

      viewer.currentTime =
        inicio + diferenca * progresso;

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

  function alternar() {
    if (
      !viewer.loaded ||
      !nomeAnimacao ||
      !modeloAlvoAtivo()
    ) return;

    const duracao = Number(viewer.duration) || 0;

    if (!duracao) return;

    if (
      estado === "fechada" ||
      estado === "fechando"
    ) {
      moverPara(
        duracao * FRACAO_ABERTA,
        "aberta"
      );
    } else {
      moverPara(0, "fechada");
    }
  }

  function aoClicar(evento) {
    if (
      !modeloAlvoAtivo() ||
      !nomeAnimacao ||
      !meshesGaveta.size
    ) return;

    if (ignorarClique || arrastou) return;

    if (
      typeof viewer.surfaceFromPoint !== "function"
    ) return;

    const superficie = viewer.surfaceFromPoint(
      evento.clientX,
      evento.clientY
    );

    if (!superficie) return;

    const indiceMalha = Number.parseInt(
      String(superficie).trim().split(/\s+/)[0],
      10
    );

    if (
      !Number.isInteger(indiceMalha) ||
      !meshesGaveta.has(indiceMalha)
    ) return;

    alternar();

    // A instrução permanece visível para o cliente.
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
      if (
        !ponteiroAtivo ||
        evento.pointerId !== ponteiroAtivo.id
      ) return;

      const dx =
        evento.clientX - ponteiroAtivo.x;

      const dy =
        evento.clientY - ponteiroAtivo.y;

      if (Math.hypot(dx, dy) > 8) {
        arrastou = true;
      }
    },
    { passive: true }
  );

  function finalizarPonteiro(evento) {
    if (
      ponteiroAtivo &&
      evento.pointerId === ponteiroAtivo.id
    ) {
      ignorarClique = arrastou;

      ponteiroAtivo = null;

      window.setTimeout(() => {
        ignorarClique = false;
        arrastou = false;
      }, 0);
    }
  }

  viewer.addEventListener(
    "pointerup",
    finalizarPonteiro,
    { passive: true }
  );

  viewer.addEventListener(
    "pointercancel",
    finalizarPonteiro,
    { passive: true }
  );

  viewer.addEventListener("click", aoClicar);

  viewer.addEventListener("load", preparar);

  if (viewer.loaded) {
    preparar();
  }

})();
