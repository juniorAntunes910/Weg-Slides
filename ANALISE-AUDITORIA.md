# Análise da auditoria estática do Slide Studio WEG

Data: 03/11/2026 · Objeto auditado: `Slide Studio WEG.exe` (SHA-256 `32bbe457…23bb`).
Cada achado foi conferido no código-fonte antes de qualquer correção. Parecer:
**Procede** (problema real), **Parcial** (existe, mas menor ou diferente do descrito) ou **Já tratado**.

## Parecer por achado

| # | Achado | Parecer | O que foi feito |
|---|---|---|---|
| A1 | Sem novas tentativas na API | Procede | Novas tentativas com backoff exponencial e jitter, até 4 tentativas, respeitando `Retry-After` e `retryDelay` do Gemini. Só repete falhas transitórias (rede, 408, 429, 5xx); 400/401/403/404 e cota diária falham na hora, com mensagem clara. O usuário vê cada nova tentativa no log. |
| A2 | Sem prazo máximo | Procede | Prazo por tentativa (8 min por apresentação, 3 min por slide), somado ao botão Cancelar. Na geração por API, o tempo esgotado conta como falha transitória e entra nas novas tentativas. |
| A3 | Modelo fixo e antigo, sem validação; `temperature` fixa | Procede | Catálogo lido do provedor (`/v1beta/models` filtrado por `generateContent`; `/v1/models` na Anthropic e na OpenAI). O modelo recomendado é escolhido automaticamente, e um modelo salvo inexistente é apontado com o botão "Usar recomendado". `temperature` removida (vale o padrão de cada modelo). Padrão da Anthropic atualizado para `claude-sonnet-5-5`. |
| A4 | Geração monolítica; resposta cortada descartava tudo | Parcial | Resposta cortada pelo limite de tokens agora pede continuação (até 2 vezes) e junta as partes. Se ainda vier sem `</html>`, os slides completos são aproveitados e o usuário é avisado. O pipeline por slide, com checkpoints, fica no backlog (mudança de arquitetura). |
| A5 | Chaves de API em `localStorage` | Procede | Chaves saem do navegador: o servidor local as guarda em `%LOCALAPPDATA%\SlideStudioWEG\chaves.json`, criptografadas com a **DPAPI do Windows** (só o mesmo usuário, no mesmo PC, consegue abrir). Migração automática das chaves antigas e botão "Remover chave". Ler a chave exige o token da sessão e a origem local; o segredo vai ao PowerShell pela entrada padrão, nunca pela linha de comando. |
| A6 | Documentos saem do PC sem aviso | Procede | Janela de autorização antes de enviar a qualquer serviço externo (Kiro, Google, Anthropic, OpenAI). Ela lista os anexos, alerta sobre dados confidenciais e permite "não perguntar de novo" por destino. Vale também para "Editar com IA". |
| A7 | Modo API sem pesquisa na web | Parcial | O prompt já era condicional ("se tiver acesso à internet"). Agora o Gemini usa busca real (`google_search`) e as fontes devolvidas aparecem em "Ver fontes"; sem suporte, gera sem busca e informa. O prompt proíbe afirmar pesquisa sem ferramenta e inventar fontes. Anthropic e OpenAI seguem sem busca, e o painel diz isso. |
| A8 | Scripts de CDN e filtro `SAFE_SCRIPT` | Procede (pior que o descrito) | O filtro aceitava `cdn.tailwindcss.com.evil…`, `unpkg.com/lucide-malicioso` e `unpkg.com/lucide/../outro`; corrigido (host exato, sem `..`). Nova **CSP** nos documentos do editor, das miniaturas, da impressão e da apresentação: `connect-src 'none'`, sem frames nem formulários, scripts só dos CDNs permitidos. Testado: um `fetch` para fora, feito de dentro da apresentação, é bloqueado. Versões fixadas: Tailwind 3.4.16 e Lucide 1.65.0. O `@latest` já tinha mudado para 1.67.0, diferente da versão embutida no app. Decks antigos são atualizados ao abrir. |
| A9 | PPTX parcialmente editável | Já tratado | Já havia os modos "textos editáveis" e "só imagens", e as limitações estão no README. Fidelidade medida no PowerPoint 16 (24 de 24 textos). |
| A10 | Sem validação da saída | Procede | Depois de gerar ou editar com IA: confere a quantidade de slides em relação ao pedido e roda uma verificação dentro do slide, que aponta conteúdo saindo da área ou texto cortado, com o atalho "Ir para o slide N". |
| A11 | Limite de anexos silencioso | Parcial | O corte por arquivo (100 mil caracteres) já aparecia; o corte global (300 mil) era silencioso. Agora a janela de envio lista o que não será lido pela IA, mesmo com "não perguntar de novo" marcado. |
| A12 | Depende de internet para o visual | Procede (limitação) | Mitigado com as versões fixas. Exportar HTML 100% offline (embutir Tailwind, Lucide e fontes) fica no backlog. |
| A13 | Jobs do Kiro sem descarte | Procede | Jobs terminados saem da memória após 30 min (cada um guardava até 3 MB). Gerações que estavam "em andamento" quando o app fechou passam a "interrompida" ao abrir, em vez de ficarem "gerando…" para sempre. |

