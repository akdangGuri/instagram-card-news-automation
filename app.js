const state = {
  currentIndex: 0,
  style: "cream",
  backgroundImage: "",
  festivals: [],
  cards: [],
  publishImageUrls: []
};

const $ = (selector) => document.querySelector(selector);

const styleCopy = {
  cream: {
    label: "크림 에디토리얼",
    footer: "save this"
  },
  mono: {
    label: "블랙 미니멀",
    footer: "checklist"
  },
  pop: {
    label: "팝 후킹",
    footer: "swipe"
  },
  photo: {
    label: "사진 뉴스형",
    footer: ""
  },
  premium: {
    label: "프리미엄 리포트",
    footer: "premium report"
  }
};

const defaultCards = [
  {
    kicker: "오늘의 체크리스트",
    title: "자영업자 세금 절약 체크리스트",
    body: "작게 새는 비용부터 막으면\n1년 세금 흐름이 달라집니다."
  },
  {
    kicker: "01",
    title: "증빙은 바로 모으기",
    body: "카드 매출, 현금영수증, 세금계산서를\n월말에 몰아서 찾지 않게 만드세요."
  },
  {
    kicker: "02",
    title: "사업용 계좌 분리",
    body: "개인 지출과 사업 지출이 섞이면\n비용 인정과 정리가 모두 어려워집니다."
  },
  {
    kicker: "03",
    title: "놓치기 쉬운 비용",
    body: "통신비, 구독료, 차량비, 교육비처럼\n반복 지출부터 먼저 체크하세요."
  },
  {
    kicker: "04",
    title: "부가세 일정 관리",
    body: "신고 직전에 정리하면 누락이 생깁니다.\n매월 15분 정리 루틴을 만드세요."
  },
  {
    kicker: "05",
    title: "전문가에게 물을 타이밍",
    body: "매출이 늘거나 직원을 채용했다면\n절세보다 리스크 관리가 먼저입니다."
  },
  {
    kicker: "저장하기",
    title: "매월 한 번만 확인하세요",
    body: "오늘 체크리스트를 저장하고\n이번 달 지출부터 정리해보세요."
  }
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function splitSourceLines(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function topicKeywords(topic) {
  return topic
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
}

function makeLocalDraft(topic, count, sourceText, referenceNotes) {
  const lines = splitSourceLines(sourceText);
  const note = referenceNotes.trim();
  const keyword = topicKeywords(topic);

  const fallback = [
    "문제를 먼저 짚고, 왜 지금 확인해야 하는지 알려주세요.",
    "독자가 바로 공감할 상황을 한 가지 보여주세요.",
    "가장 먼저 실행할 수 있는 행동을 제안하세요.",
    "놓치기 쉬운 실수나 체크포인트를 짚어주세요.",
    "예시를 넣어 이해하기 쉽게 만들어주세요.",
    "핵심을 짧게 요약하고 저장할 이유를 주세요."
  ];

  return Array.from({ length: count }, (_, index) => {
    if (index === 0) {
      return {
        kicker: "오늘의 카드뉴스",
        title: topic,
        body: note ? `레퍼런스 방향: ${note}` : "핵심만 빠르게 정리했습니다."
      };
    }

    if (index === count - 1) {
      return {
        kicker: "마무리",
        title: "저장하고 다시 보기",
        body: "필요할 때 바로 꺼내 볼 수 있게\n오늘의 핵심을 저장해두세요."
      };
    }

    const body = lines[index - 1] || fallback[(index - 1) % fallback.length];
    return {
      kicker: String(index).padStart(2, "0"),
      title: `${keyword} 포인트 ${index}`,
      body
    };
  });

}

async function makeDraft() {
  const topic = $("#topic").value.trim() || "새 카드뉴스";
  const count = Math.max(3, Math.min(10, Number($("#cardCount").value) || 7));
  const sourceText = $("#sourceText").value.trim();
  const referenceNotes = $("#referenceNotes").value.trim();
  const status = $("#generateStatus");
  const button = $("#generateBtn");

  status.textContent = "카드 문구를 생성하는 중...";
  button.disabled = true;

  try {
    const response = await fetch("/api/ai/cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: $("#aiProvider").value,
        topic,
        sourceText,
        referenceNotes,
        tone: $("#tone").value,
        cardCount: count,
        style: state.style
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "AI 생성에 실패했습니다.");

    const cards = Array.isArray(data.cards) && data.cards.length
      ? data.cards
      : makeLocalDraft(topic, count, sourceText, referenceNotes);
    setCards(cards.slice(0, 10));
    status.textContent = data.provider === "local"
      ? "API 키가 없어 로컬 샘플로 만들었습니다."
      : `${data.providerLabel || data.provider}로 만들었습니다.`;
  } catch (error) {
    setCards(makeLocalDraft(topic, count, sourceText, referenceNotes));
    status.textContent = `AI 호출 실패: ${error.message} 로컬 샘플로 대체했습니다.`;
  } finally {
    button.disabled = false;
  }
}

async function refreshApiStatus() {
  const status = $("#apiStatus");
  try {
    const response = await fetch("/api/ai/settings");
    const data = await response.json();
    const parts = [];
    if (data.openai?.configured) {
      parts.push(`OpenAI: ${data.openai.keyPreview} (${data.openai.source === "runtime" ? "임시 저장" : "환경변수"})`);
    }
    if (data.gemini?.configured) {
      parts.push(`Gemini: ${data.gemini.keyPreview} (${data.gemini.source === "runtime" ? "임시 저장" : "환경변수"})`);
    }
    if (data.tourApi?.configured) {
      parts.push(`TourAPI: ${data.tourApi.keyPreview} (${data.tourApi.source === "runtime" ? "임시 저장" : "환경변수"})`);
    }
    status.textContent = parts.length
      ? parts.join(" / ")
      : "키는 브라우저에 저장하지 않고 로컬 서버 메모리에만 보관됩니다.";
    if (data.openai?.model) $("#openaiModel").value = data.openai.model;
    if (data.gemini?.model) $("#geminiModel").value = data.gemini.model;
  } catch {
    status.textContent = "API 설정 상태를 불러오지 못했습니다.";
  }
}

async function saveApiSettings() {
  const status = $("#apiStatus");
  status.textContent = "API 설정 저장 중...";
  const response = await fetch("/api/ai/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      openaiKey: $("#openaiKey").value,
      openaiModel: $("#openaiModel").value,
      geminiKey: $("#geminiKey").value,
      geminiModel: $("#geminiModel").value,
      tourApiKey: $("#tourApiKey").value
    })
  });
  if (!response.ok) {
    status.textContent = "API 설정 저장에 실패했습니다.";
    return;
  }
  $("#openaiKey").value = "";
  $("#geminiKey").value = "";
  $("#tourApiKey").value = "";
  await refreshApiStatus();
}

