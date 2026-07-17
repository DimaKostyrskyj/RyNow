const cheerio = require("cheerio");

const SERVERS = {
  downtown: {
    id: "downtown",
    name: "Downtown",
    forumUrl: "https://forum.gta5rp.com/forums/server-no1-downtown.14/",
    sources: [
      {
        id: "criminal-code",
        title: "Уголовно-административный кодекс Штата Сан-Андреас",
        url: "https://forum.gta5rp.com/threads/ugolovno-administrativnyi-kodeks-shtata-san-andreas.1458592/"
      },
      {
        id: "procedural-code",
        title: "Процессуальный кодекс Штата Сан-Андреас",
        url: "https://forum.gta5rp.com/threads/processualnyi-kodeks-shtata-san-andreas.1458593/"
      }
    ]
  }
};

const CACHE_TTL = 15 * 60 * 1000;
const cache = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 100_000) reject(new Error("Request body is too large"));
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tokenize(value) {
  const stopWords = new Set([
    "что", "как", "или", "для", "при", "это", "такое", "можно", "ли",
    "когда", "где", "чем", "какой", "какая", "какие", "если", "его",
    "она", "они", "быть", "есть", "про", "надо", "нужно", "будет",
    "the", "and", "with"
  ]);

  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .match(/[a-zа-я0-9*]+/g)
    ?.filter(token => token.length > 2 && !stopWords.has(token)) || [];
}

function splitIntoSections(text, source) {
  const lines = normalizeText(text)
    .split("\n")
    .map(line => normalizeText(line))
    .filter(Boolean);

  const sections = [];
  let current = null;

  const headingPattern =
    /^(раздел|глава|статья|часть|примечание|пункт)\s+([0-9]+(?:\.[0-9]+)*(?:\.[0-9]+)?)[\s.:—-]*(.*)$/i;

  for (const line of lines) {
    const match = line.match(headingPattern);

    if (match) {
      if (current?.content) sections.push(current);

      current = {
        sourceId: source.id,
        sourceTitle: source.title,
        sourceUrl: source.url,
        heading: `${match[1]} ${match[2]}${match[3] ? `. ${match[3]}` : ""}`,
        article: match[2],
        content: line
      };
      continue;
    }

    if (!current) {
      current = {
        sourceId: source.id,
        sourceTitle: source.title,
        sourceUrl: source.url,
        heading: source.title,
        article: null,
        content: line
      };
    } else {
      current.content += `\n${line}`;
    }

    if (current.content.length > 3200) {
      sections.push(current);
      current = {
        ...current,
        heading: `${current.heading} — продолжение`,
        content: ""
      };
    }
  }

  if (current?.content) sections.push(current);

  return sections
    .map(section => ({
      ...section,
      content: normalizeText(section.content)
    }))
    .filter(section => section.content.length > 35);
}

