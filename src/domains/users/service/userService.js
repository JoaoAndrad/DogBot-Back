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

async function createUser(data) {
  return userRepo.createUser(data);
}

async function updateUser(id, data) {
  // handle nested dogfort/fitness/confessions updates separately
  if (!data) return null;
  const dogfort = data.dogfort;
  const confessions = data.confessions;
  const fitness = data.fitness;
  // remove nested objects from user payload before updating user record
  const userPayload = Object.assign({}, data);
  delete userPayload.dogfort;
  delete userPayload.confessions;
  delete userPayload.fitness;

  let updatedUser = null;
  if (Object.keys(userPayload).length) {
    updatedUser = await userRepo.updateUserById(id, userPayload);
  }

  if (dogfort) {
    // upsert dogfort stats for this user
    await userRepo.upsertDogfortForUser(id, dogfort);
  }

  if (fitness) {
    // upsert fitness stats for this user
    await userRepo.upsertFitnessForUser(id, fitness);
  }

  if (confessions) {
    // Normalize confessions fields and persist into user table fields
    const normalized = {};
    // accept either 'balance' or 'saldo'
    if (typeof confessions.balance !== "undefined")
      normalized.confessions_balance = Number(confessions.balance);
    if (typeof confessions.saldo !== "undefined")
      normalized.confessions_balance = Number(confessions.saldo);
    if (typeof confessions.vip !== "undefined")
      normalized.confessions_vip = !!confessions.vip;
    if (typeof confessions.is_vip !== "undefined")
      normalized.confessions_vip = !!confessions.is_vip;
    if (typeof confessions.last_update !== "undefined")
      normalized.confessions_last_update = new Date(confessions.last_update);
    if (typeof confessions.lastUpdate !== "undefined")
      normalized.confessions_last_update = new Date(confessions.lastUpdate);

    // merge into userPayload update
    if (Object.keys(normalized).length) {
      await userRepo.updateUserById(id, normalized);
    }
  }

  // return latest user object
  return userRepo.findUserById(id);
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
  createUser,
  updateUser,
  deleteUser,
  bulkUsers,
};
