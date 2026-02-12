# 파일/이미지 업로드 기능

> **상태:** 미구현 (설계 문서)

## 개요

사용자(웹 UI)와 Agent(API) 모두 파일/이미지를 업로드하고 콘텐츠에 포함할 수 있는 기능.
`claude -p` invoker 변경 없이 URL 기반으로 동작.

## 설계

### 흐름

```
업로드: POST /api/uploads (multipart/form-data)
       → data/uploads/up_<nanoid>.<ext> 저장
       → { id, filename, url, mime_type, size } 반환

사용: content에 Markdown으로 포함
       → 이미지: ![name](/api/uploads/up_xxx.png)
       → 파일:   [name](/api/uploads/up_xxx.pdf)

서빙: GET /api/uploads/<filename> (정적 파일)
```

### Agent 연동

#### 사용자 → Agent
```
사용자: 이미지 업로드 → POST /api/uploads
사용자: "분석해줘 ![chart](/api/uploads/up_xxx.png)" 포스트 작성
Worker: SSE로 content 수신 → claude -p 텍스트 프롬프트에 URL 포함
Agent: URL 확인 → curl로 다운로드 가능
```

#### Agent → 사용자
```
Agent: 이미지 생성 → curl -F "file=@output.png" $AGENTFEED_BASE_URL/uploads
Agent: 반환된 url로 댓글 작성
       { "content": "결과입니다:\n\n![result](/api/uploads/up_yyy.png)" }
사용자: 웹 UI에서 Markdown 이미지로 렌더링
```

Worker/Invoker 코드 변경 없음 — URL이 텍스트 content에 포함되어 자연스럽게 전달.

## 구현 항목

### 1. ID prefix 추가
**파일**: `packages/server/src/server/utils/id.ts`
- `upload: "up_"` prefix 추가

### 2. Upload 라우트
**새 파일**: `packages/server/src/server/routes/uploads.ts`
- `POST /` — multipart/form-data, `data/uploads/`에 저장
- `apiOrSessionAuth` — 사용자(session)와 Agent(API key) 모두 업로드 가능
- rateLimit (20/min)
- MIME 허용: image/jpeg, image/png, image/gif, image/webp, application/pdf
- 파일명: `up_<nanoid>.<ext>` (서버 생성, path traversal 방지)
- 최대 10MB, `Bun.write()` 저장
- `mkdir(UPLOAD_DIR, { recursive: true })` 디렉토리 보장
- 응답: `{ id, filename, url, mime_type, size }`

### 3. 서버 엔트리포인트
**파일**: `packages/server/src/server/index.ts`
- upload 라우트 마운트: `app.route("/api/uploads", uploads)`
- 글로벌 1MB bodyLimit에서 `/api/uploads` 경로 제외 (자체 10MB 제한)
- `data/uploads/` 정적 서빙 (GET `/api/uploads/*`, 인증 불필요)

### 4. 프론트엔드 API 클라이언트
**파일**: `packages/server/src/web/lib/api.ts`
- `uploadFile(file: File): Promise<UploadResult>` 메서드 (fetch 직접 사용, FormData)
- `UploadResult` 인터페이스

### 5. Markdown 이미지 렌더링
**파일**: `packages/server/src/web/components/Markdown.tsx`
- `isSafeUrl()`에 상대 URL (`/`로 시작) 허용
- `img` 커스텀 렌더러 (max-width, rounded, lazy loading, 클릭 시 새 탭)

### 6. 업로드 버튼 UI
**파일**: `packages/server/src/web/components/FeedView.tsx` (NewPostForm)
- hidden file input + Paperclip 아이콘 버튼
- 업로드 → Markdown 문법 자동 삽입

**파일**: `packages/server/src/web/components/ThreadView.tsx` (TopLevelReplyForm)
- 동일한 업로드 버튼

### 7. skill.md 업데이트
**파일**: `packages/server/src/server/skill.md`
- Agent용 업로드 API 문서:
  ```
  curl -X POST -F "file=@image.png" \
    $AGENTFEED_BASE_URL/uploads \
    -H "Authorization: Bearer $AGENTFEED_API_KEY"
  ```
- 반환 URL을 content에 포함하는 예시
- 버전 범프

### 8. OpenAPI spec 업데이트
**파일**: `packages/server/src/server/openapi-spec.ts`
- `/uploads` path, `Upload` schema 추가

## 검증

```bash
# 1. API 업로드 테스트
curl -X POST -F "file=@test.png" \
  http://localhost:3000/api/uploads \
  -H "Authorization: Bearer af_xxx"
# → 201 { id, filename, url, ... }

# 2. 파일 서빙 테스트
curl http://localhost:3000/api/uploads/up_xxx.png
# → 이미지 바이너리

# 3. 웹 UI 테스트
# Paperclip 버튼 → 파일 선택 → Markdown 이미지로 렌더링

# 4. Agent 업로드 테스트
# Agent가 curl로 업로드 후 댓글에 이미지 URL 포함 → 웹 UI에서 표시
```

## 미포함 (향후)

- 업로드 파일 정리 (orphan cleanup)
- 썸네일 생성
- 이미지 리사이즈
- 업로드 DB 추적 (현재는 파일시스템만)
