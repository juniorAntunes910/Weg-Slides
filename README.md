# Slide Studio WEG v2

Aplicativo local para criar apresentações corporativas com IA e editá-las direto no slide,
no estilo Canva, com a identidade visual da WEG por padrão. Cada apresentação é um HTML
autocontido que pode ser apresentado, exportado em PDF ou baixado.

> O README da v1 está em `_backup-v1/README.md`.

## Como abrir

Dê um duplo clique no atalho **Slide Studio WEG** na Área de Trabalho.

O atalho roda o `iniciar.vbs`, que:
1. sobe o servidor local (`node server.js`) sem janela, se ele ainda não estiver rodando;
2. abre o app no Microsoft Edge em modo aplicativo: http://127.0.0.1:5178

Requisitos: Node.js instalado e Microsoft Edge. Se o servidor não subir, aparece um aviso;
o log fica em `servidor.log`, nesta pasta.

Sem o atalho: abra o PowerShell nesta pasta, rode `node server.js` e abra o endereço acima.

> Abrir o `index.html` direto funciona em "Modo arquivo", mas sem Kiro, sem salvar
> projetos e sem PDF em 1 clique. Prefira sempre o atalho.

## Fluxo de uso

1. **Tela inicial:** descreva o que você quer na caixa de pedido (ou escolha uma sugestão),
   comece em branco, importe um arquivo ou abra um projeto recente.
2. **Gerar com IA:** anexe documentos no painel **Gerar** e clique em **Gerar com IA**.
   A tela de progresso mostra as etapas e as miniaturas sendo preenchidas; ao terminar,
   a apresentação abre no editor.
3. **Editar** direto no slide (veja abaixo).
4. **Apresentar** em tela cheia ou **Exportar PDF**.

O projeto é salvo automaticamente na pasta `projetos/`. Projetos excluídos vão para
`projetos/_lixeira`.

### Formas de gerar

| Modo | Como funciona |
|---|---|
| **Kiro** (padrão) | O servidor envia o pedido ao Kiro CLI e abre o resultado no editor. Cada geração e cada edição de slide mostra os créditos gastos, que também aparecem no cartão do projeto. A barra superior mostra quanto do plano do Kiro já foi usado (clique para atualizar). |
| **API direta** | Cadastre uma chave (Google Gemini, Anthropic ou OpenAI). Ela fica criptografada neste computador (DPAPI do Windows). O modelo é escolhido do catálogo do provedor; falhas temporárias são repetidas sozinhas. O Gemini pesquisa na web e mostra as fontes; modelos de voz, imagem e vídeo ficam fora da lista, e um modelo sobrecarregado ou sem cota é trocado pelo próximo Flash do catálogo. |
| **Copiar prompt** | Copia o prompt para colar em qualquer IA; depois abra o HTML gerado no app. |

## Editor

- **Clique** seleciona; **duplo clique** edita o texto no próprio slide.
- **Arraste** para mover (com guias de alinhamento); alças nos cantos redimensionam e a alça
  de baixo gira.
- A **barra de contexto** muda conforme o elemento: texto (fonte, tamanho, cor, negrito,
  alinhamento, espaçamento, fundo), ícone (cor, tamanho, traço, trocar), imagem (trocar,
  ajustar, cantos, espelhar, sombra) e forma (preenchimento, borda, cantos, sombra).
- Transparência, camadas, alinhar à página, bloquear, duplicar e excluir. Clique direito
  abre o menu com essas ações.
- **Vários elementos de uma vez:** Shift+clique soma ou tira da seleção; arrastar no espaço
  vazio desenha um retângulo de seleção; Ctrl+A seleciona tudo do slide. O grupo se move junto,
  e a barra mostra **Alinhar** (entre si e à página), **Distribuir** com espaços iguais,
  transparência, camadas, bloquear, duplicar, copiar/colar e excluir.
