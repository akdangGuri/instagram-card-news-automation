import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = process.cwd();
loadLocalEnv();
const port = Number(process.env.PORT || 4173);
const graphVersion = process.env.GRAPH_VERSION || "v23.0";
const openaiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const runtimeAiSettings = {
  openaiKey: "",
  openaiModel,
  geminiKey: "",
  geminiModel,
  tourApiKey: ""
};
const runtimeSocialSettings = {
  igUserId: "",
  igAccessToken: "",
  threadsUserId: "",
  threadsAccessToken: "",
  threadsAccounts: [],
  facebookPageId: "",
  facebookPageToken: "",
  publicBaseUrl: ""
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(payload);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(html);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^\uFEFF/, "");
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function serializeEnv(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, "")}`)
    .join("\n") + "\n";
}

function runtimeOrEnv(runtimeValue, envKey) {
  return runtimeValue || process.env[envKey] || "";
}

function parseJsonEnv(envKey, fallback) {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function loadLocalEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  const values = parseEnv(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

async function saveLocalEnv(updates) {
  const envPath = join(root, ".env");
  const current = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
  const next = { ...current, ...updates };
  await writeFile(envPath, serializeEnv(next), "utf8");
}

const cardSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      minItems: 3,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kicker", "title", "body"],
        properties: {
          kicker: { type: "string" },
          title: { type: "string" },
          body: { type: "string" }
        }
      }
    }
  }
};

function toneLabel(tone) {
  return {
    practical: "실용적이고 명확한",
    friendly: "친근하고 쉬운",
    expert: "전문적이고 신뢰감 있는"
  }[tone] || "실용적이고 명확한";
}

function styleLabel(style) {
  return {
    cream: "크림 에디토리얼",
    mono: "블랙 미니멀",
    pop: "팝 후킹"
  }[style] || "크림 에디토리얼";
}

function buildCardPrompt({ topic, sourceText, referenceNotes, tone, cardCount, style }) {
  return `인스타그램 카드뉴스 문구를 만들어줘.

조건:
- 한국어로 작성
- 카드 수: ${cardCount}장
- 톤: ${toneLabel(tone)}
- 디자인 스타일: ${styleLabel(style)}
- 카드 하나에는 메시지 하나만
- 제목은 8~18자 정도로 짧게
- 본문은 1~2문장, 카드에 들어갈 수 있게 줄바꿈을 포함해도 됨
- 첫 장은 강한 후킹/표지
- 마지막 장은 저장/공유/팔로우 같은 행동 유도
- 과장, 허위 사실, 확정적 수익 표현은 피하기

주제:
${topic}

원고/자료:
${sourceText || "없음. 주제를 바탕으로 구성."}

레퍼런스 메모:
${referenceNotes || "없음."}

