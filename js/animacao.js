/* MAD.U — clique na gaveta para abrir / fechar (model-viewer) */
(() => {
  "use strict";

  const viewer = document.getElementById("viewer");
  const hint = document.getElementById("drawerHint");

  if (!viewer) return;

  /* ------------------------------------------------------------------
     MODELOS COM GAVETA INTERATIVA
     arquivo      : trecho do nome do .glb (expressão regular, sem diferenciar
                    maiúsculas de minúsculas; espaços e %20 são tratados)
     raiz         : nomes dos nós do modelo que fazem parte da gaveta
     fracaoAberta : ponto da animação em que a gaveta está toda aberta
                    (0 a 1; 1 = no fim da animação)
     Para ligar outro modelo, copie uma linha e ajuste.
  ------------------------------------------------------------------ */
  const MODELOS = [
    {
      arquivo: /AnimadinhosOne1\.1\.glb$/i,
      raiz: /^gaveta$/i,
      fracaoAberta: 65 / 110
    },
    {
      arquivo: /extra[\s_-]*animation/i,
      raiz: /gaveta|puxador|bucha|acabamento/i,
      fracaoAberta: 1
    }
  ];

  let nomeAnimacao = null;
  let estado = "indisponivel";
  let meshesGaveta = new Set();

  let quadroRAF = 0;
  let token = 0;

  let arrastou = false;
  let ponteiroAtivo = null;
  let ignorarClique = false;

  function caminhoAtual() {
    const src = viewer.getAttribute("src") || "";

    try {
      return decodeURIComponent(
        new URL(src, document.baseURI).pathname
      );
    } catch (_) {
      return src.split("?")[0];
    }
  }

  function configAtual() {
    const caminho = caminhoAtual();
    return MODELOS.find(m => m.arquivo.test(caminho)) || null;
  }

  function modeloAlvoAtivo() {
    return !!configAtual();
  }

  function mostrarDica() {
    if (!hint || !modeloAlvoAtivo() || !meshesGaveta.size) return;

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

  function coletarMeshesDaGaveta(gltf, regexRaiz) {
    const nodes =
      gltf && Array.isArray(gltf.nodes) ? gltf.nodes : [];

    const raizes = [];

    nodes.forEach((n, i) => {
      if (regexRaiz.test(String(n.name || "").trim())) {
        raizes.push(i);
      }
    });

    if (!raizes.length) return new Set();

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
    meshesGaveta = new Set();
    estado = "indisponivel";

    const config = configAtual();

    if (!config) {
      esconderDica();
      return;
    }

    const gltf = viewer.originalGltfJson;

    meshesGaveta = coletarMeshesDaGaveta(gltf, config.raiz);

    const animacoes = viewer.availableAnimations || [];

    nomeAnimacao = animacoes.length ? animacoes[0] : null;

    if (animacoes.length > 1) {
      console.warn(
        "[MAD.U] O modelo tem " + animacoes.length +
        " animações, mas só a primeira é usada: " + nomeAnimacao +
        ". Exporte do Blender com 'Ações ativas combinadas' para sair um clipe só.",
        animacoes
      );
    }

    viewer.pause();

    if (!nomeAnimacao || !meshesGaveta.size) {
      const nomesDosNos = ((gltf && gltf.nodes) || [])
        .map(n => n.name)
        .filter(Boolean)
        .slice(0, 60);

      console.warn(
        "[MAD.U] Não foi possível preparar a interação da gaveta.",
        {
          animacoes,
          meshesGaveta: [...meshesGaveta],
          nomesDosNos
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
      "[MAD.U] Gaveta identificada. Malhas:",
      [...meshesGaveta]
    );
  }

  function moverPara(destino, estadoFinal) {
    if (!nomeAnimacao || !viewer.loaded || !modeloAlvoAtivo()) return;

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

      const progresso = Math.min(
        1,
        (agora - relogioInicial) / tempoTotal
      );

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

  function alternar() {
    const config = configAtual();

    if (!viewer.loaded || !nomeAnimacao || !config) return;

    const duracao = Number(viewer.duration) || 0;

    if (!duracao) return;

    if (estado === "fechada" || estado === "fechando") {
      moverPara(duracao * config.fracaoAberta, "aberta");
    } else {
      moverPara(0, "fechada");
    }
  }

  function aoClicar(evento) {
    if (!modeloAlvoAtivo() || !nomeAnimacao || !meshesGaveta.size) return;

    if (ignorarClique || arrastou) return;

    if (typeof viewer.surfaceFromPoint !== "function") return;

    const superficie = viewer.surfaceFromPoint(
      evento.clientX,
      evento.clientY
    );

    if (!superficie) return;

    const indiceMalha = Number.parseInt(
      String(superficie).trim().split(/\s+/)[0],
      10
    );

    if (!Number.isInteger(indiceMalha) || !meshesGaveta.has(indiceMalha)) {
      return;
    }

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