async function clearApiSettings() {
  const status = $("#apiStatus");
  status.textContent = "임시 저장된 키를 지우는 중...";
  await fetch("/api/ai/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clear: true,
      openaiModel: $("#openaiModel").value,
      geminiModel: $("#geminiModel").value
    })
  });
  $("#openaiKey").value = "";
  $("#geminiKey").value = "";
  $("#tourApiKey").value = "";
  await refreshApiStatus();
}

async function refreshSocialStatus() {
  const status = $("#socialStatus");
  try {
    const response = await fetch("/api/social/settings");
    const data = await response.json();
    const parts = [];
    if (data.publicBaseUrl?.configured) {
      parts.push(`공개 URL: ${data.publicBaseUrl.value}`);
      $("#publicBaseUrl").value = data.publicBaseUrl.value;
    }
    if (data.instagram?.configured) {
      parts.push(`Instagram: ${data.instagram.userIdPreview} / ${data.instagram.tokenPreview}`);
    }
    if (data.threads?.configured) {
      parts.push(`Threads: ${data.threads.userIdPreview} / ${data.threads.tokenPreview}`);
    }
    if (data.facebookPage?.configured) {
      parts.push(`Facebook Page: ${data.facebookPage.pageIdPreview} / ${data.facebookPage.tokenPreview}`);
    }
    status.textContent = parts.length
      ? parts.join(" / ")
      : "자동발행에는 Meta 권한과 공개 이미지 URL이 필요합니다.";
  } catch {
    status.textContent = "자동발행 설정 상태를 불러오지 못했습니다.";
  }
}

