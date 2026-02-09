# AgentFeed

> Feed infrastructure for AI agents.
> Stop building feed storage. Start building agents.

**GitHub**: https://github.com/daige-st/agentfeed
**License**: MIT (server) / AGPL-3.0 (web UI)

## Overview

AI agent가 수집한 피드를 저장하고 시각화할 수 있는 셀프호스팅 인프라.

```bash
docker run -p 3000:3000 -v ./data:/data agentfeed/agentfeed
```

## Stack

| Layer | Tech | 이유 |
|-------|------|------|
| Runtime | Bun | bun:sqlite 내장, 빠른 시작, 단일 런타임 |
| API | Hono | 경량, 타입세이프, 멀티 런타임 지원 |
| DB | SQLite (bun:sqlite) | 의존성 제로, 단일 파일, 볼륨 마운트로 영속성 |
| UI | React + Vite | 빌드 결과물을 Hono가 static serve |
| CSS | Tailwind CSS v4 | CSS 변수 기반 테마, Daigest 디자인 계승 |
| Container | Docker (single image) | `oven/bun` 베이스, ~80MB |

## Core Concept

```
[사용자의 AI Agent]          [AgentFeed]              [사용자]
                    API Key
  Python/TS/Go  ──────────→  POST /api/feeds/:id/posts
  agent가 수집한               │
  데이터를 push               SQLite 저장
                               │
                          Web UI (React)  ←──── 브라우저로 확인
```

## Authentication

### UI 로그인 (세션 기반)

- **첫 실행**: Setup 화면에서 비밀번호 설정 → SQLite에 해시 저장
- **이후 접속**: 비밀번호 입력 → 세션 쿠키 발급
- UI의 모든 페이지는 로그인 필요

```
첫 접속 → /setup (비밀번호 설정) → 저장
이후 접속 → /login (비밀번호 입력) → 세션 쿠키 → UI 사용
```

### API 인증 (API key 기반)

- API key를 `Authorization: Bearer af_xxxxx` 헤더로 전달
- API key는 UI의 Settings 페이지에서 생성/관리

### Data Model (auth)

```sql
CREATE TABLE admin (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Data Model

```sql
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,                -- Markdown
  source_url TEXT,
  metadata TEXT,               -- JSON (자유 형식)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,    -- "af_xxxx..." 표시용
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## API

### Error Response

모든 API 에러는 일관된 형식:

```json
{"error": {"code": "NOT_FOUND", "message": "Feed not found"}}
```

### Endpoints

```
# Health
GET    /api/health                서버 상태 확인 → {"status": "ok"}

# Auth
POST   /api/auth/setup            비밀번호 최초 설정
POST   /api/auth/login            로그인 → 세션 쿠키
POST   /api/auth/logout           로그아웃
GET    /api/auth/status           인증 상태 확인 (setup 완료 여부 포함)

# API Keys (UI 세션 인증 필요)
POST   /api/keys                  API key 생성 → key 반환 (최초 1회만 노출)
GET    /api/keys                  API key 목록 (prefix만 노출)
DELETE /api/keys/:id              API key 삭제

# Feeds (API key 필요)
POST   /api/feeds                 피드 생성
GET    /api/feeds                 피드 목록
GET    /api/feeds/:id             피드 상세
PATCH  /api/feeds/:id             피드 수정
DELETE /api/feeds/:id             피드 삭제

# Posts (API key 필요)
POST   /api/feeds/:id/posts      포스트 추가
GET    /api/feeds/:id/posts      포스트 목록 (페이지네이션: ?cursor=&limit=)
GET    /api/posts/:id            포스트 상세
DELETE /api/posts/:id            포스트 삭제
```

### Request/Response Examples

```bash
# 피드 생성
curl -X POST http://localhost:3000/api/feeds \
  -H "Authorization: Bearer af_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"name": "Tech News", "description": "HN + Reddit tech posts"}'

# → {"id": "fd_abc123", "name": "Tech News", ...}

# 포스트 추가
curl -X POST http://localhost:3000/api/feeds/fd_abc123/posts \
  -H "Authorization: Bearer af_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New AI Model Released",
    "content": "# Summary\nA new model was released...",
    "source_url": "https://example.com/article",
    "metadata": {"source": "hackernews", "score": 142}
  }'
```

### Configuration

| 환경변수 | 기본값 | 설명 |
|---------|--------|------|
| `PORT` | `3000` | 서버 포트 |
| `DATABASE_PATH` | `/data/agentfeed.db` | SQLite DB 파일 경로 |

## Web UI

### Pages

| Route | 인증 | 설명 |
|-------|------|------|
| `/setup` | - | 첫 실행 비밀번호 설정 |
| `/login` | - | 로그인 |
| `/` | 필요 | Home - 피드 목록 + 최근 포스트 |
| `/?feed=fd_xxx` | 필요 | Feed View - 선택 피드의 포스트 타임라인 |
| `/?feed=fd_xxx&post=ps_xxx` | 필요 | 특정 포스트 펼침/하이라이트 |
| `/settings` | 필요 | Settings - API key 관리 |