Proteções que a auditoria listou como existentes foram conferidas e mantidas: escuta só em 127.0.0.1, checagem de Host/Origin, token de sessão, limite de corpo, iframes sem `allow-same-origin` e ferramentas do Kiro restritas.

## Evidências (testes automatizados, 03/11/2026)

- **Cliente de IA (21 cenários, API simulada):** 503→503→200; 429 com `Retry-After`; cota diária; 400/401/403/404 sem repetir; requisição que nunca termina; cancelamento; resposta cortada com continuação; busca e queda da busca; queda de rede; catálogo de modelos.
- **Ponta a ponta no app (25 verificações, Google interceptado no navegador):** migração e criptografia da chave; acesso à chave sem token ou de outro site (403); modelo inválido apontado; autorização antes do envio; 503 seguido de sucesso; modelo do catálogo, busca e sem `temperature`; CDNs fixadas; filtro e CSP no editor; Tailwind funcionando sob a CSP; envio de dados bloqueado na apresentação; aviso de slide estourado; fontes; corte de anexos; job interrompido.
- **Regressão:** seleção múltipla 16/16, edição por IA 13/13, PowerPoint 5/5 (24 caixas de texto), interações 9/9.

Nota sobre o ambiente de teste: no Edge sem janela, os quadros de tela às vezes não chegam e cada evento de mouse leva 5 s. Isso afetou testes de arraste, não o app. Mesmo assim, o editor ganhou um plano B de 250 ms para se declarar pronto, porque o navegador também pausa os quadros com a janela minimizada.

## Riscos residuais e backlog (por prioridade)

1. **Pipeline incremental (A4):** planejar o roteiro, gerar slide a slide com checkpoint e retomar após falha. É a maior melhoria de confiabilidade que falta.
2. **Exfiltração por imagem (A8):** a CSP permite imagens de qualquer `https:` (necessário para imagens remotas), então um deck malicioso ainda poderia vazar dados pela URL de uma imagem. Para bloquear, seria preciso servir as imagens pelo servidor local.
3. **Política de dados (A6):** a janela informa e pede autorização, mas não substitui a aprovação da empresa. A marca WEG na interface não indica aprovação institucional.
4. **HTML offline (A12)** e **formas nativas no PPTX (A9)**.
5. **Busca na Anthropic e na OpenAI (A7):** exigiria as ferramentas de busca de cada provedor.
6. **Assinatura digital do .exe:** sem ela, o Windows mostra o aviso SmartScreen e antivírus corporativos podem bloquear.