반드시 JSON으로만 응답해줘.`;
}

function normalizeCards(cards, fallbackTopic) {
  return cards
    .filter((card) => card && (card.title || card.body))
    .slice(0, 10)
    .map((card, index) => ({
      kicker: String(card.kicker || (index === 0 ? "오늘의 카드뉴스" : String(index).padStart(2, "0"))).slice(0, 24),
      title: String(card.title || fallbackTopic || `카드 ${index + 1}`).slice(0, 80),
      body: String(card.body || "").slice(0, 220)
    }));
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response did not contain JSON.");
    return JSON.parse(match[0]);
  }
}

function publicBaseUrl() {
  return runtimeOrEnv(runtimeSocialSettings.publicBaseUrl, "PUBLIC_BASE_URL").replace(/\/+$/, "");
}

function instagramConfig() {
  return {
    userId: runtimeOrEnv(runtimeSocialSettings.igUserId, "IG_USER_ID"),
    accessToken: runtimeOrEnv(runtimeSocialSettings.igAccessToken, "IG_ACCESS_TOKEN")
  };
}

function instagramOAuthConfig() {
  return {
    appId: process.env.IG_APP_ID || "",
    appSecret: process.env.IG_APP_SECRET || "",
    redirectUri: `${publicBaseUrl()}/api/instagram/oauth/callback`
  };
}

function facebookOAuthConfig() {
  return {
    appId: process.env.FB_APP_ID || "875028168403415",
    appSecret: process.env.FB_APP_SECRET || "",
    redirectUri: `${publicBaseUrl()}/api/facebook/oauth/callback`
  };
}

function threadsOAuthConfig() {
  return {
    appId: process.env.THREADS_APP_ID || "",
    appSecret: process.env.THREADS_APP_SECRET || "",
    redirectUri: `${publicBaseUrl()}/api/threads/oauth/callback`
  };
}

function threadsConfig() {
  return {
    userId: runtimeOrEnv(runtimeSocialSettings.threadsUserId, "THREADS_USER_ID"),
    accessToken: runtimeOrEnv(runtimeSocialSettings.threadsAccessToken, "THREADS_ACCESS_TOKEN")
  };
}

function normalizeThreadsAccount(account, index = 0) {
  const userId = String(account?.userId || "").trim();
  const accessToken = String(account?.accessToken || "").trim();
  if (!userId || !accessToken) return null;
  return {
    id: String(account.id || userId),
    label: String(account.label || account.username || `Threads ${index + 1}`).trim(),
    username: String(account.username || "").trim(),
    userId,
    accessToken
  };
}

function threadsAccounts() {
  const accounts = [
    ...runtimeSocialSettings.threadsAccounts,
    ...parseJsonEnv("THREADS_ACCOUNTS", [])
  ]
    .map(normalizeThreadsAccount)
    .filter(Boolean);

  const single = threadsConfig();
  if (single.userId && single.accessToken) {
    accounts.push(normalizeThreadsAccount({
      id: single.userId,
      label: process.env.THREADS_ACCOUNT_LABEL || "Default Threads",
      userId: single.userId,
      accessToken: single.accessToken
    }));
  }

  const seen = new Set();
  return accounts.filter((account) => {
    const key = account.id || account.userId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectedThreadsConfig(accountId = "") {
  const accounts = threadsAccounts();
  if (!accounts.length) return threadsConfig();
  return accounts.find((account) => account.id === accountId || account.userId === accountId) || accounts[0];
}

function upsertRuntimeThreadsAccount(account) {
  const normalized = normalizeThreadsAccount(account, runtimeSocialSettings.threadsAccounts.length);
  if (!normalized) return null;
  const index = runtimeSocialSettings.threadsAccounts.findIndex((item) => item.id === normalized.id || item.userId === normalized.userId);
  if (index >= 0) {
    runtimeSocialSettings.threadsAccounts[index] = { ...runtimeSocialSettings.threadsAccounts[index], ...normalized };
  } else {
    runtimeSocialSettings.threadsAccounts.push(normalized);
  }
  return normalized;
}

function publicThreadsAccounts() {
  return threadsAccounts().map((account) => ({
    id: account.id,
    label: account.label,
    username: account.username,
    userIdPreview: masked(account.userId),
    tokenPreview: masked(account.accessToken)
  }));
}

function facebookPageConfig() {
  return {
    pageId: runtimeOrEnv(runtimeSocialSettings.facebookPageId, "FB_PAGE_ID"),
    accessToken: runtimeOrEnv(runtimeSocialSettings.facebookPageToken, "FB_PAGE_ACCESS_TOKEN")
  };
}

function socialSource(runtimeValue, envKey) {
  if (runtimeValue) return "runtime";
  if (process.env[envKey]) return "environment";
  return "none";
}

async function generateWithOpenAI(params) {
  const apiKey = runtimeAiSettings.openaiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = runtimeAiSettings.openaiModel || openaiModel;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "You create concise Korean Instagram carousel copy and return valid JSON only."
        },
        {
          role: "user",
          content: buildCardPrompt(params)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "card_news_copy",
          strict: true,
          schema: cardSchema
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  const text = data.output_text
    || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("")
    || "";
  return normalizeCards(parseJsonText(text).cards || [], params.topic);
}

async function generateWithGemini(params) {
  const apiKey = runtimeAiSettings.geminiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = runtimeAiSettings.geminiModel || geminiModel;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildCardPrompt(params) }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: cardSchema
        }
      })
    }
  );

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "Gemini request failed.");
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return normalizeCards(parseJsonText(text).cards || [], params.topic);
}

function localCards({ topic, cardCount, sourceText, referenceNotes }) {
  const lines = String(sourceText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fallback = [
    "문제를 먼저 짚고 왜 지금 확인해야 하는지 알려주세요.",
    "독자가 바로 공감할 상황을 한 가지 보여주세요.",
    "가장 먼저 실행할 수 있는 행동을 제안하세요.",
    "놓치기 쉬운 실수나 체크포인트를 짚어주세요.",
    "예시를 넣어 이해하기 쉽게 만들어주세요.",
    "핵심을 짧게 요약하고 저장할 이유를 주세요."
  ];
  const words = String(topic || "새 카드뉴스").split(/\s+/).slice(0, 3).join(" ");

  return Array.from({ length: cardCount }, (_, index) => {
    if (index === 0) {
      return {
        kicker: "오늘의 카드뉴스",
        title: topic || "새 카드뉴스",
        body: referenceNotes ? `레퍼런스 방향: ${referenceNotes}` : "핵심만 빠르게 정리했습니다."
      };
    }
    if (index === cardCount - 1) {
      return {
        kicker: "마무리",
        title: "저장하고 다시 보기",
        body: "필요할 때 바로 꺼내 볼 수 있게\n오늘의 핵심을 저장해두세요."
      };
    }
    return {
      kicker: String(index).padStart(2, "0"),
      title: `${words} 포인트 ${index}`,
      body: lines[index - 1] || fallback[(index - 1) % fallback.length]
    };
  });
}

function masked(value) {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function compactDate(value) {
  return String(value || "").replaceAll("-", "").replace(/[^\d]/g, "");
}

function normalizeTourItems(data) {
  const items = data?.response?.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function tourKey() {
  return runtimeAiSettings.tourApiKey || process.env.TOUR_API_KEY || process.env.KTO_API_KEY || "";
}

function normalizedTourKey() {
  const key = tourKey();
  return key ? key.trim() : "";
}

function tourServiceKeyParam() {
  const key = normalizedTourKey();
  if (!key) return "";
  return key.includes("%") ? key : encodeURIComponent(key);
}

async function fetchTourApi(path, params) {
  const key = tourServiceKeyParam();
  if (!key) {
    throw new Error("한국관광공사 TourAPI 키가 설정되지 않았습니다.");
  }

  const query = [
    `serviceKey=${key}`,
    "MobileOS=ETC",
    "MobileApp=CardNewsStudio",
    "_type=json"
  ];
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  const url = `https://apis.data.go.kr/B551011/KorService2/${path}?${query.join("&")}`;

  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok && !text.trim().startsWith("{")) {
    if (response.status === 403 || response.status === 401) {
      throw new Error(`TourAPI 인증이 거절되었습니다: ${response.status}. 공공데이터포털에서 한국관광공사 국문 관광정보 서비스 활용신청/승인 상태와 인증키를 확인하세요.`);
    }
    throw new Error(`TourAPI 요청이 거절되었습니다: ${response.status} ${text.trim() || response.statusText}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`TourAPI 응답을 JSON으로 읽지 못했습니다: ${text.slice(0, 120)}`);
  }
  if (!response.ok || data?.response?.header?.resultCode !== "0000") {
    throw new Error(data?.response?.header?.resultMsg || data?.resultMsg || "TourAPI 요청에 실패했습니다.");
  }
  return data;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function compactLine(value, maxLength = 18) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^(무대에서는|광장에서는|현장에서는|축제장에서는)\s*/, "")
    .replace(/(을|를)\s*비롯해/g, "과")
    .replace(/(이|가|은|는)\s*펼쳐질 예정이다\.?$/g, "")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function travelMomentLines(title, overviewSentences) {
  const source = overviewSentences.slice(1).join(" ");
  const knownPrograms = [
    "서커스 공연",
    "애니메이션 OST 음악회",
    "버블쇼",
    "마술쇼",
    "삼바 퍼커션",
    "에어바운스",
    "미니 기차",
    "아쿠아 놀이 체험",
    "불꽃쇼",
    "드론쇼",
    "퍼레이드",
    "플리마켓",
    "체험 부스",
    "포토존",
    "먹거리"
  ].filter((program) => source.includes(program));
  if (knownPrograms.length >= 2) {
    const shortProgram = (program) => program
      .replace("애니메이션 OST 음악회", "OST 음악회")
      .replace("아쿠아 놀이 체험", "아쿠아 놀이")
      .replace("에어바운스", "에어바운스 체험");
    return [
      `${shortProgram(knownPrograms[0])}과 ${shortProgram(knownPrograms[1])}`,
      knownPrograms[3]
        ? `${shortProgram(knownPrograms[2])}와 ${shortProgram(knownPrograms[3])}`
        : shortProgram(knownPrograms[2] || "현장 체험"),
      shortProgram(knownPrograms[4] || knownPrograms[knownPrograms.length - 1] || "사진 남기기 좋은 순간")
    ].join("\n");
  }
  const candidates = source
    .split(/[,.·ㆍ/]\s*/)
    .map((part) => compactLine(part))
    .filter((part) => part.length >= 4)
    .filter((part) => /(공연|체험|포토|사진|먹거리|음악|마술|버블|불꽃|빛|꽃|놀이|퍼레이드|마켓|전시|산책)/.test(part));
  const unique = [...new Set(candidates)].slice(0, 3);
  while (unique.length < 3) {
    const fallback = [
      `${compactLine(title, 12)} 대표 프로그램`,
      "사진 남기기 좋은 순간",
      "가볍게 둘러볼 현장 코스"
    ][unique.length];
    unique.push(fallback);
  }
  return unique.join("\n");
}

function festivalCards(festival, detail) {
  const title = festival.title || "축제 정보";
  const period = [festival.eventstartdate, festival.eventenddate]
    .filter(Boolean)
    .map((date) => `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}`)
    .join(" - ");
  const place = festival.addr1 || festival.addr2 || "장소 정보 확인 필요";
  const tel = stripHtml(detail?.tel || festival.tel || "");
  const homepage = stripHtml(detail?.homepage || "");
  const overview = stripHtml(detail?.overview || "").slice(0, 220);
  const overviewSentences = stripHtml(detail?.overview || "")
    .split(/[.!?。]\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const shortPlace = place
    .replace(/\s*\([^)]*\)/g, "")
    .split(" ")
    .slice(0, 3)
    .join(" ");
  const hook = `${period ? period.split(" - ")[0] : "이번 시즌"},\n${shortPlace || "이곳"}에서 열리는 주목할 만한 축제`;
  const reason = overviewSentences[0]?.slice(0, 110) || "지역의 분위기와 계절감을 한 번에 즐길 수 있는 행사입니다";
  const highlight = travelMomentLines(title, overviewSentences);
  const point1 = period || "일정 확인 필요";
  const point2 = shortPlace || place;
  const point3 = overviewSentences[1]?.slice(0, 32) || "현장 프로그램";
  const point4 = tel ? `문의 ${tel}` : "공식 안내 확인";
  const dataLines = [
    `기간: ${period || "확인 필요"}`,
    `장소: ${shortPlace || place}`,
    tel ? `문의: ${tel}` : ""
  ].filter(Boolean).join("\n");

  return [
    {
      kicker: "TRAVEL PICK",
      title,
      body: `${shortPlace || "이번 여행지"}에서 만나는 하루짜리 여행 코스`
    },
    {
      kicker: "MOOD",
      title: "이 축제, 어떤 분위기일까?",
      body: reason
    },
    {
      kicker: "HIGHLIGHT",
      title: "오늘의 하이라이트",
      body: highlight
    },
    {
      kicker: "COURSE",
      title: "이렇게 다녀오면 좋아요",
      body: `도착 → 축제장 산책\n포토존 → 주변 맛집\n마지막은 기념 사진`
    },
    {
      kicker: "INFO",
      title: "일정과 위치",
      body: dataLines
    },
    {
      kicker: "FOR WHO",
      title: "이런 분께 추천해요",
      body: `주말 나들이를 찾는 분\n가볍게 떠나고 싶은 분\n사진 남기기 좋은 여행지를 찾는 분`
    },
    {
      kicker: "TIP",
      title: "방문 전 10초 체크",
      body: `운영 시간 먼저 확인\n교통과 주차는 미리 보기\n날씨에 맞춰 코스 조정`
    },
    {
      kicker: "CTA",
      title: "이번 여행 후보로 저장",
      body: `같이 갈 사람에게 공유하고\n방문 전 일정만 한 번 더 확인하세요.`
    }
  ];
}

function buildFestivalImageCards(cards, images) {
  return cards.map((card, index) => ({
    ...card,
    body: String(card.body || "").length > 130
      ? `${String(card.body).slice(0, 127).trim()}...`
      : card.body,
    imageUrl: images[index % images.length] || images[0] || ""
  }));
}

function formatTourDate(value) {
  const text = String(value || "").replace(/[^\d]/g, "");
  if (text.length !== 8) return "";
  return `${text.slice(0, 4)}.${text.slice(4, 6)}.${text.slice(6, 8)}`;
}

function hashtagToken(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 24);
}

function uniqueHashtags(values) {
  const seen = new Set();
  return values
    .map(hashtagToken)
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24)
    .map((tag) => `#${tag}`)
    .join(" ");
}

