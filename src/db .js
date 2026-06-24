
const { Pool } = require("pg");
const { DATABASE_URL } = require("./config");
const { logInfo, logError, tronquerTexte, safeJsonParse } = require("./utils");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20
});

pool.on("error", (err) => {
  logError("postgres_idle", err);
});

async function ensureBibliothequeSearchInfra() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");
  await pool.query("ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS search_vector tsvector;");

  await pool.query(`
    CREATE OR REPLACE FUNCTION bibliotheque_search_vector_update()
    RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.titre, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.matiere, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.classe, ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.mots_cles, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.contenu, ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.commentaire_ai, ''))), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  await pool.query("DROP TRIGGER IF EXISTS trg_bibliotheque_search_vector_update ON bibliotheque;");

  await pool.query(`
    CREATE TRIGGER trg_bibliotheque_search_vector_update
    BEFORE INSERT OR UPDATE OF titre, matiere, classe, mots_cles, contenu, commentaire_ai
    ON bibliotheque
    FOR EACH ROW
    EXECUTE FUNCTION bibliotheque_search_vector_update();
  `);

  await pool.query(`
    UPDATE bibliotheque
    SET search_vector =
      setweight(to_tsvector('simple', unaccent(coalesce(titre, ''))), 'A') ||
      setweight(to_tsvector('simple', unaccent(coalesce(matiere, ''))), 'A') ||
      setweight(to_tsvector('simple', unaccent(coalesce(classe, ''))), 'B') ||
      setweight(to_tsvector('simple', unaccent(coalesce(mots_cles, ''))), 'A') ||
      setweight(to_tsvector('simple', unaccent(coalesce(contenu, ''))), 'B') ||
      setweight(to_tsvector('simple', unaccent(coalesce(commentaire_ai, ''))), 'C')
    WHERE search_vector IS NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bibliotheque_search_vector
    ON bibliotheque USING GIN (search_vector);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bibliotheque_updated_at
    ON bibliotheque (updated_at DESC);
  `);
}

async function initDB() {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        msg_id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        phone TEXT PRIMARY KEY,
        nom TEXT DEFAULT '',
        classe TEXT DEFAULT '',
        reve TEXT DEFAULT '',
        historique JSONB DEFAULT '[]'::jsonb,
        reminders_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bibliotheque (
        id SERIAL PRIMARY KEY,
        titre TEXT,
        matiere TEXT,
        classe TEXT,
        mots_cles TEXT,
        contenu TEXT,
        commentaire_ai TEXT DEFAULT '',
        source_type TEXT DEFAULT 'db',
        source_url TEXT DEFAULT '',
        provenance TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS unanswered_questions (
        id SERIAL PRIMARY KEY,
        phone TEXT DEFAULT '',
        question TEXT NOT NULL,
        msg_type TEXT DEFAULT 'text',
        classe TEXT DEFAULT '',
        nom TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_attempts (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        sujet TEXT DEFAULT '',
        question TEXT DEFAULT '',
        attempts_count INT DEFAULT 0,
        last_user_answer TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query("CREATE INDEX IF NOT EXISTS idx_processed_messages_created_at ON processed_messages (created_at DESC);");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_unanswered_questions_created_at ON unanswered_questions (created_at DESC);");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_student_attempts_phone_sujet_updated ON student_attempts (phone, sujet, updated_at DESC);");

    await ensureBibliothequeSearchInfra();

    logInfo("db_ready");
  } catch (e) {
    logError("init_db", e);
    process.exit(1);
  }
}

async function getUser(phone) {
  const { rows } = await pool.query("SELECT * FROM conversations WHERE phone = $1", [phone]);
  return rows[0] || null;
}

async function createUser(phone) {
  await pool.query(`
    INSERT INTO conversations (phone, nom, classe, reve, historique, reminders_enabled)
    VALUES ($1, '', '', '', '[]'::jsonb, TRUE)
    ON CONFLICT (phone) DO NOTHING
  `, [phone]);

  return getUser(phone);
}

async function updateUserField(phone, field, value) {
  const allowed = ["nom", "classe", "reve", "historique", "reminders_enabled"];
  if (!allowed.includes(field)) throw new Error("Champ non autorisé");

  await pool.query(
    `UPDATE conversations SET ${field} = $1, updated_at = NOW() WHERE phone = $2`,
    [value, phone]
  );
}

async function appendHistorique(phone, role, content) {
  const cleanContent = tronquerTexte(String(content || ""), 2500);

  const element = {
    role,
    content: cleanContent,
    ts: new Date().toISOString()
  };

  await pool.query(`
    UPDATE conversations
    SET historique = (
      SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT value, ord
        FROM jsonb_array_elements(COALESCE(historique, '[]'::jsonb) || $1::jsonb)
        WITH ORDINALITY AS arr(value, ord)
        ORDER BY ord DESC
        LIMIT 12
      ) t
    ),
    updated_at = NOW()
    WHERE phone = $2
  `, [JSON.stringify([element]), phone]);

  const user = await getUser(phone);
  return Array.isArray(user?.historique)
    ? user.historique
    : safeJsonParse(user?.historique, []);
}

async function isDuplicate(msgId) {
  const { rowCount } = await pool.query(
    "INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [msgId]
  );

  return rowCount === 0;
}

async function cleanOldProcessed() {
  await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'");
}

async function logUnansweredQuestion(user = {}, question = "", msgType = "text", reason = "") {
  try {
    if (!String(question || "").trim()) return;

    await pool.query(`
      INSERT INTO unanswered_questions (phone, question, msg_type, classe, nom, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      user?.phone || "",
      tronquerTexte(question, 2000),
      msgType,
      user?.classe || "",
      user?.nom || "",
      reason || ""
    ]);
  } catch (e) {
    logError("log_unanswered_question", e);
  }
}

