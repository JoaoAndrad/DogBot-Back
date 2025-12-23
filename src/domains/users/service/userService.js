const userRepo = require("../repo/userRepo");

async function listUsers(params) {
  return userRepo.findUsers(params);
}

async function getUser(id) {
  return userRepo.findUserById(id);
}

async function upsertUserBySender(data) {
  return userRepo.upsertBySenderNumber(data);
}

module.exports = { listUsers, getUser, upsertUserBySender };