function buildTravelCaption(festival, detail) {
  const title = stripHtml(festival.title || detail.title || "오늘의 축제");
  const place = stripHtml(festival.addr1 || detail.addr1 || "");
  const region = place.split(/\s+/).filter(Boolean).slice(0, 2).join("");
  const start = formatTourDate(festival.eventstartdate || detail.eventstartdate);
  const end = formatTourDate(festival.eventenddate || detail.eventenddate);
  const period = start && end && start !== end ? `${start} - ${end}` : start || end || "일정 확인 필요";
  const overview = stripHtml(detail.overview || "")
    .split(/[.!?。]\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)[0];
  const mood = overview
    ? `${overview.slice(0, 95)}${overview.length > 95 ? "..." : ""}`
    : "사진 찍고, 산책하고, 하루 기분 전환하기 좋은 여행 코스로 추천해요.";

  const tags = uniqueHashtags([
    title,
    region ? `${region}여행` : "",
    region ? `${region}가볼만한곳` : "",
    region ? `${region}축제` : "",
    "국내여행",
    "축제여행",
    "국내축제",
    "주말여행",
    "가볼만한곳",
    "여행추천",
    "나들이",
    "데이트코스",
    "가족여행",
    "여행스타그램",
    "한국여행",
    "한국관광공사",
    "VisitKorea",
    "KoreaTravel"
  ]);

  return [
    `${title}, 이번 여행 리스트에 넣어볼까요?`,
    "",
    `선선하게 걷고, 사진도 남기고, 현장 분위기까지 즐기기 좋은 축제예요.`,
    mood,
    "",
    `장소: ${place || "공식 안내를 확인해 주세요."}`,
    `일정: ${period}`,
    "",
    "같이 갈 사람에게 공유해두고, 일정 맞는 날 가볍게 다녀와보세요.",
    "",
    tags
  ].join("\n");
}

