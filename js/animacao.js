/* MAD.U — controle da animação dos modelos GLB */
(() => {
  "use strict";

  const viewer = document.getElementById("viewer");
  if (!viewer) return;

  // Posição totalmente aberta: quadro 66 de uma animação até o 111.
  const FRACAO_ABERTA = 65 / 110;

  let nomeAnimacao = null;
  let estado = "indisponivel";
  let quadroRAF = 0;
  let token = 0;

  function pararMovimento() {
    token++;
    if (quadroRAF) cancelAnimationFrame(quadroRAF);
    quadroRAF = 0;
  }

  function preparar() {
    pararMovimento();

    const animacoes = viewer.availableAnimations || [];
    nomeAnimacao = animacoes.length ? animacoes[0] : null;
    viewer.pause();

    if (!nomeAnimacao) {
      estado = "indisponivel";
      console.warn("[MAD.U] Nenhuma animação encontrada no GLB.", animacoes);
      return;
    }

    viewer.animationName = nomeAnimacao;
    viewer.currentTime = 0;
    estado = "fechada";

    console.info("[MAD.U] Animação pronta:", nomeAnimacao);
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

      if (relogioInicial === null) relogioInicial = agora;
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

  function alternar() {
    if (!viewer.loaded || !nomeAnimacao) return;

    const duracao = Number(viewer.duration) || 0;
    if (!duracao) return;

    if (estado === "fechada" || estado === "fechando") {
      moverPara(duracao * FRACAO_ABERTA, "aberta");
    } else {
      moverPara(0, "fechada");
    }
  }

  viewer.addEventListener("load", preparar);
  viewer.addEventListener("click", alternar);

  if (viewer.loaded) preparar();
})();
