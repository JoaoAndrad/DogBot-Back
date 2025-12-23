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

async function updateUser(id, data) {
  return userRepo.updateUserById(id, data);
}

async function deleteUser(id) {
  return userRepo.deleteUserById(id);
}

async function bulkUsers(payload) {
  return userRepo.bulkAction(payload);
}

module.exports = {
  listUsers,
  getUser,
  upsertUserBySender,
  updateUser,
  deleteUser,
  bulkUsers,
};
