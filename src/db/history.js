
const { pool } = require("./pool");
const { getUser } = require("./users");
const { tronquerTexte, safeJsonParse } = require("../core");

async function appendHistorique(phone, role, content) {
  const nouvelElement = {
    role,
    content: tronquerTexte(content, 2500),
    ts: new Date().toISOString()
  };

  await pool.query(
    `UPDATE conversations 
     SET historique = (
       SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
       FROM (
         SELECT value, ord 
         FROM jsonb_array_elements(COALESCE(historique, '[]'::jsonb) || $1::jsonb) 
         WITH ORDINALITY AS arr(value, ord)
         ORDER BY ord DESC 
         LIMIT 12
       ) t
     ), updated_at = NOW()
     WHERE phone = $2`,
    [JSON.stringify([nouvelElement]), phone]
  );

  const user = await getUser(phone);

  return Array.isArray(user?.historique)
    ? user.historique
    : safeJsonParse(user?.historique, []);
}

module.exports = {
  appendHistorique
};