async function saveSocialSettings() {
  const status = $("#socialStatus");
  status.textContent = "자동발행 설정 저장 중...";
  const response = await fetch("/api/social/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicBaseUrl: $("#publicBaseUrl").value,
      igUserId: $("#igUserId").value,
      igAccessToken: $("#igAccessToken").value,
      threadsUserId: $("#threadsUserId").value,
      threadsAccessToken: $("#threadsAccessToken").value,
      facebookPageId: $("#facebookPageId").value,
      facebookPageToken: $("#facebookPageToken").value
    })
  });
  if (!response.ok) {
    status.textContent = "자동발행 설정 저장에 실패했습니다.";
    return;
  }
  $("#igUserId").value = "";
  $("#igAccessToken").value = "";
  $("#threadsUserId").value = "";
  $("#threadsAccessToken").value = "";
  $("#facebookPageId").value = "";
  $("#facebookPageToken").value = "";
  state.publishImageUrls = [];
  await refreshSocialStatus();
}

async function clearSocialSettings() {
  $("#socialStatus").textContent = "자동발행 설정을 지우는 중...";
  await fetch("/api/social/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clear: true })
  });
  $("#publicBaseUrl").value = "";
  $("#igUserId").value = "";
  $("#igAccessToken").value = "";
  $("#threadsUserId").value = "";
  $("#threadsAccessToken").value = "";
  $("#facebookPageId").value = "";
  $("#facebookPageToken").value = "";
  state.publishImageUrls = [];
  await refreshSocialStatus();
}

