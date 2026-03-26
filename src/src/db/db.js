/* =========================================================
   4) DB
========================================================= */

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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS nom TEXT DEFAULT '';
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS classe TEXT DEFAULT '';
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS reve TEXT DEFAULT '';
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS historique JSONB DEFAULT '[]'::jsonb;
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);

        await pool.query(`
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE updated_at IS NULL;
        `);

        await pool.query(`
            UPDATE conversations
            SET historique = '[]'::jsonb
            WHERE historique IS NULL;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS processed_topics (
                id SERIAL PRIMARY KEY,
                phone TEXT NOT NULL,
                sujet TEXT NOT NULL,
                question_originale TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ DB prête.");
    } catch (e) {
        console.error("Init DB Error:", e.message);
        process.exit(1);
    }
}

async function getUser(phone) {
    const { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [phone]);
    return rows[0] || null;
}

async function createUser(phone) {
    await pool.query(
        "INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]'::jsonb) ON CONFLICT (phone) DO NOTHING",
        [phone]
    );
    return getUser(phone);
}

async function updateUserField(phone, field, value) {
    const allowed = ["nom", "classe", "reve", "historique"];
    if (!allowed.includes(field)) throw new Error("Champ non autorisé");
    const query = `UPDATE conversations SET ${field}=$1, updated_at=NOW() WHERE phone=$2`;
    await pool.query(query, [value, phone]);
}

async function appendHistorique(phone, role, content) {
    const user = await getUser(phone);
    const hist = Array.isArray(user?.historique) ? user.historique : safeJsonParse(user?.historique, []);
    hist.push({
        role,
        content: tronquerTexte(content, 2500),
        ts: new Date().toISOString()
    });
    const histCompact = hist.slice(-12);
    await updateUserField(phone, "historique", JSON.stringify(histCompact));
    return histCompact;
}
