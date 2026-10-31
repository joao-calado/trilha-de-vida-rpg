# Ambiente REA + Navegador — notas de setup

> Estado em 2026-10-29. Documento de retomada: o WSL precisa reiniciar para o
> `mirrored networking` valer, e isso derruba a sessão do agente.

## 1. MCP REA (confirmado OK)

- Servidor `rea` 6.5.0, SDK 2.3.1, protocolo `2026-07-28`
- 207 tools, 6 prompts, 153 comandos CLI
- Skill `reverse-engineer-anything` (versão 42) alinhada

Providers ativos: artefatos (ZIP/APK/IPA/ASAR/DMG), .NET managed, JavaScript/Electron,
EVM, SQLite, PE resources, Go/Rust metadata, Flutter/Dart AOT, PCAP, Frida, V8 Inspector,
browser/Electron via CDP.

Providers **não** configurados (não são prioridade): Ghidra, Hopper, IDA, JADX,
apktool, adb, WABT, Binwalk/Unblob, Wakaru, tshark-fields, pwndbg/pwntools, sigrok.

## 2. Correção aplicada no Windows

O arquivo estava em `C:\Users\calado\.wlsconfig` — **nome errado**, o WSL só lê
`.wslconfig`, então era ignorado por completo. Renomeado para:

    C:\Users\calado\.wslconfig

Conteúdo atual:

```ini
[wsl2]
memory=6GB
processors=2
swap=1GB
defaultVhdSize=50GB
networkingMode=mirrored
[experimental]
autoMemoryReclaim=gradual
sparseVhd=true
```

Atenção: como o arquivo passou a ser lido, `memory=6GB` e `processors=2`
**passam a valer** após o restart. Ajuste se for pouco para o seu uso.
A chave `networkingMode` duplicada em `[experimental]` é inócua; pode remover.

## 3. Passos para ativar o Chrome do Windows

No PowerShell:

```powershell
wsl --shutdown          # derruba esta sessão do agente; reabra o DSH depois
```

Ao voltar, conferir o modo de rede (deve dizer `mirrored`, não `nat`):

```bash
wslinfo --networking-mode
```

### ATENÇÃO: Chrome 136+ bloqueia CDP no perfil padrão

Verificado nesta máquina com Chrome **156.0.8078.74**: o processo sobe com
`--remote-debugging-port=9222`, mas **nenhum listener é criado** quando se usa o
diretório de perfil padrão (`AppData\Local\Google\Chrome\User Data`). O Chrome
recusa o switch ali por proteção contra roubo de cookies. Não é problema de
fechamento, de flag ausente nem de firewall.

Comprovado por comparação:

| Comando | Listener |
|---|---|
| `--remote-debugging-port=9222` (perfil padrão) | ❌ nenhum |
| `--remote-debugging-port=9223 --user-data-dir=C:\rea-test` | ✅ `127.0.0.1:9223` |

Portanto **é obrigatório** usar `--user-data-dir` apontando para um diretório
que não seja o padrão:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\rea-profile" --remote-allow-origins=* --no-first-run --no-default-browser-check
```

Validar do WSL:

```bash
curl -s http://127.0.0.1:9222/json/version
```

Já validado ponta a ponta: `list_browser_targets` em `http://127.0.0.1:9223`
retornou `Chrome/156.0.8078.74` visto do WSL (evidência `ev_a5363ee5…b6e940e4`).

### Alternativa para abas já abertas (sem CDP)

Se o objetivo for apenas saber quais abas estão abertas no perfil padrão, os
arquivos SNSS em `Default\Sessions\Tabs_*` e `Session_*` contêm as URLs:

```bash
python3 - <<'EOF'
import re, glob, os
base = "/mnt/c/Users/calado/AppData/Local/Google/Chrome/User Data/Default/Sessions"
pat  = re.compile(rb'https?://[^\x00-\x20"\'<>\\|^`{}]{6,300}')
for f in sorted(glob.glob(base + "/*")):
    if not os.path.basename(f).startswith(("Tabs_", "Session_")): continue
    try: data = open(f, "rb").read()
    except PermissionError: print(f"{os.path.basename(f)}: bloqueado (em uso)"); continue
    print(os.path.basename(f), sorted({m.decode() for m in pat.findall(data)}))
EOF
```

Limitações: heurística (inclui histórico da janela, não só abas vivas); arquivos
em uso pelo Chrome ficam ilegíveis. **Esses arquivos contêm tokens de sessão** —
não compartilhe.

Depois, no REA:

1. `list_browser_targets` com `cdp_endpoint: "http://127.0.0.1:9222"`
2. `inspect_web_page` com o `target_id` retornado

## 4. Fallback: Chromium dentro do WSL (já funcionou)

Útil se o mirrored não cooperar. Binários já baixados em `/tmp/rea-chromium`
(sobrevivem? **não** — `/tmp` é limpo no restart do WSL; refazer o download se preciso).

Dependências que faltavam e foram extraídas sem root:

```bash
cd /tmp/rea-chromium/libs && apt-get download libnss3 libnspr4
for d in *.deb; do dpkg-deb -x "$d" /tmp/rea-chromium/sysroot; done
```

Download do Chromium (cache npm alternativo porque `~/.npm` tem arquivos de root):

```bash
export npm_config_cache=/tmp/rea-chromium/npm-cache
export PLAYWRIGHT_BROWSERS_PATH=/tmp/rea-chromium/browsers
npx --yes playwright install chromium
```

Subir com CDP:

```bash
export LD_LIBRARY_PATH=/tmp/rea-chromium/sysroot/usr/lib/x86_64-linux-gnu
/tmp/rea-chromium/browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell \
  --no-sandbox --disable-gpu --disable-crash-reporter --disable-breakpad \
  --remote-debugging-port=9222 --user-data-dir=/tmp/rea-chromium/prof3 \
  http://127.0.0.1:8080/index.html
```

Nota: o binário `chrome` completo crasha no boot neste ambiente (crashpad);
`chrome-headless-shell` funciona. Para janela visível, tentar o completo com
`--disable-crash-reporter --disable-breakpad` (WSLg está ativo).

Servir o projeto localmente:

```bash
cd /home/calado/projects/trilha-de-vida-rpg && python3 -m http.server 8080 --bind 127.0.0.1
```

## 5. Limitações observadas

- `sudo` bloqueado pela flag *no-new-privileges* → nada de `apt install`.
- Escrita em `/mnt/c` bloqueada pela sandbox da sessão (`workspace-write`).
- Captura do REA começa no *attach*: rede/console anteriores não aparecem.
- CDP precisa aparecer como **loopback**; IP do host Windows (`172.21.96.1`) não serve.