async function graphPost(path, params, token) {
  const url = new URL(`https://graph.instagram.com/${graphVersion}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("access_token", token);

  const response = await fetch(url, { method: "POST" });
  const data = await response.json();
  if (!response.ok || data.error) {
    const message = data.error?.message || `Graph API request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function exchangeInstagramCode(code, redirectUri) {
  const { appId, appSecret } = instagramOAuthConfig();
  if (!appId || !appSecret) {
    throw new Error("IG_APP_ID and IG_APP_SECRET are required for Instagram OAuth.");
  }

  const form = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code
  });

  const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form
  });
  const shortData = await shortResponse.json();
  if (!shortResponse.ok || shortData.error_message || shortData.error) {
    throw new Error(shortData.error_message || shortData.error?.message || `Instagram OAuth failed: ${shortResponse.status}`);
  }

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", shortData.access_token);

  const longResponse = await fetch(longUrl);
  const longData = await longResponse.json();
  if (!longResponse.ok || longData.error) {
    throw new Error(longData.error?.message || `Instagram long-lived token exchange failed: ${longResponse.status}`);
  }

  const accessToken = longData.access_token || shortData.access_token;
  const meUrl = new URL(`https://graph.instagram.com/${graphVersion}/me`);
  meUrl.searchParams.set("fields", "id,username,account_type");
  meUrl.searchParams.set("access_token", accessToken);
  const meResponse = await fetch(meUrl);
  const meData = await meResponse.json();
  if (!meResponse.ok || meData.error) {
    throw new Error(meData.error?.message || `Instagram account lookup failed: ${meResponse.status}`);
  }

  return {
    userId: String(meData.id || shortData.user_id || ""),
    accessToken,
    expiresIn: longData.expires_in || null
  };
}

async function exchangeFacebookCode(code, redirectUri) {
  const { appId, appSecret } = facebookOAuthConfig();
  if (!appId || !appSecret) {
    throw new Error("FB_APP_ID and FB_APP_SECRET are required for Facebook Page OAuth.");
  }

  const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenResponse = await fetch(tokenUrl);
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || tokenData.error) {
    throw new Error(tokenData.error?.message || `Facebook OAuth failed: ${tokenResponse.status}`);
  }

  const accountsUrl = new URL(`https://graph.facebook.com/${graphVersion}/me/accounts`);
  accountsUrl.searchParams.set("fields", "id,name,access_token,tasks");
  accountsUrl.searchParams.set("access_token", tokenData.access_token);

  const accountsResponse = await fetch(accountsUrl);
  const accountsData = await accountsResponse.json();
  if (!accountsResponse.ok || accountsData.error) {
    throw new Error(accountsData.error?.message || `Facebook Pages lookup failed: ${accountsResponse.status}`);
  }

  const pages = Array.isArray(accountsData.data) ? accountsData.data : [];
  const page = pages.find((item) => item.access_token && (!item.tasks || item.tasks.includes("CREATE_CONTENT") || item.tasks.includes("MANAGE"))) || pages.find((item) => item.access_token);
  if (!page) {
    throw new Error("연결 가능한 Facebook 페이지를 찾지 못했습니다. 페이지 관리자 권한과 pages_manage_posts 권한을 확인하세요.");
  }

  return {
    pageId: String(page.id || ""),
    pageName: String(page.name || "Facebook Page"),
    accessToken: page.access_token,
    pageCount: pages.length
  };
}

async function exchangeThreadsCode(code, redirectUri) {
  const { appId, appSecret } = threadsOAuthConfig();
  if (!appId || !appSecret) {
    throw new Error("THREADS_APP_ID and THREADS_APP_SECRET are required for Threads OAuth.");
  }

  const shortParams = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code
  });

  const shortResponse = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: shortParams
  });
  const shortToken = await shortResponse.json();
  if (!shortResponse.ok || shortToken.error) {
    const message = shortToken.error?.message || `Threads OAuth failed: ${shortResponse.status}`;
    throw new Error(message);
  }

  const longUrl = new URL("https://graph.threads.net/access_token");
  longUrl.searchParams.set("grant_type", "th_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);

  const longResponse = await fetch(longUrl, {
    headers: { authorization: `Bearer ${shortToken.access_token}` }
  });
  const longToken = await longResponse.json();
  if (!longResponse.ok || longToken.error) {
    const message = longToken.error?.message || `Threads long-lived token exchange failed: ${longResponse.status}`;
    throw new Error(message);
  }

  const profile = await threadsGet("me", { fields: "id,username" }, longToken.access_token);
  return {
    userId: String(profile.id || shortToken.user_id || ""),
    username: String(profile.username || "Threads"),
    accessToken: longToken.access_token
  };
}

