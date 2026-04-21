# Farenheit — Design Document

**Data:** 2026-04-21
**Status:** Em brainstorming (aguarda aprovação do usuário)

## 1. Visão geral

Farenheit é um serviço local que serve epubs da pasta `Livros` do iCloud Drive para o browser web experimental do Kobo, com UI otimizada para e-reader e sincronização automática da pasta de origem.

Substitui a UX atual do usuário (arrastar arquivo → abrir send.djazz.se no celular → parear com Kobo → subir um arquivo por vez) por um fluxo de rede local: abrir o browser do Kobo → entrar na lista → tocar no livro → download.

### Objetivos

- **Sync automático**: qualquer epub novo/removido na pasta `Livros` aparece/some na UI sem ação manual.
- **UI para e-reader**: listagem densa, alto contraste, alvos de toque grandes, zero dependência de JS pesado.
- **Tracking por device**: cada Kobo/celular que acessa é identificado via cookie UUID; downloads já feitos aparecem visualmente esmaecidos.
- **Zero fricção de auth**: acesso livre na rede local (sem senha).
- **Capas coloridas**: Kobo Clara Color tem tela E Ink Kaleido 3, então capas ficam em cor.

### Não-objetivos

- Integração com a API Send-to-Kobo (Rakuten) — não queremos canal de sync da Rakuten; ficamos em HTTP puro na rede local.
- Edição de metadados pela UI — metadados vêm do epub, usuário edita via Calibre se quiser.
- Substituir o fluxo Calibre-Web + OPDS do Xteink X4 — esse fluxo funciona bem, farenheit é só pro Kobo.
- Autenticação / controle de acesso — perímetro é a rede doméstica.
- Streaming de leitura online — o serviço entrega o arquivo; leitura é no device.

## 2. Contexto

### Fluxo atual (problemático)

1. Usuário baixa epub (via qualquer meio).
2. Salva em `iCloud Drive/Livros/`.
3. Pro Xteink X4: sobe no Calibre-Web → X4 puxa via OPDS. ✅ Funciona bem.
4. Pro Kobo: abre `send.djazz.se` no celular, pareia com código mostrado no Kobo, seleciona arquivo, upload via Rakuten. ❌ Um arquivo por vez, depende de internet + conta Kobo.

### Hardware-alvo

- **Kobo Clara Color** — 6" E Ink Kaleido 3 (cor), touch, browser experimental WebKit (limitado, JS antigo).
- Acesso: rede local via IP (ex.: `http://10.0.0.31:1111`).

### Ambiente do serviço

- Roda no Mac do usuário (greenfield em `/Users/peuic/Documents/farenheit`).
- Pasta-fonte: `~/Library/Mobile Documents/com~apple~CloudDocs/Livros` (iCloud Drive local mount).
- Stack: Bun + TypeScript.
- Gerenciamento: launchd agent (user-level, auto-start no login).

## 3. Arquitetura

Processo único com três módulos isolados e comunicação por eventos:

```
┌─────────────────────────────────────────────────────────┐
│                   farenheit (processo)                  │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │   Indexer    │──▶│    Store     │◀──│   Server    │  │
│  │              │   │              │   │             │  │
│  │ scan + watch │   │  SQLite +    │   │ Bun.serve   │  │
│  │ parse epub   │   │  data/covers │   │ HTML+epub   │  │
│  │ extract cover│   │              │   │             │  │
│  └──────┬───────┘   └──────────────┘   └──────▲──────┘  │
│         │                                     │         │
│         ▼                                     │         │
│   pasta Livros (iCloud)             Kobo (http:1111)    │
└─────────────────────────────────────────────────────────┘
```

### Princípio de isolamento

Cada módulo tem uma responsabilidade única e uma interface pública explícita:

- **Indexer**: conhece filesystem e formato epub. Emite eventos `added`/`changed`/`removed`. Não conhece SQLite nem HTTP.
- **Store**: conhece SQLite e diretório de capas. Expõe queries e mutations. Não conhece filesystem de origem nem HTTP.
- **Server**: conhece HTTP, rotas, templates. Consulta o Store. Não conhece filesystem de origem nem parsing.

O teste da boa fronteira: mudar o interior de um módulo não deve quebrar os outros.

## 4. Componentes

### 4.1 Indexer (`src/indexer/`)

Responsável por descobrir e interpretar epubs.

**Interface:**

```ts
interface Indexer {
  scanAll(): Promise<void>
  watch(): void
  on(event: 'added' | 'changed' | 'removed', handler: (e: IndexerEvent) => void): void
}

type IndexerEvent =
  | { type: 'added' | 'changed'; book: BookInput }
  | { type: 'removed'; relPath: string }
```

