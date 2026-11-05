# PAPEL E OBJETIVO
Você é um especialista em design de apresentações corporativas e desenvolvimento front-end.
Gere uma apresentação de slides completa, visualmente impactante e interativa, entregue como um único arquivo HTML autocontido, com Tailwind CSS (via CDN) e JavaScript puro. Não use React nem qualquer framework.

# ETAPA 1 — PESQUISA E COLETA DE INFORMAÇÕES
1. O tema central está em ENTRADA DO USUÁRIO.
2. Se tiver acesso à internet, pesquise dados, estatísticas, fatos e contexto atualizados sobre o tema. Sem acesso, use apenas os anexos, o contexto e conhecimento geral consolidado.
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
- Tipografia: Inter, títulos grandes e em negrito.
- Cores: paleta abaixo; cor principal primary-700 (#00579D).
- Narrativa: Problema → Tensão → Solução → Impacto.
- Layout: limpo, consistente, muito espaço em branco, alinhado em grid.
- Animações: fade suave entre slides; nada chamativo.

# ETAPA 4 — ESTILO VISUAL OBRIGATÓRIO
## CDNs (use exatamente estas)
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
PROIBIDO: cdnjs.cloudflare.com.

## Paleta (configure exatamente assim no tailwind.config)
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
  "primary": {
    "50": "#F0F5FA",
    "100": "#E2EEF8",
    "200": "#BBDCF7",
    "300": "#81C3F8",
    "400": "#3DA9FF",
    "500": "#0A92FF",
    "600": "#007CE0",
    "700": "#00579D",
    "800": "#005599",
    "900": "#00447A"
  },
  "secondary": {
    "50": "#FAF6F0",
    "100": "#F8F0E2",
    "200": "#F6E1BC",
    "300": "#F7CD82",
    "400": "#FDB93F",
    "500": "#FCA60D",
    "600": "#DE8F03",
    "700": "#FCA304",
    "800": "#976202",
    "900": "#794E01"
  },
  "tertiary": {
    "50": "#F5F3F6",
    "100": "#EEEAF1",
    "200": "#DACFE2",
    "300": "#BFAACF",
    "400": "#A280BC",
    "500": "#8A5EAB",
    "600": "#754D93",
    "700": "#9F7BBA",
    "800": "#503564",
    "900": "#402A50"
  },
  "positive": {
    "50": "#EFFEF5",
    "100": "#D9FFE9",
    "200": "#7DF8B2",
    "300": "#7DF8B2",
    "400": "#3DEB89",
    "500": "#13CE66",
    "600": "#09B054",
    "700": "#0B8A45",
    "800": "#0F6C39",
    "900": "#0E5932"
  },
  "negative": {
    "50": "#FFF1F1",
    "100": "#FFDFDF",
    "200": "#FFC5C5",
    "300": "#FF9D9D",
    "400": "#FF6464",
    "500": "#FF4949",
    "600": "#ED1515",
    "700": "#C80D0D",
    "800": "#A50F0F",
    "900": "#881414"
  },
  "warning": {
    "50": "#FFFFE7",
    "100": "#FEFFC1",
    "200": "#FFFD86",
    "300": "#FFF441",
    "400": "#FFE50D",
    "500": "#FFD600",
    "600": "#D19D00",
    "700": "#A67102",
    "800": "#89570A",
    "900": "#74470F"
  },
  "info": {
    "50": "#EBFDFF",
    "100": "#CDF6FF",
    "200": "#8AE8FF",
    "300": "#62DDFE",
    "400": "#1BC4F5",
    "500": "#00A7DB",
    "600": "#0284B8",
    "700": "#0A6A94",
    "800": "#125778",
    "900": "#134766"
  },
  "neutral": {
    "50": "#F8FAFC",
    "100": "#F1F5F9",
    "200": "#E2E8F0",
    "300": "#CBD5E1",
    "400": "#94A3B8",
    "500": "#64748B",
    "600": "#475569",
    "700": "#334155",
    "800": "#1E293B",
    "900": "#0F172A"
  }
},
      fontFamily: { sans: ['Inter', 'sans-serif'] }
    }
  }
}
</script>

