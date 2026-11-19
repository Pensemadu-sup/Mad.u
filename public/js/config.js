/*
 * CONFIGURAÇÃO DO VISUALIZADOR
 * Edite os valores abaixo — não é preciso mexer em mais nada.
 */
window.VIEWER_CONFIG = {
  // Textos exibidos no canto superior esquerdo. Use "" para ocultar.
  titulo: "MAD.U",
  subtitulo: "Visualização 3D",

  // Arquivo do modelo. Para trocar o produto, basta substituir
  // public/models/produto.glb (ou apontar para outro arquivo aqui).
  modelo: "models/produto.glb",

  // Texto alternativo (acessibilidade / leitores de tela).
  descricao: "Modelo 3D interativo do produto",

  // Ângulo inicial da câmera: [giro horizontal em graus, inclinação em graus].
  // 0° = de frente; 90° = lado direito. Inclinação 90° = altura dos olhos.
  anguloInicial: [48, 74],

  // Campo de visão da câmera (menor = aparência mais "de catálogo").
  campoDeVisao: 30,

  // Distância mínima/máxima da câmera ao produto, em metros.
  zoomMinimo: 0.6,
  zoomMaximo: 10,

  // Iluminação e sombra.
  exposicao: 1.15,
  intensidadeSombra: 0.9,   // 0 = sem sombra, 1 = sombra forte
  suavidadeSombra: 1,       // 0 = definida, 1 = bem suave

  // Endereços da biblioteca de visualização, em ordem de tentativa.
  // Para funcionar 100% offline/sem CDN, baixe o arquivo para
  // public/vendor/model-viewer.min.js e coloque "vendor/model-viewer.min.js"
  // como primeiro item (veja o README).
  bibliotecas: [
    "https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js",
    "https://unpkg.com/@google/model-viewer@4.0.0/dist/model-viewer.min.js"
  ]
};