**Responsabilidades:**

- `scanAll()` — varre recursivamente `BOOKS_DIR`, filtra `*.epub`, para cada um checa se `mtime` já existe no Store; se novo/mudou, parseia e emite `added`/`changed`.
- `watch()` — usa `chokidar` para observar `BOOKS_DIR`. Emite eventos correspondentes com debounce leve (evitar duplicate events do iCloud).
- `parse(path)` — usa `epub2` (ou equivalente) para extrair `title`, `creator`, `description`, imagem de capa.
- `extractCover(epub, bookId)` — pega a imagem de capa declarada no epub, redimensiona com `sharp` para largura máx. 400px, grava como WebP em `data/covers/{bookId}.webp`.

**Tratamento do iCloud dataless:**

Antes de parsear, checa se o arquivo é placeholder (via `stat` ou `xattr com.apple.fileprovider.fpfs#P`). Se sim, dispara `brctl download <path>` e aguarda até o arquivo materializar (polling no tamanho com timeout de 60s).

Se parsing falha: book é salvo com `title = filename`, sem autor, sem capa. Warn no log.

### 4.2 Store (`src/store/`)

Camada de persistência.

**Interface:**

```ts
interface Store {
  upsert(book: BookInput): void
  deleteByRelPath(relPath: string): void
  list(opts: ListOpts): Book[]
  getById(id: number): Book | null
  listCategories(): CategoryCount[]
  ensureDevice(cookieId: string): Device
  markDownloaded(deviceId: string, bookId: number): void
}

type ListOpts = {
  category?: string   // null = raiz
  search?: string     // busca em title + author
  sort?: 'recent' | 'title'   // default: 'recent'
  deviceId?: string   // se presente, junta com tabela downloads
}
```

**Schema SQLite:**

```sql
CREATE TABLE books (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path        TEXT    NOT NULL UNIQUE,
  filename        TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  author          TEXT,
  category        TEXT,
  cover_filename  TEXT,
  size_bytes      INTEGER NOT NULL,
  mtime           INTEGER NOT NULL,
  added_at        INTEGER NOT NULL,
  indexed_at      INTEGER NOT NULL
);
CREATE INDEX idx_books_category ON books(category);
CREATE INDEX idx_books_added ON books(added_at DESC);

CREATE TABLE devices (
  id              TEXT PRIMARY KEY,
  label           TEXT,
  first_seen_at   INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL
);

CREATE TABLE downloads (
  device_id       TEXT    NOT NULL REFERENCES devices(id),
  book_id         INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  downloaded_at   INTEGER NOT NULL,
  PRIMARY KEY (device_id, book_id)
);
```

**Diretório de capas:** `data/covers/{id}.webp`. Capas órfãs (book deletado) são limpas pelo `deleteByRelPath` junto com o registro.

### 4.3 Server (`src/server/`)

HTTP + renderização.

**Rotas:**

| método | rota                   | handler                                                          |
|--------|------------------------|------------------------------------------------------------------|
| GET    | `/`                    | Home: categorias + lista de recentes                             |
| GET    | `/c/:category`         | Lista filtrada por categoria                                     |
| GET    | `/book/:id`            | Detalhe (capa grande, metadata, botão de download)               |
| GET    | `/book/:id/cover`      | Serve WebP da capa; cache busting via `?v={mtime}`               |
| GET    | `/book/:id/download`   | Stream do epub, `Set-Cookie` device, registra download           |
| GET    | `/search?q=...`        | Busca por título/autor                                           |

**Comportamento do cookie de device:**

- Toda request checa se há cookie `fh_device`. Se não tem, gera UUID v4, `Set-Cookie` com `Max-Age=31536000; SameSite=Lax; HttpOnly` e persiste na tabela `devices`.
- O device fica sem `label` até o usuário editar (v2 — não parte do MVP).

**Templates:**

HTML escrito em tagged template literals TypeScript, sem engine externo. Justificativa: conteúdo HTML é pequeno, Kobo não processa JS pesado, engine adiciona complexidade sem ganho.

Tamanho típico do HTML por página: <15 KB (incluindo CSS inline).

### 4.4 CSS (inline em `src/server/styles.ts`)

- Paleta alto contraste: preto sobre bege-papel (`#f6f4ef`), acentos em cinza escuro.
- Tipografia: fonte-system serifada (Georgia como fallback — Kobo pode não ter todas).
- Alvos de toque mínimo 44×44px.
- Zero animações (E Ink refresha mal).
- CSS inline no `<style>` da página (evita 2ª request que o Kobo demora pra fazer).

