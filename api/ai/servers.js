const { SERVERS, json } = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  return json(res, 200, {
    servers: Object.values(SERVERS).map(server => ({
      id: server.id,
      name: server.name,
      forumUrl: server.forumUrl
    }))
  });
};