async function getStudentAttempt(phone, sujet = "") {
  const { rows } = await pool.query(`
    SELECT * FROM student_attempts
    WHERE phone = $1 AND sujet = $2
    ORDER BY updated_at DESC
    LIMIT 1
  `, [phone, sujet]);

  return rows[0] || null;
}

async function saveStudentAttempt(phone, sujet = "", question = "", lastUserAnswer = "") {
  const existing = await getStudentAttempt(phone, sujet);

  if (!existing) {
    await pool.query(`
      INSERT INTO student_attempts (phone, sujet, question, attempts_count, last_user_answer, updated_at)
      VALUES ($1, $2, $3, 1, $4, NOW())
    `, [phone, sujet, question, lastUserAnswer]);

    return 1;
  }

  const nextCount = Number(existing.attempts_count || 0) + 1;

  await pool.query(`
    UPDATE student_attempts
    SET attempts_count = $1,
        question = $2,
        last_user_answer = $3,
        updated_at = NOW()
    WHERE id = $4
  `, [nextCount, question, lastUserAnswer, existing.id]);

  return nextCount;
}

async function resetStudentAttempt(phone, sujet = "") {
  await pool.query("DELETE FROM student_attempts WHERE phone = $1 AND sujet = $2", [phone, sujet]);
}

async function resetAllStudentAttempts(phone) {
  await pool.query("DELETE FROM student_attempts WHERE phone = $1", [phone]);
}

async function consulterBibliotheque(question = "", classe = "") {
  try {
    const termes = String(question || "").trim();
    if (!termes) return null;

    const { rows } = await pool.query(`
      SELECT id, titre, matiere, classe, mots_cles, contenu, commentaire_ai,
             source_type, source_url, provenance, created_at, updated_at,
             ts_rank(search_vector, plainto_tsquery('simple', unaccent($1))) AS score
      FROM bibliotheque
      WHERE search_vector @@ plainto_tsquery('simple', unaccent($1))
        AND ($2 = '' OR unaccent(lower(coalesce(classe, ''))) LIKE unaccent(lower($3)))
      ORDER BY score DESC, updated_at DESC, id DESC
      LIMIT 1
    `, [termes, classe || "", `%${classe}%`]);

    return rows[0] || null;
  } catch (e) {
    logError("consulter_bibliotheque", e);
    return null;
  }
}

module.exports = {
  pool,
  initDB,
  getUser,
  createUser,
  updateUserField,
  appendHistorique,
  isDuplicate,
  cleanOldProcessed,
  logUnansweredQuestion,
  getStudentAttempt,
  saveStudentAttempt,
  resetStudentAttempt,
  resetAllStudentAttempts,
  consulterBibliotheque
};