## 5. UI — layout definido

### Home e categorias — **lista com thumbnail** (C do brainstorm)

```
┌──────────────────────────┐
│ Farenheit                │
│ 312 livros · buscar      │
├──────────────────────────┤
│ Categorias               │
│ Ficção · Técnicos · ...  │
│                          │
│ Recentes                 │
│ ┌──┐ Project Hail Mary   │
│ │##│ Andy Weir · 2021    │
│ ├──┤                     │
│ │##│ Dom Casmurro        │
│ │  │ Machado de Assis    │
│ ├──┤                     │
│ │##│ Sapiens ✓  (baixado)│
│ │  │ Harari              │
│ └──┘                     │
└──────────────────────────┘
```

- Thumbnail pequeno (40×60px) à esquerda de cada linha.
- Título em negrito + autor em cinza abaixo.
- Livros já baixados por este device aparecem com `opacity: 0.45` + ✓.
- Linhas clicáveis (área inteira) → página de detalhe.

### Detalhe — capa grande + ação clara

```
┌──────────────────────────┐
│ ← Voltar      Farenheit  │
├──────────────────────────┤
│                          │
│      ┌──────────┐        │
│      │          │        │
│      │   capa   │        │
│      │  140×210 │        │
│      │          │        │
│      └──────────┘        │
│                          │
│   Project Hail Mary      │
│       Andy Weir          │
│ epub · 1.2 MB · 3 dias   │
│ ........................ │
│ Descrição do livro (se   │
│ houver no metadata)...   │
│                          │
│ ┌──────────────────────┐ │
│ │  ⬇  BAIXAR NO KOBO   │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

- Se o livro já foi baixado: botão fica outlined + texto "Baixar novamente"; linha de metadata mostra "baixado há X dias".

### Busca

Input grande no topo, resultados no mesmo layout de lista abaixo. Submit em GET (?q=...).

## 6. Fluxo de dados

### Startup

```
1. Abre SQLite → roda migrations (criar tabelas se não existem).
2. Indexer.scanAll()
   para cada epub:
     - se mtime == DB → skip
     - se novo/mudou → parse → extract cover → Store.upsert
3. Indexer.watch() — chokidar liga no BOOKS_DIR.
4. Server.start() — Bun.serve porta 1111.
5. Log: IP LAN descoberto + porta (pra usuário ver no farenheit.log).
```

### Runtime — livro adicionado

```
usuário salva .epub na pasta Livros (via Finder, iCloud, etc.)
  ↓
chokidar emite 'add'
  ↓
Indexer checa dataless → brctl download se necessário
  ↓
Indexer.parse → extract cover
  ↓
Store.upsert(book)
  ↓
próxima request do Kobo na home já mostra o livro
```

### Runtime — download

```
GET /book/42/download
  ↓
Server lê/gera cookie fh_device
  ↓
Store.ensureDevice + Store.markDownloaded
  ↓
Server abre stream do .epub no filesystem
  ↓
(se dataless) brctl download → aguarda
  ↓