function formatFestivalDate(value) {
  if (!value || value.length !== 8) return "";
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function renderFestivalResults() {
  const box = $("#festivalResults");
  if (!state.festivals.length) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = state.festivals.map((festival, index) => `
    <button type="button" class="festival-item" data-index="${index}">
      <strong>${escapeHtml(festival.title)}</strong>
      <span>${escapeHtml(formatFestivalDate(festival.eventstartdate))}${festival.eventenddate ? ` - ${escapeHtml(formatFestivalDate(festival.eventenddate))}` : ""}</span>
      <small>${escapeHtml(festival.addr1 || "장소 정보 없음")}</small>
    </button>
  `).join("");

  box.querySelectorAll(".festival-item").forEach((button) => {
    button.addEventListener("click", () => applyFestival(Number(button.dataset.index)));
  });
}

async function searchFestivals() {
  const status = $("#festivalStatus");
  status.textContent = "축제 정보를 불러오는 중...";
  try {
    const response = await fetch("/api/tour/festivals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        keyword: $("#festivalKeyword").value.trim(),
        eventStartDate: $("#festivalStartDate").value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "축제 검색에 실패했습니다.");
    state.festivals = data.festivals || [];
    renderFestivalResults();
    status.textContent = state.festivals.length
      ? `${state.festivals.length}개 축제를 찾았습니다. 하나를 선택하세요.`
      : "검색 결과가 없습니다. 검색어를 줄이거나 시작일을 바꿔보세요.";
  } catch (error) {
    status.textContent = error.message;
  }
}

async function applyFestival(index) {
  const festival = state.festivals[index];
  if (!festival) return;
  const status = $("#festivalStatus");
  status.textContent = "축제를 카드뉴스로 적용하는 중...";
  try {
    const response = await fetch("/api/tour/festival-card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ festival })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "축제 적용에 실패했습니다.");

    $("#topic").value = festival.title;
    $("#sourceText").value = `${festival.title}\n${festival.addr1 || ""}\n${formatFestivalDate(festival.eventstartdate)}${festival.eventenddate ? ` - ${formatFestivalDate(festival.eventenddate)}` : ""}`;
    const cards = data.cards || [];
    setCards(cards);
    $("#caption").value = data.caption || $("#caption").value;

    const uniqueImages = [...new Set(cards.map((card) => card.imageUrl).filter(Boolean))].slice(0, 10);
    const imageMap = new Map();
    for (const imageUrl of uniqueImages) {
      try {
        const imageResponse = await fetch(`/api/tour/image-data?url=${encodeURIComponent(imageUrl)}`);
        const imageData = await imageResponse.json();
        if (imageResponse.ok && imageData.dataUrl) {
          imageMap.set(imageUrl, imageData.dataUrl);
        }
      } catch {
        // Continue with any images that did load.
      }
    }
    state.cards = state.cards.map((card) => ({
      ...card,
      imageDataUrl: imageMap.get(card.imageUrl) || ""
    }));
    state.backgroundImage = state.cards.find((card) => card.imageDataUrl)?.imageDataUrl || "";
    state.style = "premium";
    $("#styleOptions").querySelectorAll(".style-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.style === "premium");
    });
    renderAll();
    if (data.caption) $("#caption").value = data.caption;
    status.textContent = "축제 카드뉴스를 적용했습니다.";
  } catch (error) {
    status.textContent = error.message;
  }
}

function setCards(cards) {
  state.cards = cards;
  state.currentIndex = 0;
  state.publishImageUrls = [];
  renderAll();
}

function renderPreview() {
  const card = state.cards[state.currentIndex];
  const brand = $("#brandName").value.trim() || "Card News";
  const cardClass = `card-preview style-${state.style}`;
  const bodyText = String(card.body || "");
  const textLength = `${card.title || ""}${bodyText}`.length;
  const lineCount = bodyText.split("\n").filter(Boolean).length;
  const longestLine = bodyText.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
  const densityClass = lineCount >= 4 || textLength > 130
    ? " text-dense"
    : lineCount >= 3 || longestLine > 32 || textLength > 85
      ? " text-medium"
      : "";
  $("#cardPreview").className = cardClass;
  const cardBackground = card.imageDataUrl || state.backgroundImage;
  $("#cardPreview").style.setProperty("--photo-bg", cardBackground ? `url("${cardBackground}")` : "none");
  $("#deckTitle").textContent = state.cards[0]?.title || $("#topic").value;
  $("#pageLabel").textContent = `${state.currentIndex + 1} / ${state.cards.length}`;

  if (state.style === "premium" && cardBackground) {
    $("#cardPreview").className = `${cardClass}${densityClass}`;
    $("#cardPreview").innerHTML = `
      <div class="premium-image-stage">
        <img src="${escapeHtml(cardBackground)}" alt="">
        <div class="premium-topline">
          <span>${escapeHtml(card.kicker)}</span>
          <span>${escapeHtml(brand)}</span>
        </div>
      </div>
      <div class="premium-copy-panel">
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.body)}</p>
        <div class="premium-bottomline">
          <span>${String(state.currentIndex + 1).padStart(2, "0")}</span>
          <span>${styleCopy.premium.footer}</span>
        </div>
      </div>
    `;
    return;
  }

  if (state.style === "photo") {
    $("#cardPreview").innerHTML = `
      <div class="photo-brand">${escapeHtml(brand)}</div>
      <div class="photo-copy">
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.body)}</p>
      </div>
      <div class="photo-footer">
        <span>${escapeHtml(brand)}</span>
        <span>${String(state.currentIndex + 1).padStart(2, "0")}</span>
      </div>
    `;
    return;
  }

  $("#cardPreview").innerHTML = `
    <div class="card-top">
      <span>${escapeHtml(card.kicker)}</span>
      <span>${escapeHtml(brand)}</span>
    </div>
    <div class="card-main">
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.body)}</p>
    </div>
    <div class="card-bottom">
      <span>${String(state.currentIndex + 1).padStart(2, "0")}</span>
      <span>${styleCopy[state.style].footer}</span>
    </div>
  `;
}

function handleBackgroundImage(event) {
  const file = event.target.files?.[0];
  if (!file) {
    state.backgroundImage = "";
    state.publishImageUrls = [];
    renderPreview();
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.backgroundImage = reader.result;
    state.publishImageUrls = [];
    state.style = "photo";
    $("#styleOptions").querySelectorAll(".style-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.style === "photo");
    });
    renderPreview();
  });
  reader.readAsDataURL(file);
}