## Semântica de cor
- Ação principal: primary (bg-primary-700 text-white) · Erro: negative · Sucesso: positive
- Alerta: warning · Informativo: info · Neutro: neutral · Destaque âmbar: secondary · Destaque de apoio: tertiary

## Tipografia
- Inter aplicada via fontFamily.sans. Títulos font-bold (text-4xl a text-7xl); corpo font-medium ou font-light.
- No máximo 2 tamanhos de fonte por slide.

## Logo
Use este SVG inline na capa, no encerramento e, pequeno, nos demais slides:
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5991 4192"><g fill="#0064A6"><polygon points="461,466 461,2795 922,2795 922,932 1383,932 1383,2795 1844,2795 1844,932 2304,932 2304,3261 0,3261 0,0 5991,0 5991,466 "/><path d="M4148 2329l0 -1397 -1383 0 0 2329 1383 0 0 -466 -922 0 0 -466 922 0zm-461 -466l-461 0 0 -466 461 0 0 466z"/><path d="M5991 932l-1382 0 0 2329 922 0 0 466 -5531 0 0 465 5991 0 0 -3260zm-461 1863l-461 0 0 -1398 461 0 0 1398z"/></g></svg>

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
- Capa com título, subtítulo e data (3 de novembro de 2026).
- Encerramento com frase de impacto e chamada para ação.
- lucide.createIcons() chamado após o DOM estar pronto.

## Exportação em PDF (obrigatória)
Inclua regras @media print em que:
- @page { size: 13.333in 7.5in; margin: 0 }
- todos os slides ficam visíveis (opacity 1, visibility visible), em fluxo normal (position relative, sem transform), cada um com 13.333in × 7.5in e break-after: page;
- .no-print { display: none !important } e as cores de fundo são preservadas (print-color-adjust: exact).
- No evento beforeprint, os contadores exibem o valor final.

## Componentes solicitados
- Barra de progresso fina, fixa no topo, que avança conforme o slide atual.
- Paginação "X / N" e botões Anterior/Próximo (ícones Lucide chevron-left/chevron-right) fixos na parte inferior.
- Navegação por gestos de swipe (touchstart/touchend) em telas sensíveis ao toque.
- Números-chave com animação de contagem ao entrar no slide.
- Cards comparativos (antes vs. depois, problema vs. solução), quando fizerem sentido.

# ETAPA 6 — ROTEIRO (12 slides no total)
Use exatamente 12 slides, nesta ordem:
1. CAPA: título impactante, subtítulo e data.
2. AGENDA: os 3 grandes temas da jornada.
3. ATO 1: contexto ou problema (1 a 2 slides).
4. ATO 2: para cada uma das 3 ideias, 1 slide com título, dado principal e visual; se houver espaço, 1 slide de aprofundamento (evidência, exemplo ou caso real).
5. ATO 3: síntese (as 3 mensagens), chamada para ação e "One More Thing".
6. ENCERRAMENTO: frase memorável e fontes das informações.
Ajuste a quantidade de slides de aprofundamento para fechar exatamente 12. Se 12 for pequeno, combine slides (por exemplo, síntese e chamada para ação juntas), mantendo capa, as 3 ideias e encerramento.

# ETAPA 7 — CHECKLIST ANTES DE ENTREGAR
[ ] 1 ideia por slide e texto mínimo?
[ ] 3 mensagens principais claras e fluxo narrativo?
[ ] Dados não confirmados marcados com a nota discreta?
[ ] Paleta configurada e primary-700 = #00579D?
[ ] CDNs obrigatórias presentes e nenhuma cdnjs?
[ ] Estrutura #deck > section.slide, classe "active" e controles "no-print"?
[ ] Regras @media print presentes?
[ ] lucide.createIcons() chamado e fonte Inter aplicada?

# ENTRADA DO USUÁRIO
Tema da apresentação: Colonização do Brasil
Público-alvo: Diretoria
Tom de voz: Corporativo
Idioma da apresentação: Português (Brasil)
Informações adicionais: Colonização do Brasil: contexto
Antecedentes (antes de 1500)

