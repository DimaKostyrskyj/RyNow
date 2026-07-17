const { getSupabase, json } = require("./_shared");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    return json(response, 405, { error: "Method not allowed" });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return json(response, 503, { error: "Supabase не настроен." });
  }

  const url = new URL(request.url, "https://rynow.vercel.app");
  const type = url.searchParams.get("type") || "rules";

  const tables = {
    news: "news",
    rules: "rules",
    knowledge: "knowledge_base"
  };

  const table = tables[type];
  if (!table) {
    return json(response, 400, { error: "Неизвестный тип данных." });
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) {
    return json(response, 500, { error: error.message });
  }

  return json(response, 200, { items: data || [] });
};