async function fetchForumSource(source) {
  const cached = cache.get(source.url);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL) {
    return cached.sections;
  }

  const response = await fetch(source.url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; RYNOWRulesAssistant/1.0; +https://rynow.vercel.app)",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7"
    }
  });

  if (!response.ok) {
    throw new Error(`Форум вернул ошибку ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  $("script, style, noscript, iframe, form, nav, footer, header").remove();
  $(".bbCodeBlock, .message-signature, .message-attribution, .message-footer").remove();

  let articleText = "";

  const candidates = [
    "article.message--post .bbWrapper",
    ".message-body .bbWrapper",
    ".message-content .bbWrapper",
    ".bbWrapper"
  ];

  for (const selector of candidates) {
    const blocks = $(selector);

    if (blocks.length) {
      articleText = blocks
        .map((_, element) => $(element).text())
        .get()
        .join("\n");
      break;
    }
  }

  if (!articleText.trim()) {
    throw new Error("Не удалось найти текст документа на странице форума");
  }

  const sections = splitIntoSections(articleText, source);

  cache.set(source.url, {
    createdAt: Date.now(),
    sections
  });

  return sections;
}

function scoreSection(section, question) {
  const queryTokens = tokenize(question);
  const heading = section.heading.toLowerCase().replace(/ё/g, "е");
  const content = section.content.toLowerCase().replace(/ё/g, "е");
  let score = 0;

  for (const token of queryTokens) {
    if (heading.includes(token)) score += 8;
    if (content.includes(token)) score += 3;

    const occurrences = content.split(token).length - 1;
    score += Math.min(occurrences, 4);
  }

  const articleMatch = question.match(/(?:статья|ст\.?)\s*(\d+(?:\.\d+)*)/i);
  if (articleMatch && section.article === articleMatch[1]) score += 40;

  const phrases = [
    ["задерж", ["задержание", "задержан", "задержать"]],
    ["арест", ["арест", "заключение", "лишение свободы"]],
    ["обыск", ["обыск", "досмотр"]],
    ["адвокат", ["адвокат", "защитник"]],
    ["оруж", ["оружие", "вооруженный"]],
    ["штраф", ["штраф", "денежное взыскание"]],
    ["права", ["права", "обязанности"]],
    ["преступ", ["преступление", "правонарушение"]],
    ["покуш", ["покушение"]],
    ["соучаст", ["соучастие", "соучастник"]]
  ];

  const lowerQuestion = question.toLowerCase().replace(/ё/g, "е");

  for (const [trigger, synonyms] of phrases) {
    if (!lowerQuestion.includes(trigger)) continue;

    for (const synonym of synonyms) {
      if (heading.includes(synonym)) score += 6;
      if (content.includes(synonym)) score += 3;
    }
  }

  return score;
}

function excerpt(text, maxLength = 1100) {
  const clean = normalizeText(text);
  if (clean.length <= maxLength) return clean;

  const cut = clean.slice(0, maxLength);
  const lastSentence = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("; "),
    cut.lastIndexOf("\n")
  );

  return `${cut.slice(0, lastSentence > 450 ? lastSentence + 1 : maxLength)}…`;
}

function buildAnswer(server, question, matches) {
  if (!matches.length || matches[0].score < 3) {
    return {
      answer:
        `Я не нашёл достаточно точного ответа в подключённых документах сервера ${server.name}. ` +
        "Попробуйте указать действие, статью или ситуацию подробнее.",
      confidence: 0,
      sources: []
    };
  }

  const best = matches[0];
  const additional = matches.slice(1, 3).filter(item => item.score >= best.score * 0.55);

  let answer = `По документу «${best.section.sourceTitle}» наиболее подходящий пункт — ${best.section.heading}.\n\n`;
  answer += excerpt(best.section.content);

  if (additional.length) {
    answer += "\n\nТакже могут относиться:\n";
    answer += additional
      .map(item => `• ${item.section.heading} — ${excerpt(item.section.content, 300)}`)
      .join("\n");
  }

  return {
    answer,
    confidence: Math.min(98, 45 + best.score * 4),
    sources: [best, ...additional].map(item => ({
      title: item.section.sourceTitle,
      heading: item.section.heading,
      article: item.section.article,
      url: item.section.sourceUrl,
      excerpt: excerpt(item.section.content, 420)
    }))
  };
}

async function handleChat(req, res) {
  const body = await readBody(req);
  const serverId = String(body.serverId || "downtown");
  const question = normalizeText(body.question);

  if (!question || question.length < 3) {
    return json(res, 400, { error: "Введите вопрос по правилам." });
  }

  const server = SERVERS[serverId];

  if (!server) {
    return json(res, 400, { error: "Неизвестный сервер." });
  }

  const documents = await Promise.all(server.sources.map(fetchForumSource));
  const sections = documents.flat();

  const ranked = sections
    .map(section => ({
      section,
      score: scoreSection(section, question)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const result = buildAnswer(server, question, ranked);

  return json(res, 200, {
    server: {
      id: server.id,
      name: server.name,
      forumUrl: server.forumUrl
    },
    question,
    ...result,
    indexedSections: sections.length,
    mode: "forum-search"
  });
}

async function handleServers(req, res) {
  return json(res, 200, {
    servers: Object.values(SERVERS).map(server => ({
      id: server.id,
      name: server.name,
      forumUrl: server.forumUrl,
      sources: server.sources
    }))
  });
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "https://rynow.vercel.app");

    if (req.method === "GET" && url.pathname === "/api/ai/servers") {
      return handleServers(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/ai/chat") {
      return handleChat(req, res);
    }

    return json(res, 404, { error: "AI route not found" });
  } catch (error) {
    console.error("[FORUM AI]", error);
    return json(res, 500, {
      error: error.message || "Не удалось обработать запрос."
    });
  }
};