function renderEditors() {
  const index = state.currentIndex;
  const card = state.cards[index];
  $("#cardEditors").innerHTML = `
    <div class="edit-card is-active" data-index="${index}">
      <div class="edit-card-head">
        <span>${index + 1}</span>
        <strong>${state.cards.length}장 중 현재 카드</strong>
      </div>
      <label>
        작은 제목
        <input class="kicker-input" value="${escapeHtml(card.kicker)}">
      </label>
      <label>
        제목
        <input class="title-input" value="${escapeHtml(card.title)}">
      </label>
      <label>
        본문
        <textarea class="body-input" rows="4">${escapeHtml(card.body)}</textarea>
      </label>
    </div>
  `;

  const element = $("#cardEditors").querySelector(".edit-card");
  element.querySelector(".kicker-input").addEventListener("input", (event) => {
    state.cards[index].kicker = event.target.value;
    state.publishImageUrls = [];
    renderPreview();
    renderFilmstrip();
  });
  element.querySelector(".title-input").addEventListener("input", (event) => {
    state.cards[index].title = event.target.value;
    state.publishImageUrls = [];
    renderPreview();
    renderFilmstrip();
    syncCaption();
  });
  element.querySelector(".body-input").addEventListener("input", (event) => {
    state.cards[index].body = event.target.value;
    state.publishImageUrls = [];
    renderPreview();
    syncCaption();
  });
}

function renderFilmstrip() {
  $("#filmstrip").innerHTML = state.cards.map((card, index) => `
    <button class="thumb ${index === state.currentIndex ? "is-active" : ""}" data-index="${index}">
      <span>${index + 1}</span>
      <strong>${escapeHtml(card.title)}</strong>
    </button>
  `).join("");

  $("#filmstrip").querySelectorAll(".thumb").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentIndex = Number(button.dataset.index);
      renderAll();
    });
  });
}

function cleanHashtag(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 24);
}

