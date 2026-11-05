# Slide Studio WEG

Aplicativo para gerar apresentações de slides corporativas (HTML autocontido) a partir de um
tema + anexos, com visual configurável (cores, tipografia, componentes, logo) seguindo a
identidade WEG por padrão.

## Como abrir

Dê um duplo clique em **`index.html`** — abre no navegador, sem instalação e sem servidor.
Recomendado: Chrome ou Edge (necessários para a integração direta com a pasta do projeto).

## Fluxo de uso

1. **Configure** (coluna esquerda): paleta de cores (presets ou cor própria — a escala 50–900
   é gerada sozinha), tipografia, quantidade de slides, idioma, tom de voz, componentes
   (progressbar, paginação, swipe, modo escuro, contadores, timeline, cards comparativos) e logo.
2. **Informe a entrada** (coluna do meio): tema (obrigatório), público-alvo, contexto adicional
   e anexos (`.txt`, `.md`, `.csv`, `.json`, `.log` — arraste e solte).
3. **Gere** (coluna direita) por um dos três caminhos abaixo.

## As 3 formas de gerar

### 1. Gerar com Kiro (recomendado)
- Clique em **Conectar pasta** e escolha a pasta `slide-studio-weg` (só precisa fazer 1 vez por sessão).
- Clique em **Gerar com Kiro** — o app salva o prompt completo como `prompt-gerado.md` na pasta.
- No Kiro, diga: **"gere a apresentação a partir do prompt-gerado.md"**.
- Eu leio o prompt, pesquiso o tema se necessário e devolvo o `presentation.html` pronto.

> Se seu navegador não permitir conectar a pasta, o app baixa o `prompt-gerado.md` e copia o
> texto — salve o arquivo nesta pasta ou cole o conteúdo direto no Kiro.

### 2. Copiar prompt
Clique em **Copiar prompt** e cole em qualquer IA (Kiro, ChatGPT, Claude, Gemini).
Funciona sempre, sem chave e sem custo.

### 3. Gerar via API
Cadastre uma chave em **Configurar chave de API** e clique em **Gerar via API**:
- **Google Gemini** — tem cota gratuita: https://aistudio.google.com/app/apikey
- **Anthropic (Claude)** — https://console.anthropic.com/settings/keys
- **OpenAI (ChatGPT)** — https://platform.openai.com/api-keys

A chave fica salva apenas no seu navegador (localStorage). O resultado aparece no preview
da aba **Resultado**, com botões para baixar o `presentation.html` ou abrir em nova aba.

## Editando a apresentação depois de gerada

Duas opções:

1. **Aba Editor (no app):** mostra o código HTML da apresentação gerada (ou carregada via
   "Carregar HTML existente"). Edite o código, clique em **Aplicar** e veja o preview
   atualizar. Depois é só baixar o `presentation.html`.
2. **Pedir ao Kiro:** me diga o que mudar em linguagem natural — ex.:
   - *"no slide 3, troque o gráfico por um card comparativo"*
   - *"muda a cor primária da apresentação XPTO.html para #0B8A45"*
   - *"adiciona um slide de timeline entre o 5 e o 6"*

## Exportando

- **HTML** — botão "Baixar presentation.html" na aba Resultado.
- **PDF** — botão "Exportar PDF": abre a apresentação em nova aba já com a janela de
  impressão; escolha "Salvar como PDF" (cada slide vira uma página).

## Roadmap (próximas evoluções)

- **Editor visual estilo Canva:** clicar direto no slide para editar textos, trocar ícones,
  mover blocos e recolorir elementos sem tocar no código — camada de edição sobre o preview,
  salvando de volta no HTML. (É a próxima iteração planejada; me peça quando quiser.)
- **Exportar para PPTX:** conversão dos slides para PowerPoint editável.
- **Galeria de templates:** layouts prontos de slides (capa, dados, comparativo, timeline)
  para compor apresentações ainda mais rápido.

## Sobre os anexos

- Formatos lidos: `.txt`, `.md`, `.csv`, `.json`, `.log` (o conteúdo entra integralmente no prompt).
- **PDF não é lido diretamente** pelo navegador — copie o texto do PDF e cole em
  "Contexto adicional" (ou salve como `.txt` e anexe).
- Arquivos acima de 100 mil caracteres são truncados.

## Arquivos desta pasta

| Arquivo           | Para que serve                                                              |
|-------------------|-----------------------------------------------------------------------------|
| `index.html`      | O aplicativo (arquivo único, autocontido)                                   |
| `agente-base.md`  | Especificação de referência do agente gerador (as regras de geração)        |
| `prompt-gerado.md`| Criado pelo botão "Gerar com Kiro" — é o que eu leio para gerar os slides   |
| `README.md`       | Este arquivo                                                                |

## Privacidade

Tudo roda localmente no seu navegador. Nenhum dado é enviado a servidores — exceto, no modo
"Gerar via API", o conteúdo do prompt para o provedor de IA que você escolher.
