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
Tema da apresentação: Motores Comerciais e Appliances
Público-alvo: Diretoria
Tom de voz: Corporativo
Idioma da apresentação: Português (Brasil)
Informações adicionais: Introdução(histórico, linha de atuação da unidade, etc)
Linha de produto(geral e focar em um específico) (Linha de produto: Motores Comerciais e Appliance) (O motor em foco será o w22 correspondente a linha de produto)
Principais clientes e principais concorrentes
Inovações tecnológicas(últimos lançamentos, novas tecnologias)
Descrição de um processo de fabricação relevante
Conclusão(fechamento geral)

# ANEXOS (conteúdo integral; priorize estes dados)
=== ANEXO: Pesquisa_Motores_Comerciais_Appliance_WEG.pdf ===
--- Página 1 ---
PESQUISA PARA APRESENTAÇÃO

Motores Comerciais
e Appliance da WEG

Histórico, linha de produtos, motor W22, clientes, inovação
tecnológica e fabricação.

WEG MOTORES W22 EFICIÊNCIA ENERGÉTICA

FONTES PRINCIPAIS

Site institucional WEG • Relações com Investidores • Catálogos técnicos e notícias oficiais

03 de novembro de 2026

--- Página 2 ---
WEG | MOTORES COMERCIAIS E APPLIANCE

Pesquisa técnica • 03/11/2026 02

01 / PESQUISA

Introdução: histórico e atuação

A WEG foi fundada em 16 de setembro de 1961, em Jaraguá do Sul, Santa Catarina, por Werner Ricardo
Voigt, Eggon João da Silva e Geraldo Werninghaus. Originalmente chamada Eletromotores Jaraguá, a
empresa começou fabricando motores elétricos e, com o passar dos anos, diversificou seus negócios para
automação industrial, geração e distribuição de energia, transformadores e soluções eletroeletrônicas.

Marcos de sua trajetória

• 1961: fundação da empresa em Jaraguá do Sul (SC).

• Década de 1970: expansão das exportações e da padronização técnica dos motores.

• Décadas de 1980 e 1990: diversificação industrial e fortalecimento internacional.

• Décadas de 2000 e 2010: expansão global e desenvolvimento de motores mais eficientes.

• 2020 em diante: investimentos em eficiência energética, digitalização e novas tecnologias.

• 2026: apresentação do W22 Prime, com versões industriais de eficiência até IE5.

Atuação de Motores Comerciais e Appliance (MCA)

A área de Motores Comerciais e Appliance é uma das grandes áreas de negócios da WEG. Desenvolve
motores para eletrodomésticos, equipamentos comerciais e aplicações residenciais, incluindo lavadoras
de roupas, aparelhos de ar-condicionado, ventiladores e sistemas de bombeamento.

A linha exige produtos compactos e confiáveis, com atenção ao consumo de energia, ao custo de
fabricação e às demandas de fabricantes de equipamentos.

Indicadores divulgados pela WEG sobre 2025

Receita líquida de aproximadamente R$ 40,8 bilhões; presença fabril em 18 países; produção de mais de 19
milhões de motores por ano. Os valores se referem ao período divulgado pela empresa.

--- Página 3 ---
WEG | MOTORES COMERCIAIS E APPLIANCE

Pesquisa técnica • 03/11/2026 03

02 / PESQUISA

Linha de produtos e motor W22

A área de Motores Comerciais e Appliance reúne diferentes soluções para aplicações comerciais,
residenciais e eletrodomésticos. Sua variedade atende fabricantes que precisam de desempenho,
durabilidade e integração aos próprios equipamentos.

Principais segmentos

Segmento Aplicações e características

Motores Appliance Lavadoras, secadoras, centrífugas e condicionadores de ar; podem empregar
tecnologias BLDC, ímãs permanentes e acionamento direto.

Motores Comerciais Bombas de água, sistemas de ventilação, portões, betoneiras, máquinas de
limpeza e aplicações rurais; incluem versões monofásicas.

Produto em foco: W22 monofásico - IP55

O W22 monofásico é um motor projetado para aplicações comerciais e rurais. Utiliza carcaça de ferro
fundido e pode apresentar diferentes configurações de capacitores, de acordo com a aplicação. Sua
proteção IP55 oferece resistência à entrada prejudicial de poeira e a jatos de água.

