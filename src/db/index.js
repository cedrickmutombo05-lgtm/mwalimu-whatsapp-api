
const { pool } = require("./pool");
const { initDB, ensureBibliothequeSearchInfra } = require("./init");
const { getUser, createUser, updateUserField } = require("./users");
const { appendHistorique } = require("./history");
const { consulterBibliotheque } = require("./library");
const {
  getStudentAttempt,
  saveStudentAttempt,
  resetStudentAttempt,
  resetAllStudentAttempts
} = require("./attempts");
const { logUnansweredQuestion } = require("./unanswered");

module.exports = {
  pool,
  initDB,
  ensureBibliothequeSearchInfra,
  getUser,
  createUser,
  updateUserField,
  appendHistorique,
  consulterBibliotheque,
  getStudentAttempt,
  saveStudentAttempt,
  resetStudentAttempt,
  resetAllStudentAttempts,
  logUnansweredQuestion
};