### URL 상태 관리 (Daigest 패턴)

- `/` 하나에서 query parameter로 뷰 전환 (별도 페이지 전환 없음)
- `history.replaceState()`로 URL 반영 (히스토리 추가 안함)
- Zustand store ↔ URL 양방향 동기화

```
/                          → Home (피드 목록 + 최근 포스트)
/?feed=fd_xxx              → Feed 선택 (포스트 타임라인)
/?feed=fd_xxx&post=ps_xxx  → 포스트 펼침
```

### 레이아웃 (Daigest 패턴)

```
┌──────────────┬─────────────────────────────────┐
│  FeedPanel   │  ContentPanel                   │
│  (280px)     │                                 │
│              │  / → 최근 포스트 (EmptyState)    │
│  ○ Tech News │  /?feed=fd_xxx → 포스트 타임라인 │
│  ○ AI Papers │                                 │
│  ○ HN Daily  │                                 │
│              │           max-w-3xl             │
│  ──────────  │                                 │
│  + New Feed  │                                 │
├──────────────┤                                 │
│  ⚙ Settings  │                                 │
└──────────────┴─────────────────────────────────┘
```

**Desktop**:
- FeedPanel: 좌측 고정 (`position: absolute`, `top-6 left-6 w-[280px]`)
- ContentPanel: `md:pl-[312px]`, `max-w-3xl mx-auto`
- FeedPanel 높이: `max-h-[calc(100vh-120px)]` 스크롤

**Mobile**:
- FeedPanel → BottomSheet
- ContentPanel: 풀 너비

### FeedPanel

- 피드 flat list (폴더 없음)
- 각 피드: 이름 + 최근 포스트 수 badge
- 선택된 피드: 강조 배경색
- 피드 클릭 → `useFeedStore.setSelectedFeedId()` → URL `/?feed=fd_xxx`
- 같은 피드 다시 클릭 → 선택 해제 (Home으로)
- 하단: "+ New Feed" 버튼, "Settings" 링크

### ContentPanel (뷰 분기)

**EmptyState** (feed 미선택 `/`):
- 최근 포스트 목록 (전체 피드에서 최신순)
- 각 포스트에 피드 이름 태그 표시

**FeedView** (feed 선택 `/?feed=fd_xxx`):
- 선택된 피드의 포스트 타임라인 (최신순)
- 무한 스크롤
- 각 포스트는 카드로 쌓임 (제목, 요약, source URL, 시간)
- 포스트 카드 클릭 → 인라인 펼침 (`/?feed=fd_xxx&post=ps_xxx`)

**Post 펼침** (`/?feed=fd_xxx&post=ps_xxx`):
- 선택한 포스트 카드가 확장됨
- Markdown 렌더링, source URL 링크, metadata 표시
- 다른 카드 클릭 또는 닫기 → post param 제거

### Settings (`/settings`)

- FeedPanel 숨김 (Daigest의 HIDE_TREE_PANEL_PATHS 패턴)
- API key 생성/삭제, 비밀번호 변경

### 디자인 시스템 (Daigest 계승)

Daigest의 디자인 토큰을 기반으로 통일된 스타일 적용.

**색상 (CSS 변수)**:
```css
:root {
  /* Surface */
  --surface: #ffffff;
  --surface-secondary: #f3f4f6;
  --surface-hover: #f5f5f4;
  --surface-active: #e7e5e4;

  /* Text */
  --text-primary: #1c1917;
  --text-secondary: #78716c;
  --text-tertiary: #a8a29e;

  /* Border */
  --border-default: #e7e5e4;
  --border-secondary: #d6d3d1;

  /* Accent (CTA) */
  --accent: #3B2F2C;
  --accent-hover: #2A201E;
  --accent-foreground: #ffffff;

  /* Semantic */
  --success: #22C55E;
  --danger: #EF4444;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #0D0D0D;
    --surface-secondary: #1a1a1a;
    --surface-hover: #1a1a1a;
    --surface-active: #262626;

    --text-primary: #fafaf9;
    --text-secondary: #a8a29e;

    --border-default: #3a3a3a;

    --accent: #ffffff;
    --accent-hover: #e5e5e5;
    --accent-foreground: #0D0D0D;
  }
}
```

**폰트**: Pretendard Variable (한/영/일 지원)

**컴포넌트 패턴**:
- Button: `bg-accent text-accent-foreground hover:bg-accent-hover rounded-2.5 px-5 py-2.5`
- Card: `bg-surface border border-border-default rounded-xl`
- Skeleton: `bg-surface-active animate-pulse rounded`
- 모바일 우선, 반응형

**Z-Index 레이어**:
```css
--z-index-overlay: 10;
--z-index-content: 20;
--z-index-nav: 50;
--z-index-modal: 60;
--z-index-dropdown: 100;
```

## Project Structure

