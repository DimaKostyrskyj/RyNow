const path = require("path");

const SERVERS = {
  downtown: {
    id: "downtown",
    name: "Downtown",
    forumUrl: "https://forum.gta5rp.com/forums/server-no1-downtown.14/",
    sourceFile: path.join(process.cwd(), "data", "downtown-rules.json")
  }
};

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
      if (raw.length > 150000) reject(new Error("Request body is too large"));
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Некорректный JSON запроса"));
      }
    });

    req.on("error", reject);
  });
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\u00a0/g, " ")
    .replace(/[^\p{L}\p{N}.*\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const stopWords = new Set([
    "что","как","или","для","при","это","такое","можно","ли","когда","где",
    "чем","какой","какая","какие","если","его","она","они","быть","есть",
    "про","надо","нужно","будет","мне","меня","кто","чего","каков","какова"
  ]);

  return normalize(value)
    .split(" ")
    .filter(token => token.length > 2 && !stopWords.has(token));
}

function expandTokens(tokens) {
  const groups = [
    ["задерж", "задержание", "задержанный", "задержать", "задержан"],
    ["арест", "арестованный", "лишение свободы", "заключение"],
    ["обыск", "досмотр", "осмотр"],
    ["адвокат", "защитник", "юрист"],
    ["соучаст", "соучастник", "пособник", "подстрекатель", "организатор"],
    ["покуш", "покушение"],
    ["оборона", "необходимая оборона", "самооборона"],
    ["штраф", "денежное взыскание"],
    ["оруж", "оружие", "вооруженный"],
    ["расслед", "расследование", "следствие", "уголовное дело"],
    ["правонаруш", "преступление", "проступок"],
    ["смягч", "смягчающие обстоятельства"],
    ["отягч", "отягчающие обстоятельства"]
  ];

  const expanded = new Set(tokens);

  for (const token of tokens) {
    for (const group of groups) {
      if (group.some(item => item.includes(token) || token.includes(item.slice(0, 5)))) {
        group.forEach(item => expanded.add(normalize(item)));
      }
    }
  }

  return [...expanded];
}

function loadRules(serverId) {
  const server = SERVERS[serverId];
  if (!server) throw new Error("Неизвестный сервер.");

  delete require.cache[require.resolve(server.sourceFile)];
  const rules = require(server.sourceFile);

  return {
    server,
    rules: Array.isArray(rules)
      ? rules.filter(item => item.serverId === serverId)
      : []
  };
}

function scoreRule(rule, question) {
  const query = normalize(question);
  const tokens = expandTokens(tokenize(question));
  const heading = normalize(rule.heading);
  const content = normalize(rule.content);
  let score = 0;

  const articleMatch = query.match(/(?:статья|ст)\s*([a-zа-я]*\.?\s*)?([0-9]+(?:\.[0-9]+)*)/i);
  if (articleMatch && String(rule.article || "").includes(articleMatch[2])) {
    score += 100;
  }

  for (const token of tokens) {
    if (!token) continue;

    if (heading.includes(token)) score += 15;
    if (content.includes(token)) score += 6;

    const headingWords = heading.split(" ");
    if (headingWords.some(word => word.startsWith(token.slice(0, 5)))) score += 5;

    const occurrences = content.split(token).length - 1;
    score += Math.min(Math.max(occurrences, 0), 5);
  }

  if (query.includes(normalize(rule.heading))) score += 40;

  return score;
}

function retrieveContext(serverId, question, limit = 8) {
  const { server, rules } = loadRules(serverId);

  const ranked = rules
    .map(rule => ({ rule, score: scoreRule(rule, question) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = ranked.slice(0, limit);

  return {
    server,
    totalRules: rules.length,
    matches: selected,
    confidence: selected.length
      ? Math.min(98, 35 + selected[0].score * 2)
      : 0
  };
}

function formatContext(matches) {
  return matches.map((item, index) => {
    const rule = item.rule;

    return [
      `SOURCE_${index + 1}`,
      `Документ: ${rule.sourceTitle}`,
      `Пункт: ${rule.heading}`,
      `URL: ${rule.sourceUrl}`,
      `Текст: ${rule.content}`
    ].join("\n");
  }).join("\n\n---\n\n");
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();

  const output = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of output) {
    if (item?.type !== "message") continue;

    const content = Array.isArray(item.content) ? item.content : [];

    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        return part.text.trim();
      }
    }
  }

  return "";
}

module.exports = {
  SERVERS,
  json,
  readBody,
  retrieveContext,
  formatContext,
  extractResponseText
};