- Painéis do trilho lateral: **Gerar**, **Layouts**, **Elementos** (formas e ~2.000 ícones
  com busca em português), **Texto**, **Uploads**, **Estilo** (paleta, fonte e logo da marca
  aplicados à apresentação inteira), **Projetos** e **Atalhos**.
- Slides: adicione com layout, duplique, exclua e reordene arrastando a miniatura.

### Editar slide com IA

Com nenhum elemento selecionado, clique em **Editar com IA** na barra do slide (também no menu
da miniatura e no clique direito). Escreva o que mudar, ou escolha uma sugestão ("Deixar mais
conciso", "Transformar em 3 tópicos com ícones", "Traduzir para inglês"...). A IA reescreve só
aquele slide, mantendo cores e fontes da apresentação, e o slide é trocado inteiro.
Se não gostar, clique em **Desfazer** no aviso ou use Ctrl+Z.

Usa o mesmo motor escolhido no painel Gerar: Kiro, API direta ou copiar/colar o prompt em
qualquer IA. Scripts e códigos inseridos pela IA são removidos antes de entrar no slide.
- Cole imagens e texto (Ctrl+V) ou arraste imagens do computador para o slide.

### Atalhos do teclado

| Ação | Atalho |
|---|---|
| Desfazer / Refazer | Ctrl+Z / Ctrl+Y |
| Salvar | Ctrl+S |
| Copiar / Colar / Duplicar | Ctrl+C / Ctrl+V / Ctrl+D |
| Excluir elemento | Delete |
| Selecionar vários | Shift+clique ou arrastar no vazio |
| Selecionar tudo no slide | Ctrl+A |
| Editar texto | Duplo clique ou Enter |
| Sair da edição / seleção | Esc |
| Mover 1 px / 10 px | Setas / Shift+Setas |
| Manter proporção ao redimensionar | Shift |
| Mover sem encaixe | Alt |
| Selecionar item dentro do grupo | Alt+clique |
| Slide anterior / próximo | PageUp / PageDown |
| Zoom | Ctrl + / Ctrl − / Ctrl 0 |
| Negrito / Itálico / Sublinhado | Ctrl+B / I / U |
| Bloquear elemento | Ctrl+L |
| Apresentar | F5 |

## Importar

| O quê | Formatos | Resultado |
|---|---|---|
| Documentos para a IA | PDF, DOCX, PPTX (com notas), XLSX, ODT, ODP, ODS, RTF, HTML, TXT, MD, CSV, JSON | O texto entra no pedido para a IA |
| PDF como slides | PDF | Cada página vira um slide |
| Apresentação existente | HTML | Abre no editor |
| Imagens | PNG, JPG, WebP, SVG etc. | Vão para Uploads, já redimensionadas |

## Exportar

- **Exportar PDF** (1 clique): o servidor gera o PDF com o Edge em segundo plano, uma
  página 16:9 por slide e texto selecionável. Se falhar, abre a janela de impressão.
- **PowerPoint (.pptx)** no menu ao lado do botão: cada slide vira uma imagem de fundo em alta
  resolução com **caixas de texto editáveis** por cima, na mesma posição, cor e tamanho.
  Formas, ícones, imagens e degradês ficam no fundo (não editáveis); textos girados ou com
  degradê também ficam no fundo. Há também a opção **só imagens**.
  O .pptx não leva fontes da web: se a fonte da apresentação (ex.: Inter) não estiver instalada
  no computador, ela é trocada pela instalada mais parecida (ex.: Segoe UI) e o aviso informa.
- No mesmo menu: **baixar HTML** da apresentação (sem as marcações do editor). O prompt (.md)
  fica no menu Arquivo.

## Limitações conhecidas

- Editor, miniaturas e PDF precisam de internet: as apresentações usam Tailwind, Google Fonts
  e Lucide por CDN.
- PDF escaneado (só imagem) não é lido pela IA, porque não há OCR. Use "PDF como slides".
- Formatos antigos (.doc, .ppt, .xls) não são lidos. Salve como DOCX, PPTX, XLSX ou PDF.
- No editor o slide aparece parado (sem animações e contadores); as animações aparecem em
  Apresentar.
- F5 com o foco dentro do slide pode abrir sem tela cheia (o navegador só permite tela cheia
  a partir de um clique). O botão **Apresentar** sempre abre em tela cheia.
- No PowerPoint exportado, só os textos são editáveis; o resto do slide é a imagem de fundo.
- Seleção múltipla não redimensiona nem gira o grupo (faça um elemento por vez).

## Passar para outros PCs

Envie o arquivo **`dist/Slide Studio WEG.zip`**: ele tem o `Slide Studio WEG.exe` e um LEIA-ME.
A pessoa extrai o zip e dá dois cliques no .exe; o app abre numa janela própria, sem instalar nada
(o Node, o servidor e a interface vão dentro do .exe).

- Requisitos no outro PC: Windows 10/11 com Microsoft Edge (já vem no Windows) e internet.
- Na primeira vez o Windows pode mostrar "O Windows protegeu o computador", porque o .exe não tem
  assinatura digital paga. É só clicar em **Mais informações** e depois em **Executar assim mesmo**.
  Antivírus corporativo pode bloquear programas sem assinatura.
- Sem o Kiro, a geração usa o motor **API** com a chave da própria pessoa (o Google Gemini tem cota
  gratuita) ou o motor **Prompt**. Editor, edição com IA, PDF e PowerPoint funcionam normalmente.
- As apresentações ficam em **Documentos\Slide Studio WEG**; configurações e chaves, no perfil da
  janela em `%LOCALAPPDATA%\SlideStudioWEG`.
- Fechar a janela encerra o programa (cerca de 1 minuto depois).
- Na primeira abertura o app cria o atalho **Slide Studio WEG** no Menu Iniciar. É ele que deixa o
  ícone nítido na barra de tarefas (a janela é do Edge, que entrega um ícone de 32 px que o Windows
  borra ao reduzir para 24 px). Por isso o ícone fica nítido a partir da segunda abertura.

Para gerar o .exe de novo depois de mudar o código: `node ferramentas/gerar-exe.js`.

## Privacidade

Tudo roda no seu computador. O servidor só aceita conexões locais (127.0.0.1) com token.
O conteúdo sai da máquina apenas para a IA escolhida (Kiro ou o provedor da API direta), e o app
pede autorização antes de enviar, listando os documentos anexados. As chaves de API ficam
criptografadas em `%LOCALAPPDATA%\SlideStudioWEG`. Os slides não podem abrir conexões de rede (CSP).
Detalhes da auditoria de segurança e confiabilidade: `ANALISE-AUDITORIA.md`.

## Arquivos desta pasta

| Arquivo | Função |
|---|---|
| `iniciar.vbs` | Inicializador usado pelo atalho (servidor + Edge) |
| `server.js` | Servidor local: Kiro, projetos, exportação PDF e PowerPoint |
| `pptx.js` | Gerador do arquivo PowerPoint (.pptx) |
| `app/ai.js` | Cliente dos provedores de IA (novas tentativas, prazo, catálogo de modelos, busca) |
| `ANALISE-AUDITORIA.md` | Parecer sobre a auditoria e o que foi corrigido |
| `ferramentas/gerar-exe.js` | Gera o `dist/Slide Studio WEG.exe` e o `.zip` para outros PCs |
| `dist/` | Executável e zip para distribuir |
| `index.html` | Estrutura da interface |
| `app/` | Código do app (editor, importadores, estilos, painéis) e bibliotecas locais em `app/vendor/` |
| `projetos/` | Suas apresentações salvas |
| `agente-base.md` | Regras de geração e tokens do design system WEG |
| `STATUS-PRODUCAO.md` | O que está pronto e o que falta |
| `NOTAS-DESENVOLVIMENTO.md` | Notas técnicas |
| `_backup-v1/` | Versão anterior |
"# Weg-Slides" 