```
agentfeed/
├── package.json
├── tsconfig.json
├── Dockerfile
├── .dockerignore
├── .gitignore
├── LICENSE                   # MIT (server)
├── LICENSE-UI                # AGPL-3.0 (web)
├── vite.config.ts
├── src/
│   ├── server/
│   │   ├── index.ts          # Hono 앱 진입점 + static serve
│   │   ├── db.ts             # SQLite 초기화 + 마이그레이션
│   │   ├── routes/
│   │   │   ├── auth.ts       # Setup, Login, Logout
│   │   │   ├── feeds.ts
│   │   │   ├── posts.ts
│   │   │   └── keys.ts
│   │   ├── middleware/
│   │   │   ├── apiKey.ts     # API key 검증
│   │   │   └── session.ts    # 세션 쿠키 검증
│   │   └── utils/
│   │       ├── id.ts         # nanoid 기반 prefix ID (fd_, ps_, af_)
│   │       └── hash.ts       # 비밀번호/API key hashing
│   └── web/                  # AGPL-3.0
│       ├── index.html
│       ├── main.tsx
│       ├── globals.css       # 디자인 토큰 (Daigest 기반)
│       ├── App.tsx
│       ├── routes.tsx
│       ├── pages/
│       │   ├── Setup.tsx
│       │   ├── Login.tsx
│       │   ├── Home.tsx          # FeedPanel + ContentPanel 레이아웃
│       │   └── Settings.tsx
│       ├── store/
│       │   └── useFeedStore.ts   # Zustand (selectedFeedId, selectedPostId)
│       ├── hooks/
│       │   └── useUrlSync.ts     # URL ↔ Store 양방향 동기화
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── Button.tsx
│       │   ├── FeedPanel.tsx     # 좌측 피드 목록 (Desktop 고정 / Mobile BottomSheet)
│       │   ├── ContentPanel.tsx  # 우측 콘텐츠 영역 (EmptyState / FeedView)
│       │   ├── EmptyState.tsx    # 최근 포스트 (전체 피드)
│       │   ├── FeedView.tsx      # 선택 피드 포스트 타임라인
│       │   ├── PostCard.tsx      # 포스트 카드 (접힘/펼침)
│       │   ├── Markdown.tsx
│       │   └── ApiKeyForm.tsx
│       └── lib/
│           └── api.ts
├── data/                     # SQLite DB (gitignored)
└── examples/
    ├── python-agent.py
    └── ts-agent.ts
```

## Dockerfile

```dockerfile
FROM oven/bun:1 AS base

# Build
FROM base AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Production
FROM base AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .

VOLUME /data
ENV DATABASE_PATH=/data/agentfeed.db
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["bun", "run", "dist/server/index.js"]
```

## Implementation Phases

### Phase 1: Project Setup + Core API
1. Bun + Hono + TypeScript 프로젝트 초기화
2. SQLite 스키마 + 마이그레이션 (db.ts)
3. ID 생성 유틸리티 (nanoid + prefix)
4. Auth: 비밀번호 setup/login + 세션 관리
5. API key 생성/검증 middleware
6. Feed CRUD 라우트
7. Post CRUD 라우트
8. Health check 엔드포인트
9. Error response 형식 통일

### Phase 2: Web UI
1. Vite + React + Tailwind v4 설정
2. globals.css 디자인 토큰 (Daigest 기반)
3. Hono에서 static serve 설정 (SPA fallback)
4. Setup / Login 페이지
5. Zustand store + useUrlSync (URL 양방향 동기화)
6. Home 페이지 - 피드 카드 그리드
7. Feed View - 포스트 타임라인 (무한 스크롤)
8. Post 펼침 - 인라인 Markdown 렌더링
9. Settings (API key 관리)

### Phase 3: Docker + 배포
1. Dockerfile 작성 + 최적화
2. README.md (설치, 사용법, API 문서)
3. Agent 예제 코드 (Python, TypeScript)
4. GitHub Actions (이미지 빌드 + Docker Hub 배포)

### Future (post-MVP)
- 공유 링크 (공개 피드 뷰)
- Webhook (새 항목 추가 시 외부 알림)
- SSE/WebSocket (실시간 업데이트)
- Idempotency key (중복 방지)
- Batch post 생성
- 피드 태그/카테고리
- 검색
- 다중 사용자 지원
- Daigest 연동 (한 클릭으로 요약 연결)
- Agent SDK (npm/pip 패키지)

## License

| 디렉토리 | 라이선스 | 설명 |
|----------|---------|------|
| `src/server/`, `examples/` | MIT | 자유로운 사용, Agent 연동 부담 없음 |
| `src/web/` | AGPL-3.0 | UI 수정 후 서비스 시 소스 공개 의무 |

## Daigest와의 연결

```
AgentFeed (오픈소스)              Daigest (SaaS)
──────────────────              ─────────────────
피드 저장/시각화              →    + AI 요약 (Gemini)
직접 Agent 작성 필요         →    + 내장 Agent (12+ 소스)
셀프 호스팅                 →    + 관리형 호스팅
단일 사용자                 →    + 팀 협업
무료                        →    + Pro 기능

"AgentFeed로 시작해서, 규모가 커지면 Daigest로."
```
