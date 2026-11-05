/* ============================================================
   Slide Studio WEG — montagem do prompt do agente
   Função pura: buildPrompt(cfg) -> string
============================================================ */
(function (global) {
  'use strict';

  const LANG_NAMES = { 'pt-BR': 'Português (Brasil)', en: 'English', es: 'Español' };

  const COMPONENT_TEXT = {
    progressbar: 'Barra de progresso fina, fixa no topo, que avança conforme o slide atual.',
    pagination: 'Paginação "X / N" e botões Anterior/Próximo (ícones Lucide chevron-left/chevron-right) fixos na parte inferior.',
    swipe: 'Navegação por gestos de swipe (touchstart/touchend) em telas sensíveis ao toque.',
    darkmode: 'Botão de alternância entre modo claro e escuro, funcional durante toda a apresentação.',
    counters: 'Números-chave com animação de contagem ao entrar no slide.',
    timeline: 'Timeline visual para conteúdos cronológicos ou de roadmap, quando fizer sentido.',
    compareCards: 'Cards comparativos (antes vs. depois, problema vs. solução), quando fizerem sentido.'
  };

  function componentsText(components) {
    const lines = Object.keys(COMPONENT_TEXT).filter(k => components && components[k]).map(k => '- ' + COMPONENT_TEXT[k]);
    return lines.length ? lines.join('\n') : '- Nenhum componente opcional: mantenha a apresentação enxuta.';
  }

  function attachmentsText(files) {
    if (!files || !files.length) return 'Nenhum anexo fornecido.';
    return files.map(f => '=== ANEXO: ' + f.name + ' ===\n' + f.content).join('\n\n');
  }

  function buildPrompt(cfg) {
    const font = cfg.font || 'Inter';
    const fontUrl = 'https://fonts.googleapis.com/css2?family=' + font.replace(/ /g, '+') + ':wght@300;400;500;600;700&display=swap';
    const n = cfg.slideCount || 12;
    const p700 = String(cfg.primary700 || '#00579D').toUpperCase();
    const theme = (cfg.theme || '').trim() || '[preencha o tema no painel Conteúdo]';
    const S = '<' + '/script>'; // evita fechar a tag <script> do app

    return `# PAPEL E OBJETIVO
Você é um especialista em design de apresentações corporativas e desenvolvimento front-end.
Gere uma apresentação de slides completa, visualmente impactante e interativa, entregue como um único arquivo HTML autocontido, com Tailwind CSS (via CDN) e JavaScript puro. Não use React nem qualquer framework.

# ETAPA 1 — PESQUISA E COLETA DE INFORMAÇÕES
1. O tema central está em ENTRADA DO USUÁRIO.
2. Se você tiver uma ferramenta de busca na web NESTA conversa, pesquise dados, estatísticas, fatos e contexto atualizados sobre o tema. Se não tiver, NÃO diga que pesquisou: use apenas os anexos, o contexto e conhecimento geral consolidado, e trate números que não vierem dos anexos como NÃO TOTALMENTE CONFIRMADOS.
3. Prioridade: anexos e contexto do usuário; depois fontes confiáveis (sites institucionais, relatórios técnicos, publicações reconhecidas).
4. Classifique cada dado: CONFIRMADO (fonte confiável) ou NÃO TOTALMENTE CONFIRMADO (fonte fraca ou sem confirmação dupla).
5. Não invente dados. Em slides com dados não confirmados, inclua uma nota discreta: "Nota: esta informação não pôde ser totalmente confirmada no momento da geração."

# ETAPA 2 — ESTRUTURA (Regra dos 3 de Steve Jobs)
- ATO 1, abertura: contexto, problema ou oportunidade.
- ATO 2, desenvolvimento: exatamente 3 ideias centrais, cada uma com seu grupo de slides.
- ATO 3, conclusão: síntese, chamada para ação e "One More Thing" (insight final inesperado).
- Defina 3 mensagens principais que o público deve lembrar; cada seção do ATO 2 corresponde a uma delas.
- Cada slide carrega 1 ideia, com no máximo 1 frase de impacto e dados visuais de apoio.
- O slide de conclusão tem uma frase única e memorável.

# ETAPA 3 — PADRÕES TED
- Conteúdo: 1 ideia por slide; o slide reforça o palestrante, não o substitui.
- Texto: mínimo; palavras-chave, frases curtas e números em destaque.
- Visual: ícones Lucide.
- Tipografia: ${font}, títulos grandes e em negrito.
- Cores: paleta abaixo; cor principal primary-700 (${p700}).
- Narrativa: Problema → Tensão → Solução → Impacto.
- Layout: limpo, consistente, muito espaço em branco, alinhado em grid.
- Animações: fade suave entre slides; nada chamativo.

# ETAPA 4 — ESTILO VISUAL OBRIGATÓRIO
## CDNs (use exatamente estas)
<script src="https://cdn.tailwindcss.com/3.4.16">${S}
<script src="https://unpkg.com/lucide@1.65.0/dist/umd/lucide.min.js">${S}
<link href="${fontUrl}" rel="stylesheet">
PROIBIDO: cdnjs.cloudflare.com.

## Paleta (configure exatamente assim no tailwind.config)
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: ${JSON.stringify(cfg.colors || {}, null, 2)},
      fontFamily: { sans: ['${font}', 'sans-serif'] }
    }
  }
}
${S}

## Semântica de cor
- Ação principal: primary (bg-primary-700 text-white) · Erro: negative · Sucesso: positive
- Alerta: warning · Informativo: info · Neutro: neutral · Destaque âmbar: secondary · Destaque de apoio: tertiary

## Tipografia
- ${font} aplicada via fontFamily.sans. Títulos font-bold (text-4xl a text-7xl); corpo font-medium ou font-light.
- No máximo 2 tamanhos de fonte por slide.

## Logo
Use este SVG inline na capa, no encerramento e, pequeno, nos demais slides:
${cfg.logoSvg || ''}

## Padrões visuais
- Fundo claro, textos em primary e neutral escuros; estética industrial e minimalista.
- Evite glassmorphism e gradientes; use grid, alinhamento consistente e espaço em branco.
- Responsividade: unidades relativas (%, vw, vh, clamp) para a mesma experiência em telas de 1024px ou mais.

# ETAPA 5 — ESPECIFICAÇÕES TÉCNICAS
Stack: HTML5 semântico em arquivo único; Tailwind via CDN; Lucide via unpkg; JavaScript puro; sem backend.

## Estrutura do HTML (obrigatória: o editor visual e a exportação dependem dela)
- Todos os slides ficam dentro de <main id="deck">, cada um como <section class="slide">, na ordem da apresentação.
- Os slides ficam empilhados (position: absolute; inset: 0) e só o slide visível tem a classe "active"; os demais ficam com opacity 0 e visibility hidden. A troca de slide é feita apenas trocando a classe "active", com transição de opacidade.
- O JavaScript obtém a lista com document.querySelectorAll('#deck > .slide') a cada navegação (o editor pode adicionar, remover e reordenar slides).
- Textos em elementos simples (h1, h2, h3, p, li, span) e sem texto solto fora de tags.
- Os números animados exibem o valor final no próprio texto (ex.: <span data-count="72">72</span>); o script zera e anima ao entrar no slide.
- Todos os controles (barra de progresso, paginação, botões, toggles) ficam fora do #deck e têm a classe "no-print".

## Funcionalidades obrigatórias
- Navegação pelas setas ← → do teclado e por clique nos botões.
- Indicador de progresso do avanço na apresentação.
- Transição suave (fade) entre slides via CSS transition.
- Capa com título, subtítulo e data (${cfg.today || ''}).
- Encerramento com frase de impacto e chamada para ação.
- lucide.createIcons() chamado após o DOM estar pronto.

## Exportação em PDF (obrigatória)
Inclua regras @media print em que:
- @page { size: 13.333in 7.5in; margin: 0 }
- todos os slides ficam visíveis (opacity 1, visibility visible), em fluxo normal (position relative, sem transform), cada um com 13.333in × 7.5in e break-after: page;
- .no-print { display: none !important } e as cores de fundo são preservadas (print-color-adjust: exact).
- No evento beforeprint, os contadores exibem o valor final.

## Componentes solicitados
${componentsText(cfg.components)}

# ETAPA 6 — ROTEIRO (${n} slides no total)
Use exatamente ${n} slides, nesta ordem:
1. CAPA: título impactante, subtítulo e data.
2. AGENDA: os 3 grandes temas da jornada.
3. ATO 1: contexto ou problema (1 a 2 slides).
4. ATO 2: para cada uma das 3 ideias, 1 slide com título, dado principal e visual; se houver espaço, 1 slide de aprofundamento (evidência, exemplo ou caso real).
5. ATO 3: síntese (as 3 mensagens), chamada para ação e "One More Thing".
6. ENCERRAMENTO: frase memorável e fontes das informações. Liste só fontes reais: os anexos pelo nome e páginas que você efetivamente consultou. Nunca invente títulos, autores ou links.
Ajuste a quantidade de slides de aprofundamento para fechar exatamente ${n}. Se ${n} for pequeno, combine slides (por exemplo, síntese e chamada para ação juntas), mantendo capa, as 3 ideias e encerramento.

# ETAPA 7 — CHECKLIST ANTES DE ENTREGAR
[ ] 1 ideia por slide e texto mínimo?
[ ] 3 mensagens principais claras e fluxo narrativo?
[ ] Dados não confirmados marcados com a nota discreta?
[ ] Paleta configurada e primary-700 = ${p700}?
[ ] CDNs obrigatórias presentes e nenhuma cdnjs?
[ ] Estrutura #deck > section.slide, classe "active" e controles "no-print"?
[ ] Regras @media print presentes?
[ ] lucide.createIcons() chamado e fonte ${font} aplicada?

# ENTRADA DO USUÁRIO
Tema da apresentação: ${theme}
Público-alvo: ${(cfg.audience || '').trim() || 'Não informado'}
Tom de voz: ${cfg.tone || 'Corporativo'}
Idioma da apresentação: ${LANG_NAMES[cfg.lang] || cfg.lang || 'Português (Brasil)'}
Informações adicionais: ${(cfg.context || '').trim() || 'Nenhuma.'}

# ANEXOS (conteúdo integral; priorize estes dados)
${attachmentsText(cfg.attachments)}

# SAÍDA ESPERADA
Retorne APENAS o código HTML completo de presentation.html, começando em <!DOCTYPE html> e terminando em </html>. Sem markdown, sem crases e sem explicações.`;
  }

  /**
   * Prompt para reescrever UM slide de uma apresentação existente.
   * cfg: { instruction, slideHtml, index, total, deckTitle, outline: [títulos], themeConfig, font, lang }
   */
  function buildSlidePrompt(cfg) {
    const outline = (cfg.outline || []).map((t, i) => (i === cfg.index ? '→ ' : '  ') + (i + 1) + '. ' + (t || '(sem título)')).join('\n');
    return `# Tarefa: reescrever UM slide de uma apresentação existente

Você vai receber o HTML de um único slide (elemento <section>) e um pedido do usuário.
Devolva o MESMO slide reescrito conforme o pedido, pronto para substituir o original.

## Pedido do usuário
${String(cfg.instruction || '').trim()}

## Contexto da apresentação
- Título: ${cfg.deckTitle || 'Apresentação'}
- Este é o slide ${cfg.index + 1} de ${cfg.total}
- Idioma do conteúdo: ${LANG_NAMES[cfg.lang] || cfg.lang || 'Português (Brasil)'} (mantenha o idioma do slide, a menos que o pedido diga outro)
- Fonte da marca: ${cfg.font || 'Inter'}
- Roteiro (títulos dos slides):
${outline || '  (sem roteiro)'}

## Tema Tailwind disponível (cores e fontes da marca)
A apresentação usa o Tailwind via CDN com esta configuração. Use estas classes de cor (ex.: text-primary-700, bg-secondary-500, bg-neutral-50):
\`\`\`js
${cfg.themeConfig || 'tailwind.config = {}'}
\`\`\`

## Regras obrigatórias
1. Responda SOMENTE com o elemento <section ...>...</section>. Sem markdown, sem crases, sem comentários, sem texto antes ou depois.
2. Mantenha a tag <section> e a classe "slide" do original. Não adicione scripts, estilos globais, <html>, <head> ou <body>.
3. O slide ocupa a tela inteira (1280×720, proporção 16:9). Todo o conteúdo precisa caber nele, sem rolagem e sem cortar texto.
   Use tamanhos relativos (vw) ou as classes do Tailwind; prefira posicionamento com flex/grid ou position:absolute com %.
4. Ícones: use apenas Lucide no formato <i data-lucide="nome-do-icone"></i>.
5. Imagens: o atributo src="ssw-img:N" representa uma imagem que já existe. Mantenha exatamente esse valor se quiser manter a imagem.
   Não invente URLs de imagens.
6. Siga a identidade visual da apresentação: mesmas cores do tema, hierarquia clara, uma ideia por slide, frases curtas, contraste legível.
7. Não invente números ou fatos. Se o pedido exigir dados novos, pesquise em fontes confiáveis; se não puder confirmar, escreva de forma qualitativa.
8. Atributos data-count, data-target e similares (contadores animados) podem ser mantidos; o número visível deve ser igual ao do atributo.

## HTML atual do slide
${cfg.slideHtml}
`;
  }

  global.SSWPrompt = { buildPrompt, buildSlidePrompt, LANG_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildPrompt, LANG_NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