Portugal era pioneiro nas Grandes Navegações: Estado centralizado cedo, posição atlântica, domínio da navegação (caravela, astrolábio) e busca por rota às Índias para contornar o monopólio comercial italiano/otomano sobre as especiarias. O Tratado de Tordesilhas (1494) dividiu as terras “descobertas” entre Portugal e Espanha.

Período Pré-Colonial (1500–1530)
1500: chegada de Pedro Álvares Cabral. Povos indígenas já habitavam o território (estimativas de 2 a 5 milhões de pessoas, Tupi e Macro-Jê, entre outros).
Portugal priorizava o comércio com as Índias, então houve pouco povoamento.
Exploração do pau-brasil por escambo com indígenas, em feitorias no litoral.
Ameaça de franceses e outros contrabandistas na costa.
Início da colonização efetiva (1530–1549)

Para defender o território e garantir a posse, Portugal passou a ocupá-lo:

1530: expedição de Martim Afonso de Sousa; 1532: fundação de São Vicente.
Capitanias Hereditárias (1534): terras divididas em 15 faixas doadas a donatários, que financiavam a ocupação. A maioria fracassou (falta de recursos, ataques indígenas, distância); prosperaram São Vicente e Pernambuco.
Governo-Geral (1549)
Criado para centralizar a administração; primeiro governador: Tomé de Sousa, que fundou Salvador (capital até 1763).
Chegada dos jesuítas (Manuel da Nóbrega, José de Anchieta): catequese, educação e fundação de aldeamentos, em tensão com colonos que queriam escravizar indígenas.
Economia colonial

Açúcar (séc. XVI–XVII)

Base do sistema de plantation: latifúndio, monocultura, mão de obra escrava, produção para exportação.
Concentrado no Nordeste (Pernambuco e Bahia).

Mão de obra

Início: escravização de indígenas.
Depois: tráfico de africanos escravizados, lucrativo para a Coroa e comerciantes. Estima-se que cerca de 4,8 milhões foram trazidos ao Brasil, o maior destino do tráfico atlântico.

Pecuária: interiorização pelo sertão, ligada aos engenhos.

Expansão territorial
Bandeiras (séc. XVII): expedições paulistas que capturavam indígenas, buscavam metais e ampliaram as fronteiras para além de Tordesilhas.
União Ibérica (1580–1640): Portugal sob a Espanha, o que tornou Tordesilhas irrelevante na prática.
Invasões estrangeiras: França (Rio de Janeiro e Maranhão) e Holanda (Nordeste, 1630–1654, com Maurício de Nassau). Os holandeses foram expulsos na Insurreição Pernambucana.
Ciclo do ouro (séc. XVIII)
Descoberta em Minas Gerais (~1693), com mineração e urbanização do interior.
Cobrança do quinto e das derramas; Casas de Fundição.
Deslocamento do eixo econômico para o Sudeste; capital transferida para o Rio de Janeiro (1763).
Tratado de Madri (1750): reconheceu a ocupação real e definiu contornos próximos do Brasil atual (princípio do uti possidetis).
Resistências e revoltas
Resistência indígena (ex.: Confederação dos Tamoios) e quilombos (Palmares, com Zumbi).
Revoltas nativistas: Beckman (1684), Emboabas (1708), Mascates (1710), Vila Rica (1720).
Conjurações: Mineira (1789) e Baiana (1798), já com influência iluminista.
Fim do período colonial
1808: a família real portuguesa foge de Napoleão e chega ao Rio; abertura dos portos às “nações amigas”.
1815: Brasil elevado a Reino Unido.
1822: Independência.
Consequências duradouras

Concentração de terra, desigualdade social, escravidão estrutural, genocídio e apagamento de povos indígenas, e uma economia voltada à exportação de matérias-primas, heranças ainda debatidas na sociedade brasileira.

Se quiser, posso aprofundar algum período ou montar um resumo no formato de prova.

# ANEXOS (conteúdo integral; priorize estes dados)
Nenhum anexo fornecido.

# SAÍDA ESPERADA
Retorne APENAS o código HTML completo de presentation.html, começando em <!DOCTYPE html> e terminando em </html>. Sem markdown, sem crases e sem explicações.