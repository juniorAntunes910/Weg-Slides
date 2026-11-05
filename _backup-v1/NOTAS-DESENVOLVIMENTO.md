# Notas de desenvolvimento — Slide Studio WEG v2

## Pedidos do usuário (rodada atual)
1. UI mais profissional.
2. Importar PDF nos anexos.
3. "Gerar com Kiro" deve EXECUTAR o prompt de verdade (não só salvar arquivo).
4. Editor estilo Canva (edição visual direta, sem precisar de outro prompt).
5. Botão claro "Gerar slides".

## Arquitetura v2
- `server.js` (Node, sem dependências): serve o app em http://localhost:5178 e expõe
  - POST /api/generate  -> cria job, chama o Kiro CLI em modo não interativo com o prompt
  - GET  /api/jobs/:id  -> status/log/html do job (polling)
  - GET  /api/health    -> verifica se o Kiro CLI está disponível
- `index.html` + `app/*.js`: app com shell profissional (top bar, rail, painel, canvas, status bar).
- PDF: pdf.js via unpkg (pinned), extração de texto no navegador.
- Editor visual: iframe com runtime injetado (postMessage). Modelo-fonte = DOM parseado do HTML,
  cada elemento recebe data-ssw-id; edições sincronizadas para o modelo; exportação limpa os ids.
- Atalho da Área de Trabalho: inicia server + abre Edge em modo app.

## Kiro CLI (verificado)
- Caminho: %LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe
- Comando: kiro-cli chat --output-format stream-json --trust-tools=<lista> "<instrução>"
  (stream-json implica --no-interactive; cwd = pasta do job)
- Eventos JSONL: {type:"sessionUpdate", data:{update:{sessionUpdate:"tool_call"|"tool_call_update"|"agent_message_chunk"...}}}
  e no fim {type:"runFinished", data:{status, finalText, finalTextTruncated}}
- Ferramentas confiadas (mínimo necessário): read_file, fs_write, fs_append, str_replace, list_directory, remote_web_search, web_fetch
- Kiro salva presentation.html na pasta do job (mais robusto que finalText).

## Status
- [x] Verificar Kiro CLI (comando não interativo)
- [x] server.js (sintaxe ok; Kiro só com read_file + remote_web_search; HTML capturado do stream)
- [ ] index.html (UI nova) — shell: topbar | rail (Conteúdo, Design, Estrutura, Projetos) | painel | canvas | statusbar
- [ ] app/prompt.js — buildPrompt (exige section.slide + .active + .no-print + @media print)
- [ ] app/app.js — estado, painéis, anexos (pdf.js), geração (Kiro via /api, API direta, copiar)
- [ ] app/editor.js — editor visual: tira de slides, seleção, texto inline, estilos, arrastar, add/dup/del slide
- [ ] PDF import — pdfjs-dist@4.10.38 via unpkg (import dinâmico .mjs; worker via CDN wrapper do pdf.js)
- [ ] Atalho atualizado
- [ ] Testes (sintaxe, servidor, screenshot headless)
- [ ] README atualizado
