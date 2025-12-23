const repo = require("../repo/pollRepo");

async function createPoll(payload) {
  if (!payload || !payload.id) throw new Error("payload.id is required");
  return repo.insertPoll(payload);
}

async function getPoll(id) {
  if (!id) return null;
  return repo.findPollById(id);
}

async function listPolls(opts) {
  return repo.listPolls(opts || {});
}

async function removePoll(id) {
  return repo.deletePoll(id);
}

async function recordVote(pollId, votePayload) {
  if (!pollId) throw new Error("pollId is required");
  return repo.insertVote(pollId, votePayload || {});
}

module.exports = { createPoll, getPoll, listPolls, removePoll, recordVote };
