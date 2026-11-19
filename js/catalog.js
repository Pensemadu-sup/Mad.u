/*
 * CATÁLOGO MAD.U — lista central de produtos.
 *
 * Para adicionar um produto novo:
 *   1. Coloque o arquivo .glb na raiz do repositório (ou em uma pasta, ex.: "modelos/").
 *   2. Copie um bloco de `produtos` abaixo e troque id, nome, categoria, modelo e versao.
 *      - id: único, sem espaço nem acento (ex.: "produto-2")
 *      - modelo: caminho relativo ao index.html (ex.: "produto-2.glb")
 *      - versao: aumente (2, 3...) quando substituir o arquivo, para evitar cache antigo
 * Para criar um filtro de categoria:
 *   1. Adicione { id: "slug", rotulo: "Nome da categoria" } em `categorias` (filtro: true aparece como botão).
 *   2. Use o mesmo id no campo `categoria` dos produtos.
 *
 * Nomes e categorias abaixo são PROVISÓRIOS: só o dono do site pode defini-los.
 */
window.CATALOGO = {
  site: {
    titulo: "Catálogo MAD.U",
    url: "https://www.pensemadu.com.br/"
  },

  // O filtro "Todos" sempre existe. `filtro: false` = a categoria rotula o card, mas ainda não vira botão.
  categorias: [
    { id: "catalogo-madu", rotulo: "Catálogo MAD.U", filtro: false }
  ],

  produtos: [
    {
      id: "produto-1",
      nome: "Produto MAD.U",
      categoria: "catalogo-madu",
      modelo: "produto.glb",
      versao: "1",
      descricao: "Modelo 3D interativo do produto"
    }
  ]
};
