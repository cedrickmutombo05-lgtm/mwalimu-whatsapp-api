
const { pool } = require("./pool");
const { logError } = require("../core/logger");
const { tronquerTexte } = require("../core");

async function logUnansweredQuestion(user = {}, question = "", msgType = "text", reason = "") {
  try {
    if (!String(question || "").trim()) return;

    await pool.query(
      `INSERT INTO unanswered_questions 
       (phone, question, msg_type, classe, nom, reason) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user?.phone || "",
        tronquerTexte(question, 2000),
        msgType,
        user?.classe || "",
        user?.nom || "",
        reason || ""
      ]
    );
  } catch (e) {
    logError("log_unanswered_question", e);
  }
}

module.exports = {
  logUnansweredQuestion
};
