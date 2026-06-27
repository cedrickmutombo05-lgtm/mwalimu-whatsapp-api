
const { pool } = require("./pool");
const { logError } = require("../core/logger");

async function consulterBibliotheque(question = "", classe = "") {
  try {
    const termes = String(question || "").trim();
    if (!termes) return null;

    const motifClasse = `%${classe}%`;

    const { rows } = await pool.query(
      `SELECT id, titre, matiere, classe, mots_cles, contenu, commentaire_ai,
              source_type, source_url, provenance, created_at, updated_at,
              ts_rank(search_vector, plainto_tsquery('simple', unaccent($1))) AS score
       FROM bibliotheque
       WHERE search_vector @@ plainto_tsquery('simple', unaccent($1))
       AND ($2 = '' OR unaccent(lower(coalesce(classe, ''))) LIKE unaccent(lower($3)))
       ORDER BY score DESC, updated_at DESC, id DESC
       LIMIT 1`,
      [termes, classe || "", motifClasse]
    );

    return rows[0] || null;
  } catch (e) {
    logError("consulter_bibliotheque", e);
    return null;
  }
}

module.exports = {
  consulterBibliotheque
};