pipe bytes para response com Content-Disposition: attachment
```

## 7. Tratamento de erros

| situação                           | comportamento                                              |
|------------------------------------|------------------------------------------------------------|
| epub não parseia                   | `title = filename`, sem author/cover, warn log             |
| extração de capa falha             | book sem cover, UI mostra placeholder, warn log            |
| sharp falha (imagem inválida)      | idem (sem cover)                                           |
| watcher morre                      | processo reinicia (KeepAlive); startup `scanAll` recupera  |
| SQLite busy                        | retry com backoff exponencial (3 tentativas)               |
| path com chars exóticos            | UTF-8 puro; sem normalização extra                         |
| 2 epubs com mesmo título+autor     | coexistem — chave é `rel_path` único                       |
| `/book/:id` inexistente            | 404 com template "← Voltar"                                |
| iCloud dataless                    | `brctl download`, aguarda até 60s, falha → warn + fallback |
| pasta `Livros` não existe no boot  | erro fatal, log com instrução                              |
| porta 1111 ocupada                 | erro fatal, log com sugestão                               |

### Logging

Arquivo único `data/farenheit.log`, formato `[ISO ts] [LEVEL] mensagem`. `console.log/warn/error` redirecionados via launchd (`StandardOutPath` / `StandardErrorPath`).

Não há rotação automática no MVP — arquivo cresce. Usuário pode rotacionar manualmente se crescer demais (em prática, volume é baixo: 1 scan inicial + events ocasionais).

## 8. Testes

### Unit

- **Parser**: fixtures com epub válido, corrompido, sem título, sem capa.
- **Cover**: imagem grande → resize ≤400px WebP; imagem inválida → `null` sem throw.
- **Store**: DB `:memory:`, CRUD + filtros + cascade.

### Integration

- **Indexer → Store**: pasta temp + 3 epubs → `scanAll()` → asserts no DB. Depois `watch()`: adicionar, mudar, remover → asserts.
- **Store ← Server**: DB populado + Bun.serve em porta random, GETs contra rotas, assert HTML contém elementos esperados + headers corretos.

### E2E

Um único teste end-to-end que exerce o caminho inteiro:
1. Pasta temp com 3 epubs.
2. Sobe app.
3. `GET /` → lista com 3 livros.
4. `GET /book/1/download` → recebe bytes, cookie setado.
5. `GET /` com cookie → livro 1 aparece marcado como baixado.
6. Adiciona 4º epub → aguarda watcher → `GET /` → 4 livros.

### Fora de escopo de testes automatizados

- Browser real do Kobo (irreprodutível). Valida-se manualmente na 1ª instalação.
- iCloud dataless (depende do sistema). Mockado via flag.

### Stack de testes

- Runner: `bun test`
- Fixtures: `tests/fixtures/*.epub` (3-4 epubs de domínio público pequenos + 1 corrompido propositalmente).

## 9. Deploy

### Estrutura de pastas

```
farenheit/
├── src/
│   ├── index.ts              # entry point
│   ├── config.ts             # paths, porta, env
│   ├── indexer/
│   │   ├── indexer.ts
│   │   ├── parser.ts
│   │   └── cover.ts
│   ├── store/
│   │   ├── store.ts
│   │   └── schema.ts
│   └── server/
│       ├── server.ts
│       ├── routes/
│       ├── templates/
│       └── styles.ts
├── data/
│   ├── farenheit.sqlite
│   ├── covers/
│   └── farenheit.log
├── tests/
│   ├── fixtures/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── launchd/
│   └── com.farenheit.plist
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-04-21-farenheit-design.md
├── package.json
├── tsconfig.json
└── README.md
```

### launchd agent

Arquivo `~/Library/LaunchAgents/com.farenheit.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.farenheit</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/bun</string>
    <string>run</string>
    <string>/Users/peuic/Documents/farenheit/src/index.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/peuic/Documents/farenheit</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key>
  <string>/Users/peuic/Documents/farenheit/data/farenheit.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/peuic/Documents/farenheit/data/farenheit.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BOOKS_DIR</key>
    <string>/Users/peuic/Library/Mobile Documents/com~apple~CloudDocs/Livros</string>
    <key>PORT</key>
    <string>1111</string>
  </dict>
</dict>
</plist>
```

### Comandos operacionais

```bash
# iniciar / parar / status
launchctl load ~/Library/LaunchAgents/com.farenheit.plist
launchctl unload ~/Library/LaunchAgents/com.farenheit.plist
launchctl list | grep farenheit

# logs
tail -f data/farenheit.log
```

### Acesso pelo Kobo

1. Mac conectado à mesma rede wifi que o Kobo.
2. Usuário descobre o IP local no log do farenheit (ex.: `10.0.0.31`).
3. No Kobo: Beta Features → Web Browser → `http://10.0.0.31:1111`.
4. Bookmark no Kobo pra próximas vezes.

## 10. Questões abertas / não-escopo (futuro)

- **Edição de label do device** pela UI (atualmente só UUID). Útil quando há 2+ Kobos.
- **Descoberta via mDNS** (`farenheit.local`). Kobo browser historicamente tem suporte inconsistente — vale testar depois.
- **Rotação de logs** automática.
- **Compactação do SQLite** (VACUUM periódico). Não necessário no volume atual.
- **Thumbnail lazy-loading** (se catálogo crescer muito acima de 300).
- **Suporte a outros formatos** (kepub, mobi). Fora do escopo inicial; foco em epub.

## 11. Configuração (env vars)

| var          | default                                    | descrição                       |
|--------------|--------------------------------------------|----------------------------------|
| `BOOKS_DIR`  | _obrigatório_                              | pasta-raiz com epubs (iCloud)   |
| `PORT`       | `1111`                                     | porta HTTP                      |
| `DATA_DIR`   | `./data`                                   | pasta de SQLite, covers, log    |
| `HOST`       | `0.0.0.0`                                  | bind host                       |