function buildHashtags(values) {
  const seen = new Set();
  return values
    .map(cleanHashtag)
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

function syncCaption() {
  const title = state.cards[0]?.title || $("#topic").value.trim() || "오늘의 여행";
  const sourceLines = $("#sourceText").value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const place = sourceLines[1] || "";
  const region = place.split(/\s+/).filter(Boolean).slice(0, 2).join("");
  const period = sourceLines[2] || "";
  const highlights = state.cards
    .slice(1, 4)
    .map((card) => card.title)
    .filter(Boolean);

  const tags = buildHashtags([
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
    "VisitKorea",
    "KoreaTravel"
  ]);

  $("#caption").value = [
    `${title}, 이번 여행 리스트에 넣어볼까요?`,
    "",
    "사진도 남기고, 산책도 하고, 하루 기분 전환하기 좋은 코스로 추천해요.",
    highlights.length ? `놓치면 아쉬운 포인트는 ${highlights.join(", ")}예요.` : "",
    "",
    place ? `장소: ${place}` : "",
    period ? `일정: ${period}` : "",
    "",
    "같이 갈 사람에게 공유해두고, 일정 맞는 날 가볍게 다녀와보세요.",
    "",
    tags
  ].filter((line, index, lines) => line || lines[index - 1] !== "").join("\n");
}

function cardDensity(card) {
  const bodyText = String(card.body || "");
  const textLength = `${card.title || ""}${bodyText}`.length;
  const lineCount = bodyText.split("\n").filter(Boolean).length;
  const longestLine = bodyText.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
  if (lineCount >= 4 || textLength > 130) return "dense";
  if (lineCount >= 3 || longestLine > 32 || textLength > 85) return "medium";
  return "normal";
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function canvasFont(size, weight = 800) {
  return `${weight} ${size}px "Malgun Gothic", "Segoe UI", Arial, sans-serif`;
}

function wrapCanvasLine(ctx, text, maxWidth) {
  const words = String(text || "").split(/(\s+)/).filter(Boolean);
  const lines = [];
  let line = "";
  const pushByChar = (value) => {
    let chunk = "";
    for (const char of value) {
      const next = chunk + char;
      if (ctx.measureText(next).width > maxWidth && chunk) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = next;
      }
    }
    if (chunk) lines.push(chunk);
  };

  for (const word of words) {
    const next = line + word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line.trim()) lines.push(line.trim());
    line = "";
    if (ctx.measureText(word).width > maxWidth) pushByChar(word.trim());
    else line = word.trim();
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function drawMultilineText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 20) {
  const lines = [];
  for (const sourceLine of String(text || "").split("\n")) {
    lines.push(...wrapCanvasLine(ctx, sourceLine, maxWidth));
  }
  const visible = lines.slice(0, maxLines);
  visible.forEach((line, index) => {
    ctx.fillText(index === maxLines - 1 && lines.length > maxLines ? `${line.slice(0, -1)}…` : line, x, y + (index * lineHeight));
  });
  return visible.length * lineHeight;
}

function loadCanvasImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawCoverImage(ctx, image, x, y, width, height) {
  if (!image) {
    const fallback = ctx.createLinearGradient(x, y, x + width, y + height);
    fallback.addColorStop(0, "#30445f");
    fallback.addColorStop(1, "#0b1020");
    ctx.fillStyle = fallback;
    ctx.fillRect(x, y, width, height);
    return;
  }
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function drawCardToCanvas(index) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  const card = state.cards[index];
  const brand = $("#brandName").value.trim() || "Card News";
  const density = cardDensity(card);
  const background = card.imageDataUrl || state.backgroundImage;
  const image = await loadCanvasImage(background);

  ctx.textBaseline = "top";

  if (state.style === "premium" && background) {
    const imageHeight = density === "dense" ? 837 : 932;
    drawCoverImage(ctx, image, 0, 0, 1080, imageHeight);
    const overlay = ctx.createLinearGradient(0, 0, 0, imageHeight);
    overlay.addColorStop(0, "rgba(0,0,0,0.08)");
    overlay.addColorStop(0.6, "rgba(0,0,0,0.06)");
    overlay.addColorStop(1, "rgba(0,0,0,0.48)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, 1080, imageHeight);

    ctx.fillStyle = "#ffffff";
    ctx.font = canvasFont(34, 950);
    ctx.fillText(card.kicker || "", 68, 64);
    const brandWidth = ctx.measureText(brand).width;
    ctx.fillText(brand, 1012 - brandWidth, 64);

    const panelY = imageHeight;
    ctx.fillStyle = "#071426";
    ctx.fillRect(0, panelY, 1080, 1350 - panelY);
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(0, panelY, 1080, 8);

    const titleSize = density === "dense" ? 50 : density === "medium" ? 56 : 64;
    const bodySize = density === "dense" ? 31 : density === "medium" ? 35 : 39;
    ctx.fillStyle = "#ffffff";
    ctx.font = canvasFont(titleSize, 950);
    drawMultilineText(ctx, card.title, 68, panelY + 42, 944, titleSize * 1.08, 2);
    ctx.fillStyle = "#f9f3df";
    ctx.font = canvasFont(bodySize, 800);
    drawMultilineText(ctx, card.body, 68, panelY + 42 + (titleSize * 1.25), 944, bodySize * 1.35, density === "dense" ? 5 : 4);

    ctx.strokeStyle = "rgba(212,175,55,0.62)";
    ctx.lineWidth = 2;
    roundRectPath(ctx, 32, 32, 1016, 1286, 16);
    ctx.stroke();

    ctx.fillStyle = "#f7e8b1";
    ctx.font = canvasFont(28, 950);
    ctx.fillText(String(index + 1).padStart(2, "0"), 68, 1270);
    const footer = styleCopy.premium.footer.toUpperCase();
    ctx.fillText(footer, 1012 - ctx.measureText(footer).width, 1270);
    return canvas;
  }

  if (state.style === "photo") {
    drawCoverImage(ctx, image, 0, 0, 1080, 1350);
    const overlay = ctx.createLinearGradient(0, 0, 0, 1350);
    overlay.addColorStop(0, "rgba(0,0,0,0.08)");
    overlay.addColorStop(0.45, "rgba(0,0,0,0.2)");
    overlay.addColorStop(1, "rgba(0,0,0,0.82)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = "#ffffff";
    ctx.font = canvasFont(38, 950);
    ctx.fillText(brand, 68, 72);
    ctx.font = canvasFont(76, 950);
    drawMultilineText(ctx, card.title, 72, 840, 936, 84, 3);
    ctx.fillStyle = "#ffffff";
    ctx.font = canvasFont(43, 950);
    drawMultilineText(ctx, card.body, 72, 1048, 936, 58, 3);
    ctx.font = canvasFont(28, 900);
    ctx.fillText(String(index + 1).padStart(2, "0"), 940, 1250);
    return canvas;
  }

  const palette = {
    cream: { bg: "#fff4df", fg: "#171717", title: "#0c4b41", body: "#171717", bar: "#116a5b" },
    mono: { bg: "#111111", fg: "#f8f8f5", title: "#f8f8f5", body: "#d7d7cf", bar: "#f8f8f5" },
    pop: { bg: "#ffdf4d", fg: "#141414", title: "#141414", body: "#141414", bar: "#ef3d5b" }
  }[state.style] || { bg: "#fff4df", fg: "#171717", title: "#0c4b41", body: "#171717", bar: "#116a5b" };

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, 1080, 1350);
  if (state.style === "cream") {
    ctx.fillStyle = palette.bar;
    ctx.fillRect(0, 0, 1080, 24);
  }
  if (state.style === "pop") {
    ctx.fillStyle = palette.bar;
    ctx.beginPath();
    ctx.arc(960, 250, 160, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = palette.fg;
  ctx.font = canvasFont(36, 950);
  ctx.fillText(card.kicker || "", 84, 86);
  ctx.fillText(brand, 996 - ctx.measureText(brand).width, 86);

  ctx.fillStyle = palette.title;
  ctx.font = canvasFont(86, 950);
  drawMultilineText(ctx, card.title, 84, 430, 912, 96, 3);
  ctx.fillStyle = palette.body;
  ctx.font = canvasFont(45, 750);
  if (state.style === "pop") {
    roundRectPath(ctx, 76, 754, 928, 240, 16);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = palette.body;
    drawMultilineText(ctx, card.body, 116, 794, 848, 62, 3);
  } else {
    drawMultilineText(ctx, card.body, 84, 760, 912, 62, 5);
  }

  if (state.style === "mono") {
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(84, 1188);
    ctx.lineTo(996, 1188);
    ctx.stroke();
  }
  ctx.fillStyle = palette.fg;
  ctx.font = canvasFont(34, 950);
  ctx.fillText(String(index + 1).padStart(2, "0"), 84, 1236);
  const footer = styleCopy[state.style].footer;
  ctx.fillText(footer, 996 - ctx.measureText(footer).width, 1236);
  return canvas;
}

function renderAll() {
  renderPreview();
  renderEditors();
  renderFilmstrip();
  syncCaption();
}

async function cardToPng(index) {
  const originalIndex = state.currentIndex;
  state.currentIndex = index;
  renderPreview();

  await document.fonts.ready;
  const canvas = await drawCardToCanvas(index);
  state.currentIndex = originalIndex;
  renderAll();
  return canvas.toDataURL("image/png");
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

async function uploadCardsForPublishing(force = false) {
  const status = $("#publishStatus");
  if (!force && state.publishImageUrls.length === state.cards.length) {
    return state.publishImageUrls;
  }

  status.textContent = "카드 이미지를 발행용 PNG로 만드는 중...";
  const images = [];
  for (let index = 0; index < state.cards.length; index += 1) {
    status.textContent = `카드 이미지 생성 중... ${index + 1}/${state.cards.length}`;
    images.push(await cardToPng(index));
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  status.textContent = "서버에 발행용 이미지를 저장하는 중...";
  const response = await fetch("/api/publish/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ images })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "발행용 이미지 저장에 실패했습니다.");

  state.publishImageUrls = data.imageUrls || [];
  if (!state.publishImageUrls.length) {
    const localList = (data.files || []).map((file) => file.localUrl).join(", ");
    throw new Error(`공개 URL이 없어 Meta가 이미지를 읽을 수 없습니다. 공개 URL을 설정하세요. 저장된 파일: ${localList}`);
  }
  if (!state.publishImageUrls.every((url) => url.startsWith("https://"))) {
    throw new Error("Meta 발행에는 https로 시작하는 공개 URL이 필요합니다. 공개 URL을 https 주소로 설정하세요.");
  }

  status.textContent = `발행용 이미지 ${state.publishImageUrls.length}장을 준비했습니다.`;
  return state.publishImageUrls;
}

function summarizePublishResult(result) {
  if (result?.dryRun) return `설정 없음: ${result.reason}`;
  if (result?.skipped) return `건너뜀: ${result.reason}`;
  if (result?.published?.id) return `발행 완료 ID ${result.published.id}`;
  return "요청 완료";
}

async function publishToTargets(targets) {
  const status = $("#publishStatus");
  const buttons = [
    $("#uploadCardsBtn"),
    $("#publishInstagramBtn"),
    $("#publishThreadsBtn"),
    $("#publishFacebookBtn"),
    $("#publishBothBtn"),
    $("#publishMetaBtn")
  ];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const imageUrls = await uploadCardsForPublishing(false);
    status.textContent = `${targets.join(", ")} 발행 요청 중...`;
    const response = await fetch("/api/social/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targets,
        imageUrls,
        caption: $("#caption").value.trim()
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "발행 요청에 실패했습니다.");

    const resultText = [];
    if (data.instagram) resultText.push(`Instagram ${summarizePublishResult(data.instagram)}`);
    if (data.threads) resultText.push(`Threads ${summarizePublishResult(data.threads)}`);
    if (data.facebook) resultText.push(`Facebook ${summarizePublishResult(data.facebook)}`);
    status.textContent = resultText.join(" / ") || "발행 요청 완료";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

$("#generateBtn").addEventListener("click", makeDraft);
$("#prevBtn").addEventListener("click", () => {
  state.currentIndex = (state.currentIndex - 1 + state.cards.length) % state.cards.length;
  renderAll();
});
$("#nextBtn").addEventListener("click", () => {
  state.currentIndex = (state.currentIndex + 1) % state.cards.length;
  renderAll();
});
$("#brandName").addEventListener("input", renderPreview);
$("#brandName").addEventListener("input", () => {
  state.publishImageUrls = [];
});
$("#backgroundImage").addEventListener("change", handleBackgroundImage);
$("#saveApiBtn").addEventListener("click", saveApiSettings);
$("#clearApiBtn").addEventListener("click", clearApiSettings);
$("#saveSocialBtn").addEventListener("click", saveSocialSettings);
$("#clearSocialBtn").addEventListener("click", clearSocialSettings);
$("#connectFacebookPageBtn").addEventListener("click", () => {
  window.location.href = "/api/facebook/oauth/start";
});
$("#connectThreadsBtn").addEventListener("click", () => {
  window.location.href = "/api/threads/oauth/start";
});
$("#publicBaseUrl").addEventListener("input", () => {
  state.publishImageUrls = [];
});
$("#searchFestivalBtn").addEventListener("click", searchFestivals);
$("#topic").addEventListener("input", () => {
  $("#deckTitle").textContent = $("#topic").value;
});

$("#styleOptions").querySelectorAll(".style-chip").forEach((button) => {
  button.addEventListener("click", () => {
    state.style = button.dataset.style;
    state.publishImageUrls = [];
    $("#styleOptions").querySelectorAll(".style-chip").forEach((chip) => chip.classList.remove("is-active"));
    button.classList.add("is-active");
    renderPreview();
  });
});

$("#downloadBtn").addEventListener("click", async () => {
  const dataUrl = await cardToPng(state.currentIndex);
  downloadDataUrl(dataUrl, `card-news-${state.currentIndex + 1}.png`);
});

$("#downloadAllBtn").addEventListener("click", async () => {
  for (let index = 0; index < state.cards.length; index += 1) {
    const dataUrl = await cardToPng(index);
    downloadDataUrl(dataUrl, `card-news-${index + 1}.png`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

$("#uploadCardsBtn").addEventListener("click", async () => {
  const button = $("#uploadCardsBtn");
  button.disabled = true;
  try {
    await uploadCardsForPublishing(true);
  } catch (error) {
    $("#publishStatus").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("#publishInstagramBtn").addEventListener("click", () => publishToTargets(["instagram"]));
$("#publishThreadsBtn").addEventListener("click", () => publishToTargets(["threads"]));
$("#publishFacebookBtn").addEventListener("click", () => publishToTargets(["facebook"]));
$("#publishBothBtn").addEventListener("click", () => publishToTargets(["instagram", "threads"]));
$("#publishMetaBtn").addEventListener("click", () => publishToTargets(["instagram", "facebook"]));

setCards(defaultCards);
refreshApiStatus();
refreshSocialStatus();