Característica Especificação conforme versão

Tipo Motor elétrico monofásico

Potência para uso rural 1 a 12,5 cv

Capacitor permanente 1/8 a 3 cv

Frequência 50 ou 60 Hz

Carcaça Ferro fundido

Grau de proteção IP55

Capacitores De partida e/ou permanente

Principais aplicações: bombas, ventiladores, compressores, trituradores, guinchos, transportadores e
máquinas agrícolas.

--- Página 4 ---
WEG | MOTORES COMERCIAIS E APPLIANCE

Pesquisa técnica • 03/11/2026 04

03 / PESQUISA

Principais clientes e concorrentes

A WEG fornece motores para fabricantes de eletrodomésticos, sistemas de bombeamento,
equipamentos comerciais e aplicações industriais. A empresa não publica necessariamente uma
classificação aberta de seus maiores compradores por participação no faturamento. Por isso, os nomes
abaixo são exemplos de relações comerciais divulgadas, e não um ranking.

Clientes e relações comerciais identificadas

Whirlpool

Fabricante de eletrodomésticos, incluindo marcas como Brastemp e Consul. Em 2021, reconheceu a WEG como
fornecedora do ano na categoria de tintas e motores elétricos.

Electrolux

Fabricante global de eletrodomésticos. Em 2020, concedeu à WEG o prêmio de Melhor Fornecedor Global, com
reconhecimento por qualidade, inovação e sustentabilidade.

DHTS

Exemplo de aplicação do W22 industrial em sistemas de resfriamento. Em um projeto divulgado pela WEG,
foram especificados 496 motores de 37 e 45 kW, com fornecimentos previstos até 2026.

Concorrentes por segmento

Empresa Principal área de comparação

Nidec Motores para eletrodomésticos, climatização, bombas e equipamentos
comerciais.

ABB Motores industriais de alta eficiência; comparação mais próxima às versões
trifásicas W22.

Siemens Motores industriais, incluindo produtos da família SIMOTICS.

Como interpretar a concorrência

A Nidec tem relação mais direta com a área de Motores Comerciais e Appliance. ABB e Siemens são
comparações principalmente na área industrial. Essa divisão é uma análise dos portfólios, não uma
classificação oficial da WEG.

--- Página 5 ---
WEG | MOTORES COMERCIAIS E APPLIANCE

Pesquisa técnica • 03/11/2026 05

04 / PESQUISA

Inovações tecnológicas

Os desenvolvimentos recentes da WEG priorizam eficiência energética, redução de perdas, menor custo
operacional, controle eletrônico e processos produtivos mais modernos. Os exemplos a seguir foram
divulgados pela empresa.

W22 Prime (2026)

Nova evolução da plataforma W22 industrial. A linha alcança classes de eficiência IE4 e IE5 utilizando
tecnologia de indução. Foi projetada para reduzir consumo elétrico e permitir diferentes formas de
acionamento, incluindo partida direta ou inversor de frequência.

W30 Smart EC (aplicação divulgada em 2025)

Motor com acionamento eletrônico integrado, empregado em sistemas como ventilação. Em projeto
divulgado pela WEG na Granja Ueyama, a modernização do conjunto resultou em economia de energia
superior a 48%.

Motores de ímãs permanentes para ar-condicionado

Em 2023, a WEG anunciou R$ 48 milhões para ampliar instalações em Manaus e preparar a produção de
motores de velocidade variável para aparelhos de ar-condicionado split. A tecnologia favorece controle
de velocidade, eficiência e menor ruído.

Expansão da produção em Linhares (2025)

A WEG anunciou cerca de R$ 160 milhões de investimentos em Linhares (ES), incluindo nova fábrica de
fios para motores elétricos. A estrutura foi projetada para ampliar integração produtiva e
competitividade, com operação prevista para 2027.

Síntese

A inovação acontece em duas frentes: melhoria técnica dos motores e modernização da fabricação. O
objetivo é obter equipamentos eficientes, confiáveis e competitivos.

--- Página 6 ---
WEG | MOTORES COMERCIAIS E APPLIANCE

Pesquisa técnica • 03/11/2026 06

05 / PESQUISA

Processo relevante de fabricação

