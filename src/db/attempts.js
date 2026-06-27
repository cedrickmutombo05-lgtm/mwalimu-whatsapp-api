
const { pool } = require("./pool");

async function getStudentAttempt(phone, sujet = "") {
  const { rows } = await pool.query(
    `SELECT * FROM student_attempts 
     WHERE phone = $1 AND sujet = $2 
     ORDER BY updated_at DESC 
     LIMIT 1`,
    [phone, sujet]
  );

  return rows[0] || null;
}

async function saveStudentAttempt(phone, sujet = "", question = "", lastUserAnswer = "") {
  const existing = await getStudentAttempt(phone, sujet);

  if (!existing) {
    await pool.query(
      `INSERT INTO student_attempts 
       (phone, sujet, question, attempts_count, last_user_answer, updated_at) 
       VALUES ($1, $2, $3, 1, $4, NOW())`,
      [phone, sujet, question, lastUserAnswer]
    );

    return 1;
  }

  const nextCount = Number(existing.attempts_count || 0) + 1;

  await pool.query(
    `UPDATE student_attempts 
     SET attempts_count = $1, question = $2, last_user_answer = $3, updated_at = NOW() 
     WHERE id = $4`,
    [nextCount, question, lastUserAnswer, existing.id]
  );

  return nextCount;
}

async function resetStudentAttempt(phone, sujet = "") {
  await pool.query(
    `DELETE FROM student_attempts WHERE phone = $1 AND sujet = $2`,
    [phone, sujet]
  );
}

async function resetAllStudentAttempts(phone) {
  await pool.query(
    `DELETE FROM student_attempts WHERE phone = $1`,
    [phone]
  );
}

module.exports = {
  getStudentAttempt,
  saveStudentAttempt,
  resetStudentAttempt,
  resetAllStudentAttempts
};
