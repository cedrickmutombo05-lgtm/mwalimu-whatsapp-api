
const { pool } = require("./pool");

async function getUser(phone) {
  const { rows } = await pool.query(
    "SELECT * FROM conversations WHERE phone = $1",
    [phone]
  );

  return rows[0] || null;
}

async function createUser(phone) {
  await pool.query(
    `INSERT INTO conversations 
    (phone, nom, classe, reve, historique, reminders_enabled) 
    VALUES ($1, '', '', '', '[]'::jsonb, TRUE) 
    ON CONFLICT (phone) DO NOTHING`,
    [phone]
  );

  return getUser(phone);
}

async function updateUserField(phone, field, value) {
  const fieldMap = {
    nom: "nom",
    classe: "classe",
    reve: "reve",
    historique: "historique",
    reminders_enabled: "reminders_enabled"
  };

  const safeField = fieldMap[field];

  if (!safeField) {
    throw new Error("Champ non autorisé");
  }

  const query = `
    UPDATE conversations 
    SET ${safeField} = $1, updated_at = NOW() 
    WHERE phone = $2
  `;

  await pool.query(query, [value, phone]);
}

module.exports = {
  getUser,
  createUser,
  updateUserField
};