A fabricação de um motor elétrico envolve processos mecânicos, elétricos e de controle de qualidade. O
fluxo apresentado abaixo é uma sequência típica simplificada dessas operações, não a descrição
exclusiva de uma fábrica ou modelo W22.

01
Preparação das peças

Carcaças, eixos e outros componentes metálicos são preparados e usinados.

02
Estator e rotor

Produção e preparação dos componentes eletromagnéticos fixos e móveis.

03
Bobinagem

Instalação dos fios condutores que formam os enrolamentos elétricos.

04
Isolação e impregnação

Proteção dos enrolamentos para segurança e maior durabilidade.

05
Montagem final

Instalação de eixo, rolamentos, tampas, capacitores e acessórios, conforme o projeto.

06
Ensaios e inspeção

Verificação do funcionamento e da conformidade elétrica e mecânica.

A qualidade da bobinagem, da isolação e da montagem ajuda a reduzir falhas, vibração e desgaste e influencia
diretamente a eficiência e a vida útil do motor.

06 / CONCLUSÃO

Conclusão: fechamento geral

A WEG construiu sua trajetória a partir da fabricação de motores elétricos e tornou-se uma empresa
internacional com forte atuação tecnológica. A área de Motores Comerciais e Appliance é importante por
fornecer produtos presentes no cotidiano e em diferentes atividades econômicas.

O W22 monofásico exemplifica a experiência da WEG em motores para aplicações comerciais e rurais;
as evoluções industriais da família reforçam a busca por eficiência energética. Investimentos em inovação
e produção contribuem para a competitividade da empresa e para soluções mais sustentáveis.

--- Página 7 ---
WEG | MOTORES COMERCIAIS E APPLIANCE

Pesquisa técnica • 03/11/2026 07

FONTES CONSULTADAS

Referências e fontes da pesquisa

Foram priorizados materiais institucionais da WEG, catálogos técnicos e notícias oficiais. Para a
comparação de concorrentes, utilizaram-se os portfólios das próprias fabricantes.

01. WEG. História institucional.

https://www.weg.net/institutional/US/pt/history

02. WEG. Relações com Investidores: Perfil corporativo.

https://ri.weg.net/a-weg/perfil-corporativo/

03. WEG. Isto é WEG: portfólio de produtos e soluções [PDF].

https://static.weg.net/medias/downloadcenter/hc8/h05/50020771_portuguese_web.pdf

04. WEG. Motores para aplicações comerciais e residenciais: catálogo [PDF].

https://static.weg.net/medias/downloadcenter/h71/h31/WEG-WMO-motores-aplicacoes-comerciais-e-residenciais-50
041418-catalogo-portugues-web.pdf

05. WEG. The evolution of induction motors: now reaching IE5 efficiency (W22 Prime).

https://www.weg.net/institutional/BD/en/news/products-and-solutions/the-evolution-of-induction-motors-now-reachi
ng-ie5-efficiency

06. WEG. Investimentos em motores com tecnologia de ímãs permanentes em Manaus.

https://www.weg.net/institutional/TR/pt/news/resultados-e-investimentos/weg-investe-em-nova-linha-de-motores-co
m-tecnologia-de-imas-permanentes-em-manaus

07. WEG. Construção de nova fábrica em Portugal (processos fabris).

https://developers.weg.net/institutional/BR/pt/news/resultados-e-investimentos/weg-vai-construir-nova-fabrica-em-po
rtugal

08. WEG. Portal institucional (notícias, resultados e investimentos).

https://www.weg.net/institutional/BR/pt/

09. Nidec. Portal corporativo e produtos.

https://www.nidec.com/

10. ABB. Portfólio de motores e geradores.

https://new.abb.com/motors-generators

11. Siemens. Motores SIMOTICS.

https://www.siemens.com/

Nota técnica sobre a pesquisa

As especificações variam conforme o modelo do motor. Os dados de produtos, investimentos e projetos
devem ser interpretados segundo o ano e a versão informados nas fontes, e não como características
aplicáveis a toda a linha W22.

# SAÍDA ESPERADA
Retorne APENAS o código HTML completo de presentation.html, começando em <!DOCTYPE html> e terminando em </html>. Sem markdown, sem crases e sem explicações.