async function graphGet(path, fields, token) {
  const url = new URL(`https://graph.instagram.com/${graphVersion}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.error) {
    const message = data.error?.message || `Graph API request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function threadsPost(path, params, token) {
  const url = new URL(`https://graph.threads.net/v1.0/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("access_token", token);

  const response = await fetch(url, { method: "POST" });
  const data = await response.json();
  if (!response.ok || data.error) {
    const message = data.error?.message || `Threads API request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function threadsGet(path, params, token) {
  const url = new URL(`https://graph.threads.net/v1.0/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("access_token", token);

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.error) {
    const message = data.error?.message || `Threads API request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function facebookPagePost(path, params, token) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      if (Array.isArray(value)) {
        value.forEach((item, index) => url.searchParams.set(`${key}[${index}]`, JSON.stringify(item)));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  url.searchParams.set("access_token", token);

  const response = await fetch(url, { method: "POST" });
  const data = await response.json();
  if (!response.ok || data.error) {
    const message = data.error?.message || `Facebook Page API request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function waitForContainer(containerId, token) {
  const maxAttempts = Number(process.env.IG_POLL_ATTEMPTS || 20);
  const delayMs = Number(process.env.IG_POLL_DELAY_MS || 3000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await graphGet(containerId, "status_code,status", token);
    if (status.status_code === "FINISHED") return status;
    if (["ERROR", "EXPIRED"].includes(status.status_code)) {
      throw new Error(`Container ${containerId} failed with ${status.status_code}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }

  throw new Error(`Container ${containerId} was not ready before timeout`);
}

async function waitForThreadsContainer(containerId, token) {
  const maxAttempts = Number(process.env.THREADS_POLL_ATTEMPTS || 20);
  const delayMs = Number(process.env.THREADS_POLL_DELAY_MS || 3000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await threadsGet(containerId, { fields: "status,error_message" }, token);
    if (["FINISHED", "PUBLISHED"].includes(status.status)) return status;
    if (["ERROR", "EXPIRED"].includes(status.status)) {
      throw new Error(status.error_message || `Threads container ${containerId} failed with ${status.status}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }

  throw new Error(`Threads container ${containerId} was not ready before timeout`);
}

async function publishCarousel({ imageUrls, caption }) {
  const { userId: igUserId, accessToken } = instagramConfig();

  if (!igUserId || !accessToken) {
    return {
      dryRun: true,
      reason: "IG_USER_ID and IG_ACCESS_TOKEN are not configured.",
      requiredEnv: ["IG_USER_ID", "IG_ACCESS_TOKEN"],
      imageUrls,
      caption
    };
  }

  const childIds = [];
  for (const imageUrl of imageUrls) {
    const child = await graphPost(`${igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: true
    }, accessToken);
    await waitForContainer(child.id, accessToken);
    childIds.push(child.id);
  }

  const carousel = await graphPost(`${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption
  }, accessToken);

  await waitForContainer(carousel.id, accessToken);
  const published = await graphPost(`${igUserId}/media_publish`, {
    creation_id: carousel.id
  }, accessToken);

  return { dryRun: false, childIds, carouselId: carousel.id, published };
}

async function publishThreadsCarousel({ imageUrls, caption, threadsAccountId }) {
  const { userId: threadsUserId, accessToken, label } = selectedThreadsConfig(threadsAccountId);

  if (!threadsUserId || !accessToken) {
    return {
      dryRun: true,
      reason: "THREADS_USER_ID and THREADS_ACCESS_TOKEN are not configured.",
      requiredEnv: ["THREADS_USER_ID", "THREADS_ACCESS_TOKEN"],
      imageUrls,
      caption
    };
  }

  if (!imageUrls.length) {
    const container = await threadsPost(`${threadsUserId}/threads`, {
      media_type: "TEXT",
      text: caption
    }, accessToken);
    await waitForThreadsContainer(container.id, accessToken);
    const published = await threadsPost(`${threadsUserId}/threads_publish`, {
      creation_id: container.id
    }, accessToken);
    return { dryRun: false, account: label || masked(threadsUserId), containerId: container.id, published };
  }

  const childIds = [];
  for (const imageUrl of imageUrls) {
    const child = await threadsPost(`${threadsUserId}/threads`, {
      media_type: "IMAGE",
      image_url: imageUrl,
      is_carousel_item: true
    }, accessToken);
    await waitForThreadsContainer(child.id, accessToken);
    childIds.push(child.id);
  }

  const carousel = await threadsPost(`${threadsUserId}/threads`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    text: caption
  }, accessToken);
  await waitForThreadsContainer(carousel.id, accessToken);
  const published = await threadsPost(`${threadsUserId}/threads_publish`, {
    creation_id: carousel.id
  }, accessToken);

  return { dryRun: false, account: label || masked(threadsUserId), childIds, carouselId: carousel.id, published };
}

async function publishFacebookPagePost({ imageUrls, caption }) {
  const { pageId, accessToken } = facebookPageConfig();

  if (!pageId || !accessToken) {
    return {
      dryRun: true,
      reason: "FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN are not configured.",
      requiredEnv: ["FB_PAGE_ID", "FB_PAGE_ACCESS_TOKEN"],
      imageUrls,
      caption
    };
  }

  if (!imageUrls.length) {
    const published = await facebookPagePost(`${pageId}/feed`, { message: caption }, accessToken);
    return { dryRun: false, published };
  }

  const media = [];
  for (const imageUrl of imageUrls) {
    const photo = await facebookPagePost(`${pageId}/photos`, {
      url: imageUrl,
      published: false
    }, accessToken);
    media.push({ media_fbid: photo.id });
  }

  const published = await facebookPagePost(`${pageId}/feed`, {
    message: caption,
    attached_media: media
  }, accessToken);

  return { dryRun: false, photoIds: media.map((item) => item.media_fbid), published };
}

async function savePublishedImages(images) {
  const base = publicBaseUrl();
  const dir = join(root, "published");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  const files = [];
  for (let index = 0; index < images.length; index += 1) {
    const value = String(images[index] || "");
    const match = value.match(/^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=]+)$/i);
    if (!match) throw new Error(`Image ${index + 1} is not a supported image data URL.`);
    const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    const filename = `card-news-${stamp}-${String(index + 1).padStart(2, "0")}.${ext}`;
    const filePath = join(dir, filename);
    await writeFile(filePath, Buffer.from(match[2], "base64"));
    files.push({
      filename,
      localUrl: `/published/${filename}`,
      publicUrl: base ? `${base}/published/${filename}` : ""
    });
  }

  return {
    files,
    publicBaseUrl: base,
    imageUrls: files.map((file) => file.publicUrl).filter(Boolean)
  };
}

async function handleApi(req, res) {
  try {
    if (req.method === "GET" && req.url === "/api/config") {
      sendJson(res, 200, {
        graphVersion,
        hasInstagramConfig: Boolean(instagramConfig().userId && instagramConfig().accessToken),
        hasThreadsConfig: Boolean(threadsAccounts().length),
        hasFacebookPageConfig: Boolean(facebookPageConfig().pageId && facebookPageConfig().accessToken),
        hasOpenAIConfig: Boolean(runtimeAiSettings.openaiKey || process.env.OPENAI_API_KEY),
        hasGeminiConfig: Boolean(runtimeAiSettings.geminiKey || process.env.GEMINI_API_KEY),
        openaiModel: runtimeAiSettings.openaiModel || openaiModel,
        geminiModel: runtimeAiSettings.geminiModel || geminiModel
      });
      return;
    }

    if (req.method === "GET" && req.url === "/api/social/settings") {
      const ig = instagramConfig();
      const threads = threadsConfig();
      const accounts = publicThreadsAccounts();
      const facebookPage = facebookPageConfig();
      sendJson(res, 200, {
        publicBaseUrl: {
          configured: Boolean(publicBaseUrl()),
          value: publicBaseUrl(),
          source: socialSource(runtimeSocialSettings.publicBaseUrl, "PUBLIC_BASE_URL")
        },
        instagram: {
          configured: Boolean(ig.userId && ig.accessToken),
          userIdPreview: masked(ig.userId),
          tokenPreview: masked(ig.accessToken),
          userIdSource: socialSource(runtimeSocialSettings.igUserId, "IG_USER_ID"),
          tokenSource: socialSource(runtimeSocialSettings.igAccessToken, "IG_ACCESS_TOKEN")
        },
        threads: {
          configured: Boolean(accounts.length || (threads.userId && threads.accessToken)),
          userIdPreview: masked(threads.userId),
          tokenPreview: masked(threads.accessToken),
          userIdSource: socialSource(runtimeSocialSettings.threadsUserId, "THREADS_USER_ID"),
          tokenSource: socialSource(runtimeSocialSettings.threadsAccessToken, "THREADS_ACCESS_TOKEN"),
          accounts
        },
        facebookPage: {
          configured: Boolean(facebookPage.pageId && facebookPage.accessToken),
          pageIdPreview: masked(facebookPage.pageId),
          tokenPreview: masked(facebookPage.accessToken),
          pageIdSource: socialSource(runtimeSocialSettings.facebookPageId, "FB_PAGE_ID"),
          tokenSource: socialSource(runtimeSocialSettings.facebookPageToken, "FB_PAGE_ACCESS_TOKEN")
        }
      });
      return;
    }

    if (req.method === "GET" && req.url === "/api/instagram/oauth/start") {
      const { appId, appSecret, redirectUri } = instagramOAuthConfig();
      if (!publicBaseUrl()) {
        sendJson(res, 400, { error: "PUBLIC_BASE_URL is required before starting Instagram OAuth." });
        return;
      }
      if (!appId || !appSecret) {
        sendJson(res, 400, { error: "IG_APP_ID and IG_APP_SECRET are required before starting Instagram OAuth." });
        return;
      }

      const authUrl = new URL("https://www.instagram.com/oauth/authorize");
      authUrl.searchParams.set("client_id", appId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
        "instagram_business_content_publish",
        "instagram_business_manage_insights"
      ].join(","));
      authUrl.searchParams.set("force_authentication", "true");

      res.writeHead(302, { location: authUrl.toString(), "cache-control": "no-store" });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/instagram/oauth/callback")) {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error") || requestUrl.searchParams.get("error_reason");
      if (error) {
        sendHtml(res, 400, `<main style="font-family:system-ui;padding:40px"><h1>Instagram 연결 실패</h1><p>${error}</p></main>`);
        return;
      }
      if (!code) {
        sendHtml(res, 400, `<main style="font-family:system-ui;padding:40px"><h1>Instagram 연결 실패</h1><p>인증 코드가 없습니다.</p></main>`);
        return;
      }

      const { redirectUri } = instagramOAuthConfig();
      const token = await exchangeInstagramCode(code, redirectUri);
      runtimeSocialSettings.igUserId = token.userId;
      runtimeSocialSettings.igAccessToken = token.accessToken;
      await saveLocalEnv({
        IG_USER_ID: token.userId,
        IG_ACCESS_TOKEN: token.accessToken
      });

      sendHtml(res, 200, `<main style="font-family:system-ui;padding:40px;line-height:1.5"><h1>Instagram 연결 완료</h1><p>토큰이 저장되었습니다. 이 창은 닫고 카드뉴스 앱으로 돌아가도 됩니다.</p><p>계정 ID: ${masked(token.userId)}</p></main>`);
      return;
    }

    if (req.method === "GET" && req.url === "/api/facebook/oauth/start") {
      const { appId, appSecret, redirectUri } = facebookOAuthConfig();
      if (!publicBaseUrl()) {
        sendJson(res, 400, { error: "PUBLIC_BASE_URL is required before starting Facebook Page OAuth." });
        return;
      }
      if (!appId || !appSecret) {
        sendJson(res, 400, { error: "FB_APP_ID and FB_APP_SECRET are required before starting Facebook Page OAuth." });
        return;
      }

      const authUrl = new URL("https://www.facebook.com/dialog/oauth");
      authUrl.searchParams.set("client_id", appId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_manage_posts");

      res.writeHead(302, { location: authUrl.toString(), "cache-control": "no-store" });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/facebook/oauth/callback")) {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error") || requestUrl.searchParams.get("error_reason");
      if (error) {
        sendHtml(res, 400, `<main style="font-family:system-ui;padding:40px"><h1>Facebook 페이지 연결 실패</h1><p>${error}</p></main>`);
        return;
      }
      if (!code) {
        sendHtml(res, 400, `<main style="font-family:system-ui;padding:40px"><h1>Facebook 페이지 연결 실패</h1><p>인증 코드가 없습니다.</p></main>`);
        return;
      }

      const { redirectUri } = facebookOAuthConfig();
      const page = await exchangeFacebookCode(code, redirectUri);
      runtimeSocialSettings.facebookPageId = page.pageId;
      runtimeSocialSettings.facebookPageToken = page.accessToken;
      await saveLocalEnv({
        FB_PAGE_ID: page.pageId,
        FB_PAGE_ACCESS_TOKEN: page.accessToken
      });

      sendHtml(res, 200, `<main style="font-family:system-ui;padding:40px;line-height:1.5"><h1>Facebook 페이지 연결 완료</h1><p>${page.pageName} 페이지 토큰이 저장되었습니다. 카드뉴스 앱으로 돌아가도 됩니다.</p><p>페이지 ID: ${masked(page.pageId)}</p><p>찾은 페이지 수: ${page.pageCount}</p></main>`);
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/threads/oauth/start")) {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const label = String(requestUrl.searchParams.get("label") || "").trim();
      const { appId, appSecret, redirectUri } = threadsOAuthConfig();
      if (!publicBaseUrl()) {
        sendJson(res, 400, { error: "PUBLIC_BASE_URL is required before starting Threads OAuth." });
        return;
      }
      if (!appId || !appSecret) {
        sendJson(res, 400, { error: "THREADS_APP_ID and THREADS_APP_SECRET are required before starting Threads OAuth." });
        return;
      }

      const authUrl = new URL("https://threads.net/oauth/authorize");
      authUrl.searchParams.set("client_id", appId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "threads_basic,threads_content_publish");
      if (label) {
        authUrl.searchParams.set("state", Buffer.from(JSON.stringify({ label })).toString("base64url"));
      }

      res.writeHead(302, { location: authUrl.toString(), "cache-control": "no-store" });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/threads/oauth/callback")) {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error") || requestUrl.searchParams.get("error_reason");
      if (error) {
        sendHtml(res, 400, `<main style="font-family:system-ui;padding:40px"><h1>Threads connection failed</h1><p>${error}</p></main>`);
        return;
      }
      if (!code) {
        sendHtml(res, 400, `<main style="font-family:system-ui;padding:40px"><h1>Threads connection failed</h1><p>Authorization code is missing.</p></main>`);
        return;
      }

      const { redirectUri } = threadsOAuthConfig();
      let label = "";
      const state = requestUrl.searchParams.get("state");
      if (state) {
        try {
          label = JSON.parse(Buffer.from(state, "base64url").toString("utf8")).label || "";
        } catch {
          label = "";
        }
      }
      const token = await exchangeThreadsCode(code, redirectUri);
      const account = upsertRuntimeThreadsAccount({
        id: token.userId,
        label: label || token.username || "Threads account",
        username: token.username,
        userId: token.userId,
        accessToken: token.accessToken
      });
      await saveLocalEnv({
        THREADS_ACCOUNTS: JSON.stringify(threadsAccounts())
      });

      sendHtml(res, 200, `<main style="font-family:system-ui;padding:40px;line-height:1.5"><h1>Threads connected</h1><p>${account.label} token has been saved. You can close this window and return to the card news app.</p><p>User ID: ${masked(token.userId)}</p></main>`);
      return;
    }

    if (req.method === "POST" && req.url === "/api/social/settings") {
      const body = await readBody(req);
      if (body.clear === true) {
        runtimeSocialSettings.igUserId = "";
        runtimeSocialSettings.igAccessToken = "";
        runtimeSocialSettings.threadsUserId = "";
        runtimeSocialSettings.threadsAccessToken = "";
        runtimeSocialSettings.threadsAccounts = [];
        runtimeSocialSettings.facebookPageId = "";
        runtimeSocialSettings.facebookPageToken = "";
        runtimeSocialSettings.publicBaseUrl = "";
        for (const key of ["PUBLIC_BASE_URL", "IG_USER_ID", "IG_ACCESS_TOKEN", "THREADS_USER_ID", "THREADS_ACCESS_TOKEN", "THREADS_ACCOUNTS", "FB_PAGE_ID", "FB_PAGE_ACCESS_TOKEN"]) {
          delete process.env[key];
        }
        await saveLocalEnv({
          PUBLIC_BASE_URL: "",
          IG_USER_ID: "",
          IG_ACCESS_TOKEN: "",
          THREADS_USER_ID: "",
          THREADS_ACCESS_TOKEN: "",
          THREADS_ACCOUNTS: "",
          FB_PAGE_ID: "",
          FB_PAGE_ACCESS_TOKEN: ""
        });
      } else {
        const updates = {};
        if (typeof body.publicBaseUrl === "string" && body.publicBaseUrl.trim()) {
          runtimeSocialSettings.publicBaseUrl = body.publicBaseUrl.trim().replace(/\/+$/, "");
          updates.PUBLIC_BASE_URL = runtimeSocialSettings.publicBaseUrl;
        }
        if (typeof body.igUserId === "string" && body.igUserId.trim()) {
          runtimeSocialSettings.igUserId = body.igUserId.trim();
          updates.IG_USER_ID = runtimeSocialSettings.igUserId;
        }
        if (typeof body.igAccessToken === "string" && body.igAccessToken.trim()) {
          runtimeSocialSettings.igAccessToken = body.igAccessToken.trim();
          updates.IG_ACCESS_TOKEN = runtimeSocialSettings.igAccessToken;
        }
        if (typeof body.threadsUserId === "string" && body.threadsUserId.trim() && typeof body.threadsAccessToken === "string" && body.threadsAccessToken.trim()) {
          upsertRuntimeThreadsAccount({
            id: body.threadsUserId.trim(),
            label: String(body.threadsLabel || "").trim() || "Manual Threads",
            userId: body.threadsUserId.trim(),
            accessToken: body.threadsAccessToken.trim()
          });
          updates.THREADS_ACCOUNTS = JSON.stringify(threadsAccounts());
        }
        if (typeof body.facebookPageId === "string" && body.facebookPageId.trim()) {
          runtimeSocialSettings.facebookPageId = body.facebookPageId.trim();
          updates.FB_PAGE_ID = runtimeSocialSettings.facebookPageId;
        }
        if (typeof body.facebookPageToken === "string" && body.facebookPageToken.trim()) {
          runtimeSocialSettings.facebookPageToken = body.facebookPageToken.trim();
          updates.FB_PAGE_ACCESS_TOKEN = runtimeSocialSettings.facebookPageToken;
        }
        if (Object.keys(updates).length) await saveLocalEnv(updates);
      }
      sendJson(res, 200, {
        ok: true,
        hasInstagramConfig: Boolean(instagramConfig().userId && instagramConfig().accessToken),
        hasThreadsConfig: Boolean(threadsAccounts().length),
        hasFacebookPageConfig: Boolean(facebookPageConfig().pageId && facebookPageConfig().accessToken),
        hasPublicBaseUrl: Boolean(publicBaseUrl())
      });
      return;
    }

    if (req.method === "GET" && req.url === "/api/ai/settings") {
      sendJson(res, 200, {
        openai: {
          configured: Boolean(runtimeAiSettings.openaiKey || process.env.OPENAI_API_KEY),
          source: runtimeAiSettings.openaiKey ? "runtime" : process.env.OPENAI_API_KEY ? "environment" : "none",
          keyPreview: masked(runtimeAiSettings.openaiKey || process.env.OPENAI_API_KEY || ""),
          model: runtimeAiSettings.openaiModel || openaiModel
        },
        gemini: {
          configured: Boolean(runtimeAiSettings.geminiKey || process.env.GEMINI_API_KEY),
          source: runtimeAiSettings.geminiKey ? "runtime" : process.env.GEMINI_API_KEY ? "environment" : "none",
          keyPreview: masked(runtimeAiSettings.geminiKey || process.env.GEMINI_API_KEY || ""),
          model: runtimeAiSettings.geminiModel || geminiModel
        },
        tourApi: {
          configured: Boolean(tourKey()),
          source: runtimeAiSettings.tourApiKey ? "runtime" : (process.env.TOUR_API_KEY || process.env.KTO_API_KEY) ? "environment" : "none",
          keyPreview: masked(tourKey())
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/ai/settings") {
      const body = await readBody(req);
      if (body.clear === true) {
        runtimeAiSettings.openaiKey = "";
        runtimeAiSettings.geminiKey = "";
        runtimeAiSettings.tourApiKey = "";
      } else {
        if (typeof body.openaiKey === "string" && body.openaiKey.trim()) {
          runtimeAiSettings.openaiKey = body.openaiKey.trim();
        }
        if (typeof body.geminiKey === "string" && body.geminiKey.trim()) {
          runtimeAiSettings.geminiKey = body.geminiKey.trim();
        }
        if (typeof body.tourApiKey === "string" && body.tourApiKey.trim()) {
          runtimeAiSettings.tourApiKey = body.tourApiKey.trim();
          await saveLocalEnv({ TOUR_API_KEY: runtimeAiSettings.tourApiKey });
        }
      }
      if (typeof body.openaiModel === "string" && body.openaiModel.trim()) {
        runtimeAiSettings.openaiModel = body.openaiModel.trim();
      }
      if (typeof body.geminiModel === "string" && body.geminiModel.trim()) {
        runtimeAiSettings.geminiModel = body.geminiModel.trim();
      }

      sendJson(res, 200, {
        ok: true,
        hasOpenAIConfig: Boolean(runtimeAiSettings.openaiKey || process.env.OPENAI_API_KEY),
        hasGeminiConfig: Boolean(runtimeAiSettings.geminiKey || process.env.GEMINI_API_KEY),
        hasTourApiConfig: Boolean(tourKey())
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/tour/festivals") {
      const body = await readBody(req);
      const keyword = String(body.keyword || "").trim();
      const eventStartDate = compactDate(body.eventStartDate) || compactDate(new Date().toISOString().slice(0, 10));
      const data = await fetchTourApi("searchFestival2", {
        numOfRows: 80,
        pageNo: 1,
        arrange: "O",
        eventStartDate
      });
      let festivals = normalizeTourItems(data).map((item) => ({
        contentid: item.contentid,
        contenttypeid: item.contenttypeid,
        title: stripHtml(item.title),
        addr1: item.addr1 || "",
        addr2: item.addr2 || "",
        eventstartdate: item.eventstartdate || "",
        eventenddate: item.eventenddate || "",
        firstimage: item.firstimage || "",
        firstimage2: item.firstimage2 || "",
        mapx: item.mapx || "",
        mapy: item.mapy || ""
      }));

      if (keyword) {
        festivals = festivals.filter((festival) =>
          `${festival.title} ${festival.addr1} ${festival.addr2}`.includes(keyword)
        );
      }

      sendJson(res, 200, { festivals });
      return;
    }

    if (req.method === "POST" && req.url === "/api/tour/festival-card") {
      const body = await readBody(req);
      const festival = body.festival || {};
      const contentId = String(festival.contentid || body.contentId || "");
      let detail = {};
      let extraImages = [];
      if (contentId) {
        const detailData = await fetchTourApi("detailCommon2", {
          contentId
        });
        detail = normalizeTourItems(detailData)[0] || {};
        try {
          const imageData = await fetchTourApi("detailImage2", {
            contentId,
            imageYN: "Y"
          });
          extraImages = normalizeTourItems(imageData)
            .filter((item) => !String(item.imgname || "").includes("포스터"))
            .map((item) => item.originimgurl || item.smallimageurl || "")
            .filter(Boolean);
        } catch {
          extraImages = [];
        }
      }
      const imageUrls = [
        festival.firstimage,
        detail.firstimage,
        ...extraImages
      ].filter(Boolean);
      const uniqueImageUrls = [...new Set(imageUrls)]
        .filter((url) => !String(url).includes("_image3_"));
      const cards = buildFestivalImageCards(festivalCards(festival, detail), uniqueImageUrls);

      sendJson(res, 200, {
        cards,
        caption: buildTravelCaption(festival, detail),
        imageUrl: uniqueImageUrls[0] || "",
        imageUrls: uniqueImageUrls
      });
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/tour/image-data")) {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const imageUrl = requestUrl.searchParams.get("url");
      if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
        sendJson(res, 400, { error: "Valid image URL is required." });
        return;
      }
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        sendJson(res, 502, { error: "Image fetch failed." });
        return;
      }
      const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      sendJson(res, 200, {
        dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/ai/cards") {
      const body = await readBody(req);
      const params = {
        provider: String(body.provider || "auto"),
        topic: String(body.topic || "").trim(),
        sourceText: String(body.sourceText || "").trim(),
        referenceNotes: String(body.referenceNotes || "").trim(),
        tone: String(body.tone || "practical"),
        style: String(body.style || "cream"),
        cardCount: Math.max(3, Math.min(10, Number(body.cardCount) || 7))
      };

      let cards = null;
      let provider = "local";
      let providerLabel = "로컬 샘플";

      if (params.provider === "openai" || params.provider === "auto") {
        cards = await generateWithOpenAI(params);
        if (cards) {
          provider = "openai";
          providerLabel = `GPT API (${runtimeAiSettings.openaiModel || openaiModel})`;
        }
      }

      if (!cards && (params.provider === "gemini" || params.provider === "auto")) {
        cards = await generateWithGemini(params);
        if (cards) {
          provider = "gemini";
          providerLabel = `Gemini API (${runtimeAiSettings.geminiModel || geminiModel})`;
        }
      }

      if (!cards && params.provider !== "local") {
        provider = "local";
        providerLabel = "로컬 샘플";
      }

      sendJson(res, 200, {
        provider,
        providerLabel,
        cards: cards || localCards(params)
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/instagram/publish") {
      const body = await readBody(req);
      const imageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.map((url) => String(url).trim()).filter(Boolean)
        : [];
      const caption = String(body.caption || "").trim();

      if (imageUrls.length < 2 || imageUrls.length > 10) {
        sendJson(res, 400, { error: "Carousel publishing requires 2 to 10 public image URLs." });
        return;
      }

      const result = await publishCarousel({ imageUrls, caption });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/assets") {
      const body = await readBody(req);
      const images = Array.isArray(body.images) ? body.images : [];
      if (!images.length || images.length > 10) {
        sendJson(res, 400, { error: "1 to 10 card images are required." });
        return;
      }
      const result = await savePublishedImages(images);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/threads/publish") {
      const body = await readBody(req);
      const imageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.map((url) => String(url).trim()).filter(Boolean)
        : [];
      const caption = String(body.caption || "").trim();
      const threadsAccountId = String(body.threadsAccountId || "").trim();

      if (imageUrls.length > 10) {
        sendJson(res, 400, { error: "Threads publishing supports up to 10 card images in this app." });
        return;
      }
      if (!caption && !imageUrls.length) {
        sendJson(res, 400, { error: "Threads publishing requires text or images." });
        return;
      }

      const result = await publishThreadsCarousel({ imageUrls, caption, threadsAccountId });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/facebook/publish") {
      const body = await readBody(req);
      const imageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.map((url) => String(url).trim()).filter(Boolean)
        : [];
      const caption = String(body.caption || "").trim();

      if (imageUrls.length > 10) {
        sendJson(res, 400, { error: "Facebook Page publishing supports up to 10 card images in this app." });
        return;
      }
      if (!caption && !imageUrls.length) {
        sendJson(res, 400, { error: "Facebook Page publishing requires text or images." });
        return;
      }

      const result = await publishFacebookPagePost({ imageUrls, caption });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/social/publish") {
      const body = await readBody(req);
      const imageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.map((url) => String(url).trim()).filter(Boolean)
        : [];
      const caption = String(body.caption || "").trim();
      const threadsAccountId = String(body.threadsAccountId || "").trim();
      const targets = Array.isArray(body.targets) && body.targets.length
        ? body.targets.map((target) => String(target))
        : ["instagram", "threads"];

      if (imageUrls.length < 1 || imageUrls.length > 10) {
        sendJson(res, 400, { error: "Publishing requires 1 to 10 public image URLs." });
        return;
      }

      const result = {};
      if (targets.includes("instagram")) {
        if (imageUrls.length < 2) {
          result.instagram = { skipped: true, reason: "Instagram carousel publishing requires at least 2 images." };
        } else {
          result.instagram = await publishCarousel({ imageUrls, caption });
        }
      }
      if (targets.includes("threads")) {
        result.threads = await publishThreadsCarousel({ imageUrls, caption, threadsAccountId });
      }
      if (targets.includes("facebook")) {
        result.facebook = await publishFacebookPagePost({ imageUrls, caption });
      }

      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: "Unknown API route." });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = resolve(join(root, safePath));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Card news automation is running at http://localhost:${port}`);
});
