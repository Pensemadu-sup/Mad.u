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

  /* Folga (em segundos) antes do último instante da animação.
   Se o tempo chegar exatamente ao fim, o model-viewer volta ao começo
   e a gaveta "fecha sozinha". Parar um pouquinho antes evita o loop. */
const FOLGA = 0.02;

  /* fracaoAberta null = descobrir sozinho o instante em que o produto está
     mais "aberto" (maior afastamento da posição inicial). */
  const PADRAO = { fracaoAberta: null };

  const EXCECOES = [
    { arquivo: /AnimadinhosOne1\.1\.glb$/i, fracaoAberta: 65 / 110 }
  ];

  let nomeAnimacao = null;
  let estado = "indisponivel";
  let meshesAnimadas = new Set();
  let abertoEm = null;

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

  /* Acha, nos dados da animação, o instante em que as peças estão mais
     afastadas da posição inicial. Serve para animações que abrem e depois
     voltam a fechar dentro do mesmo clipe. Devolve segundos ou null. */
  function pontoAbertoDe(J, dv, bin) {
    const anim = (J.animations || [])[0];
    if (!anim) return null;

    const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

    function ler(i) {
      const a = (J.accessors || [])[i];
      if (!a || a.sparse || a.componentType !== 5126 || a.bufferView === undefined) return null;
      const bv = J.bufferViews[a.bufferView];
      const n = NCOMP[a.type];
      if (!bv || !n) return null;
      const passo = bv.byteStride || n * 4;
      const ini = bin + (bv.byteOffset || 0) + (a.byteOffset || 0);
      const linhas = [];
      for (let k = 0; k < a.count; k++) {
        const l = [];
        for (let c = 0; c < n; c++) l.push(dv.getFloat32(ini + k * passo + c * 4, true));
        linhas.push(l);
      }
      return linhas;
    }

    const canais = [];

    (anim.channels || []).forEach(ch => {
      const alvo = ch.target || {};
      if (alvo.path !== "translation" && alvo.path !== "rotation" && alvo.path !== "scale") return;

      const sp = (anim.samplers || [])[ch.sampler];
      if (!sp) return;

      const tempos = ler(sp.input);
      let valores = ler(sp.output);
      if (!tempos || !valores) return;

      if (sp.interpolation === "CUBICSPLINE") {
        valores = valores.filter((_, i) => i % 3 === 1);
      }
      if (valores.length !== tempos.length || valores.length < 2) return;

      const t = tempos.map(l => l[0]);
      const v0 = valores[0];

      const dev = valores.map(v => {
        if (alvo.path === "rotation") {
          const d = Math.abs(v.reduce((s, x, i) => s + x * v0[i], 0));
          return 1 - Math.min(1, d);
        }
        return Math.hypot(...v.map((x, i) => x - v0[i]));
      });

      const maior = Math.max(...dev);
      if (maior < 1e-6) return;

      canais.push({ t, dev: dev.map(d => d / maior) });
    });

    if (!canais.length) return null;

    function devEm(c, tempo) {
      const { t, dev } = c;
      if (tempo <= t[0]) return dev[0];
      if (tempo >= t[t.length - 1]) return dev[dev.length - 1];
      let i = 1;
      while (i < t.length && t[i] < tempo) i++;
      const f = (tempo - t[i - 1]) / ((t[i] - t[i - 1]) || 1);
      return dev[i - 1] + (dev[i] - dev[i - 1]) * f;
    }

    const candidatos = [...new Set(canais.flatMap(c => c.t.map(x => Math.round(x * 10000) / 10000)))].sort((a, b) => a - b);

    const pontuacao = candidatos.map(tempo => canais.reduce((s, c) => s + devEm(c, tempo), 0));
    const maximo = Math.max(...pontuacao);

    if (!(maximo > 0)) return null;

    // O primeiro instante em que já está (quase) todo aberto.
    for (let i = 0; i < candidatos.length; i++) {
      if (pontuacao[i] >= maximo * 0.985) return candidatos[i];
    }

    return null;
  }

  async function descobrirPontoAberto(gltf) {
    const src = viewer.src;
    const resp = await fetch(src);
    const buf = await resp.arrayBuffer();
    const dv = new DataView(buf);

    if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) return null;

    let pos = 12;
    let bin = null;

    while (pos + 8 <= buf.byteLength) {
      const tam = dv.getUint32(pos, true);
      if (dv.getUint32(pos + 4, true) === 0x004E4942) { bin = pos + 8; break; }
      pos += 8 + tam;
    }

    if (bin === null) return null;

    return pontoAbertoDe(gltf, dv, bin);
  }

  function preparar() {
    pararMovimento();

    nomeAnimacao = null;
    meshesAnimadas = new Set();
    abertoEm = null;
    estado = "indisponivel";

    const gltf = viewer.originalGltfJson;
    const animacoes = viewer.availableAnimations || [];

    nomeAnimacao = animacoes.length ? animacoes[0] : null;

    viewer.autoplay = false;
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

    const srcAtual = viewer.src;

    descobrirPontoAberto(gltf)
      .then(t => {
        if (viewer.src !== srcAtual || t === null) return;
        abertoEm = t;
        console.info(
          "[MAD.U] Ponto totalmente aberto: " + t.toFixed(2) +
          " s de " + (Number(viewer.duration) || 0).toFixed(2) + " s"
        );
      })
      .catch(err => {
        console.warn("[MAD.U] Não consegui descobrir o ponto aberto; usando o fim da animação.", err);
      });

    console.info(
      "[MAD.U] Animação pronta: " + nomeAnimacao +
      " (" + (Number(viewer.duration) || 0).toFixed(2) + " s)"
    );
  }

  function moverPara(destino, estadoFinal) {
    if (!nomeAnimacao || !viewer.loaded) return;

    const duracao = Number(viewer.duration) || 0;

    if (!duracao) return;

    const alvo = Math.max(0, Math.min(duracao - FOLGA, destino));

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
      let destino = duracao;

      if (typeof config.fracaoAberta === "number") {
        destino = duracao * config.fracaoAberta;
      } else if (abertoEm !== null) {
        destino = abertoEm;
      }

      moverPara(destino, "aberta");
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

  // Se algo tentar tocar a animação sozinha (autoplay, outro script), pausa de novo.
  viewer.addEventListener("play", () => {
    if (nomeAnimacao && estado !== "indisponivel") viewer.pause();
  });

  viewer.addEventListener("load", preparar);

  if (viewer.loaded) {
    preparar();
  }
})();
