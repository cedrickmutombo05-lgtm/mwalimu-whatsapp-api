
const { pool } = require("./pool");
const { logInfo, logError } = require("../core/logger");

async function ensureBibliothequeSearchInfra() {
  await pool.query(`ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS search_vector tsvector;`);

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

  await pool.query(`DROP TRIGGER IF EXISTS trg_bibliotheque_search_vector_update ON bibliotheque;`);

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

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bibliotheque_search_vector ON bibliotheque USING GIN (search_vector);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bibliotheque_updated_at ON bibliotheque (updated_at DESC);`);
}

async function initDB() {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

    await pool.query(`CREATE TABLE IF NOT EXISTS processed_messages (msg_id TEXT PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS conversations (phone TEXT PRIMARY KEY, nom TEXT DEFAULT '', classe TEXT DEFAULT '', reve TEXT DEFAULT '', historique JSONB DEFAULT '[]'::jsonb, reminders_enabled BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS bibliotheque (id SERIAL PRIMARY KEY, titre TEXT, matiere TEXT, classe TEXT, mots_cles TEXT, contenu TEXT, commentaire_ai TEXT DEFAULT '', source_type TEXT DEFAULT 'db', source_url TEXT DEFAULT '', provenance TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS unanswered_questions (id SERIAL PRIMARY KEY, phone TEXT DEFAULT '', question TEXT NOT NULL, msg_type TEXT DEFAULT 'text', classe TEXT DEFAULT '', nom TEXT DEFAULT '', reason TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS student_attempts (id SERIAL PRIMARY KEY, phone TEXT NOT NULL, sujet TEXT DEFAULT '', question TEXT DEFAULT '', attempts_count INT DEFAULT 0, last_user_answer TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_processed_messages_created_at ON processed_messages (created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_unanswered_questions_created_at ON unanswered_questions (created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_student_attempts_phone_sujet_updated ON student_attempts (phone, sujet, updated_at DESC);`);

    await ensureBibliothequeSearchInfra();

    logInfo("db_ready");
  } catch (e) {
    logError("init_db", e);
    process.exit(1);
  }
}

module.exports = {
  initDB,
  ensureBibliothequeSearchInfra
};
