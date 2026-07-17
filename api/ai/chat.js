const {
  json,
  readBody,
  retrieveContext,
  formatContext,
  extractResponseText
} = require("./_shared");

const XAI_API_URL = "https://api.x.ai/v1/responses";
const XAI_MODEL = process.env.XAI_MODEL || "grok-4.3";

function buildSystemPrompt(serverName) {
  return `
Ты — RYNOW AI, справочный помощник по правилам GTA 5 RP сервера ${serverName}.

КРИТИЧЕСКИЕ ПРАВИЛА:
1. Отвечай ТОЛЬКО на основании блоков CONTEXT, переданных ниже.
2. Не используй знания из интернета, память модели или общие знания GTA RP.
3. Не придумывай статьи, наказания, сроки, исключения и формулировки.
4. Если в CONTEXT нет точного ответа, прямо скажи:
   "В подключённой базе правил нет достаточных данных для точного ответа."
5. Если вопрос не относится к подключённым правилам, откажись отвечать по существу.
6. Указывай названия подходящих статей или пунктов.
7. Объясняй простыми словами, но не меняй юридический смысл.
8. В конце добавляй короткий блок:
   "Источники:" и перечисляй использованные пункты.
9. Никогда не говори, что искал в интернете. Ты работаешь только с закрытой базой RYNOW.
10. Отвечай на русском языке.

ФОРМАТ:
- Краткий прямой ответ.
- Объяснение.
- Подходящие пункты.
- Источники.
`.trim();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { error: "Method not allowed" });
    }

    if (!process.env.XAI_API_KEY) {
      return json(res, 503, {
        error: "Не настроен XAI_API_KEY в Vercel."
      });
    }

    const body = await readBody(req);
    const serverId = String(body.serverId || "downtown");
    const question = String(body.question || "").trim();

    if (question.length < 3) {
      return json(res, 400, { error: "Введите вопрос." });
    }

    const retrieval = retrieveContext(serverId, question, 8);

    if (!retrieval.matches.length) {
      return json(res, 200, {
        server: {
          id: retrieval.server.id,
          name: retrieval.server.name,
          forumUrl: retrieval.server.forumUrl
        },
        answer:
          "В подключённой базе правил нет достаточных данных для точного ответа.",
        confidence: 0,
        sources: [],
        mode: "grok-rag",
        model: XAI_MODEL,
        totalRules: retrieval.totalRules
      });
    }

    const context = formatContext(retrieval.matches);

    const prompt = [
      `ВОПРОС ПОЛЬЗОВАТЕЛЯ:\n${question}`,
      `\nCONTEXT — ЕДИНСТВЕННЫЙ РАЗРЕШЁННЫЙ ИСТОЧНИК:\n${context}`
    ].join("\n");

    const xaiResponse = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        store: false,
        input: [
          {
            role: "system",
            content: buildSystemPrompt(retrieval.server.name)
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_output_tokens: 900,
        temperature: 0.1
      })
    });

    const raw = await xaiResponse.text();
    let payload = null;

    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 502, {
        error: `xAI вернул не JSON: ${raw.slice(0, 180)}`
      });
    }

    if (!xaiResponse.ok) {
      console.error("[xAI]", payload);

      return json(res, xaiResponse.status, {
        error:
          payload?.error?.message ||
          payload?.message ||
          `Ошибка xAI API: ${xaiResponse.status}`
      });
    }

    const answer = extractResponseText(payload);

    if (!answer) {
      return json(res, 502, {
        error: "Grok не вернул текст ответа."
      });
    }

    const sources = retrieval.matches.slice(0, 5).map(item => ({
      title: item.rule.sourceTitle,
      heading: item.rule.heading,
      article: item.rule.article,
      url: item.rule.sourceUrl,
      excerpt: item.rule.content.slice(0, 450),
      score: item.score
    }));

    return json(res, 200, {
      server: {
        id: retrieval.server.id,
        name: retrieval.server.name,
        forumUrl: retrieval.server.forumUrl
      },
      question,
      answer,
      confidence: retrieval.confidence,
      sources,
      mode: "grok-rag",
      model: XAI_MODEL,
      totalRules: retrieval.totalRules,
      responseId: payload.id || null
    });
  } catch (error) {
    console.error("[GROK RAG]", error);

    return json(res, 500, {
      error: error?.message || "Ошибка AI."
    });
  }
};
