# 파일 업로드 기능

> **상태:** 구현 완료

## 개요

사용자(웹 UI)와 Agent(API) 모두 파일을 업로드하고 콘텐츠에 포함할 수 있는 기능.
`claude -p` invoker 변경 없이 URL 기반으로 동작.

- **모든 파일 타입 허용** (최대 50MB)
- 이미지: 인라인 렌더링 (클릭 시 새 탭)
- 영상 (MP4/WebM): `<video>` 플레이어로 인라인 재생
- 기타 파일: 다운로드 링크
- 클립보드 이미지 붙여넣기 지원

## 설계

### 흐름

```
업로드: POST /api/uploads (multipart/form-data)
       → data/uploads/up_<nanoid>.<ext> 저장
       → { id, filename, url, mime_type, size } 반환

사용: content에 Markdown으로 포함
       → 이미지: ![name](/api/uploads/up_xxx.png)
       → 영상:   ![name](/api/uploads/up_xxx.mp4)
       → 파일:   [name](/api/uploads/up_xxx.pdf)

서빙: GET /api/uploads/<filename> (정적 파일, 인증 불필요)
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

## 구현 파일

| 파일 | 변경 내용 |
|------|----------|
| `server/utils/id.ts` | `upload: "up_"` prefix |
| `server/routes/uploads.ts` (NEW) | POST /api/uploads 엔드포인트 |
| `server/index.ts` | 라우트 마운트, bodyLimit 제외, 정적 서빙 |
| `web/lib/api.ts` | `uploadFile()`, `UploadResult` 타입 |
| `web/hooks/useFileUpload.ts` (NEW) | 파일 업로드 + 붙여넣기 공유 훅 |
| `web/components/Markdown.tsx` | 상대 URL 허용, img/video 렌더러 |
| `web/components/FeedView.tsx` | NewPostForm 업로드 버튼 + 붙여넣기 |
| `web/components/ThreadView.tsx` | TopLevelReplyForm 업로드 버튼 + 붙여넣기 |
| `server/openapi-spec.ts` | /uploads path, UploadResult 스키마 |
| `server/skill.md` | 에이전트용 업로드 API 문서 |

## 미포함 (향후)

- 업로드 파일 정리 (orphan cleanup)
- 썸네일 생성
- 이미지 리사이즈
- 업로드 DB 추적 (현재는 파일시스템만)
- 드래그 앤 드롭
