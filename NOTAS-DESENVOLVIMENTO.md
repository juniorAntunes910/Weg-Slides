# Notas de desenvolvimento — Slide Studio WEG v2

Backup da v1 em `_backup-v1/` (index.html, README.md, notas antigas).

## Pedidos do usuário (rodada atual)
1. UI inteira melhorada, parecida com o Canva.
2. Edição estilo Canva (clicar no slide e editar texto, mover, redimensionar, cores, inserir elementos).
3. Importar arquivos PDF, DOCX etc. (anexos para a IA).
4. Botão para exportar PDF.

## Arquitetura v2
- `server.js` (Node, sem dependências) em http://127.0.0.1:5178
  - já existe: /api/health, /api/generate, /api/jobs/:id, /api/projects, /api/projects/:id(/save), /api/projects-new
  - adicionar: MIME .mjs, POST /api/export-pdf (Edge headless --print-to-pdf), POST /api/projects/:id/delete (lixeira)
- `index.html`: shell estilo Canva (sem Tailwind no app; CSS próprio em app/styles.css)
  - topbar (gradiente WEG): Arquivo, desfazer/refazer, título, status salvo, Gerar com IA, Apresentar, Exportar PDF, Baixar
  - rail esquerdo: Gerar (IA + anexos), Estilo (paleta/fonte/logo/componentes), Elementos (formas/ícones), Texto, Uploads (imagens), Projetos
  - canvas central: slide 1280x720 em iframe sandbox escalado; barra de contexto do elemento no topo
  - tira de miniaturas embaixo (+ adicionar, arrastar para reordenar), zoom no rodapé
  - tela inicial (sem projeto): criar com IA, em branco, importar, recentes
- `app/palette.js`: escala 50–900, presets, semânticas WEG, logo SVG
- `app/prompt.js`: buildPrompt (pronto)
- `app/importers.js`: leitor ZIP próprio (DecompressionStream deflate-raw) -> DOCX/PPTX/XLSX/ODT/ODP/ODS; PDF via pdf.js vendorizado; RTF; HTML; texto
- `app/deck.js`: modelo-fonte = DOMParser; data-ssw-id em cada elemento; data-ssw-slide nos slides;
  builders: editorDoc (sem scripts do deck + runtime), thumbDoc, printDoc, presentDoc (shim de localStorage), blankDeck
- `app/runtime.js`: função injetada no iframe do editor (toString). Seleção, hover, arrastar (translate em vw/vh),
  redimensionar, girar, texto inline (contenteditable), menu de contexto, atalhos -> postMessage
- `app/editor.js`: controlador no app: ops (style/attr/html/remove/insert) aplicadas no doc e no iframe,
  histórico (snapshots com imagens internadas), miniaturas, zoom, barra de contexto, copiar/colar
- `app/app.js`: painéis, geração (Kiro via /api, API direta, copiar prompt), projetos, autosave, exportação, apresentar
- `app/vendor/`: lucide UMD fixado, pdf.js 4.10.38 (.mjs)
- Segurança: iframes `sandbox="allow-scripts"` (origem opaca) — HTML gerado/importado não acessa chaves do app.
- Unidades: tamanho de design 1280x720; fonte em vw, mover = translate em vw/vh, elementos novos = posição absoluta em %.
- Atalho: `iniciar.vbs` sobe o servidor (oculto) e abre Edge --app=http://127.0.0.1:5178

## Design system WEG (base da UI — analisado nesta rodada)
Não existe design system WEG público na web; a base usada foi:
1. Tokens do `agente-base.md` (DS WEG para apresentações): primary-700 #00579D (marca), secondary âmbar #FCA304,
   tertiary roxo #9F7BBA, semânticas positive/negative/warning/info, neutral slate, fonte Inter.
2. Identidade aplicada no weg.net (medido com Edge headless + CDP em 30/10/2026):
   - fundos institucionais navy #0A2D6D / #01296F, navbar rgba(13,39,96,.8) ≈ #0D2760; acento ciano #28B9DA
   - CTA em #00579D com raio 8px; raios recorrentes 25px (pílulas), 8px, 4px
   - tipografia Roboto (Thin a Black); títulos com contraste leve + negrito ("Seu mundo não para de evoluir. **Nem o nosso.**")
   - menus em caixa alta, logo vazado (branco) sobre fundo escuro, padrão de pontos e moldura em "L" ciano
   - texto corrido #595959
3. Aplicação na UI: topbar navy com logo branco, padrão de pontos e moldura ciano; IA = degradê azul WEG -> ciano
   (sem roxo/laranja fora da marca); raios 8/12/16 + pílula; ações de menu em caixa alta; título com peso leve/forte.

## Status
- [x] Kiro CLI verificado (rodada anterior) e server.js base
- [x] server.js: .mjs, export-pdf (testado: Edge headless gera PDF 960x540pt), delete -> _lixeira, slides na listagem
- [x] vendor: lucide 1.65.0 (UMD) + pdf.js 4.10.38
- [x] app/palette.js, app/importers.js, app/deck.js, app/runtime.js, app/editor.js (sintaxe ok)
- [x] app/ui.js, app/toolbar.js, app/app.js (parte 1), app/flows.js (parte 2), app/styles.css
- [x] index.html novo
- [x] Testes no Edge (CDP): todos passaram. Lentidão de 5 s por mousemove com botão = artefato do teste
      (janela headless/fora da tela não produz quadros, rAF = 0; input contínuo fica alinhado ao quadro)
- [x] iniciar.vbs + atalho da Área de Trabalho apontando para wscript iniciar.vbs (03/11)
- [x] Testes: sintaxe, servidor, importadores, export PDF, interações (14/14 em 03/11)
- [x] README da v2 (03/11)
