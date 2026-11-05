# Slide Studio WEG v2 — o que está sendo feito e onde parou

Atualizado em 03/11/2026. Notas técnicas detalhadas: `NOTAS-DESENVOLVIMENTO.md`.
Backup da versão anterior (v1): pasta `_backup-v1/`.

## O que você pediu

1. UI inteira nova, profissional e parecida com o Canva.
2. Edição estilo Canva direto no slide.
3. Importar PDF, Word e outros formatos.
4. Botão para exportar PDF.
5. Usar o design system da WEG como base.

## O que já está pronto

### Interface nova (index.html + app/styles.css)
- Topo navy institucional com logo WEG branco, menu Arquivo, desfazer/refazer, status de salvamento,
  título editável, **Gerar com IA**, **Apresentar** e **Exportar PDF** (com menu de mais formatos).
- Trilho lateral estilo Canva: Gerar, Layouts, Elementos, Texto, Uploads, Estilo, Projetos, Atalhos.
- Tela inicial: caixa de pedido para a IA, sugestões de tema, atalhos (em branco, importar, abrir HTML)
  e projetos recentes com miniatura.
- Tela de progresso da geração com etapas, miniaturas sendo preenchidas, log e botão cancelar.
- Visual baseado no design system WEG: tokens do `agente-base.md` (primary-700 #00579D etc.) +
  identidade medida no weg.net (navy #0A2D6D, ciano #28B9DA, raios 8/12/16 px, Roboto/Inter).

### Editor estilo Canva (app/runtime.js, app/editor.js, app/toolbar.js)
- Clique seleciona; duplo clique edita o texto no próprio slide.
- Arrastar para mover (com guias de alinhamento), alças para redimensionar e girar.
- Barra de contexto muda conforme o elemento: fonte, tamanho, cor, negrito/itálico/sublinhado,
  alinhamento, espaçamento, fundo; ícone (cor, tamanho, traço, trocar); imagem (trocar, ajustar,
  cantos, espelhar, sombra); forma (preenchimento, borda, cantos, sombra).
- Transparência, camadas, alinhar à página, bloquear, duplicar, excluir, menu do clique direito.
- Copiar/colar (Ctrl+C/V), colar imagens e texto, arrastar imagens do computador para o slide.
- Inserir formas, ~2.000 ícones (busca em português), caixas de texto, layouts de slide.
- Slides: adicionar com layout, duplicar, excluir, reordenar arrastando a miniatura.
- Desfazer/refazer, zoom, aplicar paleta e fonte da marca à apresentação inteira.
- Salvamento automático no servidor local (pasta `projetos/`).

### Importação (app/importers.js)
- Documentos para a IA: PDF, DOCX, PPTX (com notas do apresentador), XLSX, ODT/ODP/ODS, RTF, HTML,
  TXT, MD, CSV, JSON.
- PDF como slides (cada página vira um slide).
- Imagens para Uploads (redimensionadas automaticamente).

### Exportação
- **Exportar PDF em 1 clique**: o servidor usa o Edge em segundo plano e devolve o PDF
  (uma página 16:9 por slide, texto selecionável). Plano B: janela de impressão do navegador.
- Baixar HTML da apresentação e baixar o prompt (.md).

### Servidor (server.js)
- Novas rotas: exportar PDF, excluir projeto (vai para `projetos/_lixeira`), contagem de slides.

## Testes feitos (Edge automatizado, sem abrir janela)

Passaram:
- Tela inicial, conexão com servidor e Kiro.
- Abrir apresentação, selecionar com clique, editar texto, mover, desfazer.
- Inserir forma/ícone/texto, mudar cor e tamanho, adicionar/duplicar/excluir slide.
- Redimensionar pelo canto (canto oposto fica parado), girar, menu de contexto, Ctrl+C/Ctrl+V.
- Exportar PDF: 5 slides → 5 páginas 960×540 pt; conferido visualmente.
- Importadores com seus arquivos reais (somente leitura): PDF de 6 páginas, DOCX, PPTX de 16 slides,
  e arquivos de teste XLSX, ODT e RTF.
- Geração com Kiro (simulado): etapas, abertura automática no editor, prompt.md gravado.
- Modo apresentação, painéis, busca de ícones, prompt manual, aplicar paleta/fonte.

Os projetos de teste criados na pasta `projetos/` foram apagados. Os testes seguintes usam uma
pasta temporária fora do projeto.

## Onde parei (03/11/2026)

Os 5 itens pendentes foram concluídos:

1. [x] **Atalho com servidor.** O atalho "Slide Studio WEG" da Área de Trabalho agora roda
       `iniciar.vbs` (sobe o servidor escondido e abre o Edge em modo app em http://127.0.0.1:5178),
       com o ícone do projeto. Testado: o servidor sobe e responde.
2. [x] **Lentidão de 5 s no arraste: é do ambiente de teste, não do app.** Com a janela fora da tela
       o Edge não desenha nenhum quadro (medido: 0 quadros/s) e segura o movimento do mouse com botão
       pressionado até um quadro que não chega. Sem nenhuma mudança no app, a mesma medição variou de
       16 ms a 5 s por evento. Quando há quadros, o arraste leva ~15 ms por evento.
3. [x] **Teste de interações completo: 14 de 14 passaram**, incluindo desfazer da paleta, PDF de
       6 páginas como 6 slides e HTML exportado sem marcações do editor (só o 1º slide com "active").
4. [x] **README da v2** reescrito (abrir, fluxo, editor, atalhos, importação, exportação).
5. [x] **Limpeza:** pastas temporárias de teste em `%TEMP%` apagadas.

Falta só a conferência manual de 1 minuto: abrir pelo atalho e arrastar um elemento e uma miniatura.

## Evoluções entregues (03/11/2026)

1. [x] **Seleção múltipla:** Shift+clique, retângulo de seleção no vazio, Ctrl+A; mover em grupo
       (com guias), alinhar entre si e à página, distribuir, duplicar, copiar/colar, bloquear,
       camadas, transparência e excluir. Teste automatizado: 15 de 15.
2. [x] **Editar slide com IA:** botão na barra do slide, menu da miniatura e clique direito; usa Kiro
       (rota nova `/api/edit-slide`), API direta ou copiar/colar. Imagens embutidas não são enviadas
       (vão como marcador e voltam intactas); scripts, estilos e `onclick` da resposta são removidos;
       desfazível. Teste com Kiro simulado: 12 de 12.
3. [x] **Exportar PowerPoint (.pptx):** fundo em imagem + textos editáveis, ou só imagens. Validado
       abrindo no PowerPoint 16 desta máquina: 6 slides 16:9, 24 caixas de texto, sem pedido de
       reparo. Fontes ausentes trocadas pela mais parecida instalada (Inter → Segoe UI).
4. [x] Regressão das interações simples (selecionar, mover, redimensionar, editar texto, Ctrl+C/V,
       menu de contexto): ok.

Ainda não testado com o Kiro real: a edição de slide (testada com um Kiro simulado que devolve
um slide). O primeiro uso real vai mostrar se o Kiro respeita o formato pedido.

## Versão para outros PCs (03/11/2026)

- [x] `dist/Slide Studio WEG.exe` (88 MB) e `dist/Slide Studio WEG.zip` (33 MB, com LEIA-ME).
- [x] Testado simulando o PC de um amigo (sem Kiro, pasta de usuário vazia): abre a janela, mostra o
      aviso para usar a chave de API, salva em Documentos\Slide Studio WEG, exporta PDF e PowerPoint,
      e encerra sozinho ao fechar a janela.
- [ ] Não testado num PC realmente diferente (outro Windows, outro antivírus).

## Limitações conhecidas (não são bugs, mas vale saber)

- Editor, miniaturas e PDF precisam de internet, porque as apresentações usam Tailwind, Google Fonts
  e Lucide por CDN (igual à v1).
- PDF escaneado (só imagem, sem texto) não é lido pela IA, porque não há OCR. Use "PDF como slides".
- Formatos antigos (.doc, .ppt, .xls) não são lidos. Salve como DOCX, PPTX, XLSX ou PDF.
- No editor o slide aparece parado (sem animações e contadores). As animações aparecem em Apresentar.
- Apresentar pelo atalho F5 com o foco dentro do slide pode abrir sem tela cheia (o navegador só
  permite tela cheia a partir de um clique). O botão Apresentar abre em tela cheia.
- No PowerPoint exportado só os textos são editáveis; formas, ícones e imagens ficam na imagem de fundo.

## Como abrir

Duplo clique no atalho **Slide Studio WEG** na Área de Trabalho. Sem o atalho: `node server.js`
nesta pasta e abrir http://127.0.0.1:5178 no Edge.

## Mapa dos arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura da interface |
| `app/styles.css` | Visual (design system WEG) |
| `app/app.js` | Estado, painéis, anexos, estilo, ícones |
| `app/flows.js` | Projetos, geração, importação, atalhos, exportação, apresentar |
| `app/editor.js` | Controlador do editor (modelo, histórico, miniaturas, zoom) |
| `app/runtime.js` | Código que roda dentro do slide (seleção, arrastar, editar texto) |
| `app/toolbar.js` | Barra de contexto, pílula da seleção e menus |
| `app/deck.js` | Modelo da apresentação, layouts, elementos, versões para PDF e apresentação |
| `app/importers.js` | Leitura de PDF, DOCX, PPTX, XLSX, ODT, RTF, HTML e imagens |
| `app/palette.js` | Paleta, presets, fontes e logo |
| `app/prompt.js` | Montagem do prompt para a IA |
| `app/ui.js` | Avisos, janelas, menus e seletor de cores |
| `app/vendor/` | Lucide (ícones) e pdf.js (leitura de PDF), guardados localmente |
| `server.js` | Servidor local: Kiro, projetos, exportação PDF e PowerPoint |
| `pptx.js` | Gerador do arquivo PowerPoint (.pptx) |
| `iniciar.vbs` | Inicializador do atalho (servidor + Edge em modo app) |
