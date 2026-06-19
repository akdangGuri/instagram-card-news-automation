# 카드뉴스 제작기

인스타그램 카드뉴스 문구를 만들고, 1080x1350 PNG로 저장하는 로컬 웹앱입니다.

## 실행

```powershell
.\start.ps1
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 현재 기능

- 주제/원고 기반 카드뉴스 문구 생성
- GPT API 또는 Gemini API 연동
- API 키가 없을 때 로컬 샘플 생성
- 4가지 스타일: 크림 에디토리얼, 블랙 미니멀, 팝 후킹, 사진 뉴스형
- 사진 뉴스형 배경 사진 업로드
- 한국관광공사 TourAPI 축제 검색 및 카드뉴스 적용
- 현재 카드 문구 편집
- 캡션 자동 구성
- 현재 카드 또는 전체 카드 PNG 다운로드

## AI API 설정

앱 화면의 `API 설정` 섹션에 키를 입력하면 로컬 서버 메모리에 임시 저장됩니다. 브라우저 저장소에는 저장하지 않으며, 서버를 끄면 사라집니다.

키가 없으면 `로컬 샘플` 모드로 동작합니다.

PowerShell 예시:

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:OPENAI_MODEL="gpt-4.1-mini"

# 또는
$env:GEMINI_API_KEY="..."
$env:GEMINI_MODEL="gemini-2.5-flash"

.\start.ps1
```

한국관광공사 TourAPI는 화면의 `API 설정`에서 `한국관광공사 TourAPI Key`에 입력할 수 있습니다. 이 키는 `.env`에 저장되어 서버를 다시 시작해도 유지됩니다. `.env`는 `.gitignore`에 포함되어 Git에 올라가지 않습니다.

서버 환경변수로 쓰려면:

```powershell
$env:TOUR_API_KEY="공공데이터포털_인증키"
.\start.ps1
```

## 추천 작업 흐름

1. 주제와 원고/자료를 입력합니다.
2. 카드 수, 톤, AI 엔진을 고릅니다.
3. `카드뉴스 만들기`를 누릅니다.
4. 오른쪽에서 현재 카드 문구를 수정합니다.
5. 사진 뉴스형을 쓰려면 `배경 사진`에 이미지를 넣습니다.
6. 스타일을 고르고 PNG로 저장합니다.

## 축제 카드뉴스

1. `API 설정`에 한국관광공사 TourAPI 키를 저장합니다.
2. `축제 불러오기`에서 검색어와 시작일을 입력합니다.
3. `축제 검색`을 누릅니다.
4. 결과에서 축제를 선택하면 제목, 일정, 장소, 소개 문구와 대표 이미지가 카드뉴스에 적용됩니다.

## Instagram 발행 설정

실제 발행에는 Meta Developer App, Instagram Business/Creator 계정, Facebook Page 연결, 발행 권한이 필요합니다. Threads 발행은 Threads API 권한과 Threads User ID/Access Token이 필요합니다.

```powershell
$env:IG_USER_ID="인스타그램_프로페셔널_계정_ID"
$env:IG_ACCESS_TOKEN="장기_액세스_토큰"
$env:THREADS_USER_ID="Threads_사용자_ID"
$env:THREADS_ACCESS_TOKEN="Threads_액세스_토큰"
$env:PUBLIC_BASE_URL="https://외부에서_접속_가능한_주소"
$env:GRAPH_VERSION="v23.0"
.\start.ps1
```

앱 화면의 `자동발행 설정`에서도 같은 값을 저장할 수 있습니다. `PUBLIC_BASE_URL`은 Meta가 이미지 파일을 읽을 수 있는 HTTPS 주소여야 합니다. 로컬에서 테스트할 때는 ngrok 또는 cloudflared tunnel로 `http://localhost:4173`을 공개한 뒤 나온 HTTPS 주소를 넣으세요.

사용 순서:

1. 카드뉴스를 만들고 문구와 이미지를 확인합니다.
2. `자동발행 설정`에 공개 URL, Instagram 정보, Threads 정보를 저장합니다.
3. `발행용 이미지 만들기`를 눌러 PNG를 `published/`에 저장합니다.
4. `Instagram 발행`, `Threads 발행`, 또는 `Instagram + Threads 발행`을 누릅니다.
