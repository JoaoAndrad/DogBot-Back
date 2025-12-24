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
  // handle nested dogfort updates separately (upsert DogFortStats)
  if (!data) return null;
  const dogfort = data.dogfort;
  // remove dogfort from user payload before updating user record
  const userPayload = Object.assign({}, data);
  delete userPayload.dogfort;

  let updatedUser = null;
  if (Object.keys(userPayload).length) {
    updatedUser = await userRepo.updateUserById(id, userPayload);
  }

  if (dogfort) {
    // upsert dogfort stats for this user
    await userRepo.upsertDogfortForUser(id, dogfort);
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
