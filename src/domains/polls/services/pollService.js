const repo = require("../repo/pollRepo");

async function createPoll(payload) {
  if (!payload || !payload.id) throw new Error("payload.id is required");
  console.info("[pollService] createPoll", payload && payload.id);
  const r = await repo.insertPoll(payload);
  console.info("[pollService] created", r && r.id);
  return r;
}

async function getPoll(id) {
  if (!id) return null;
  console.info("[pollService] getPoll", id);
  const r = await repo.findPollById(id);
  console.info("[pollService] getPoll result", r ? "found" : "missing");
  return r;
}

async function listPolls(opts) {
  //console.info("[pollService] listPolls", opts || {});
  const r = await repo.listPolls(opts || {});
  console.info(
    "[pollService] listPolls count",
    Array.isArray(r) ? r.length : 0,
  );
  return r;
}

async function removePoll(id) {
  console.info("[pollService] removePoll", id);
  const r = await repo.deletePoll(id);
  console.info("[pollService] removePoll done", id);
  return r;
}

async function recordVote(pollId, votePayload) {
  if (!pollId) throw new Error("pollId is required");
  console.info(
    "[pollService] recordVote",
    pollId,
    votePayload && votePayload.voter_id,
  );
  const r = await repo.insertVote(pollId, votePayload || {});
  console.info("[pollService] recordVote created", r && r.id);
  return r;
}

async function getPollState(pollId) {
  if (!pollId) throw new Error("pollId is required");
  console.info("[pollService] getPollState", pollId);

  const poll = await repo.findPollById(pollId);
  if (!poll) {
    console.info("[pollService] poll not found", pollId);
    return null;
  }

  const votes = await repo.findVotesByPollId(pollId);
  console.info("[pollService] found", votes.length, "votes for poll", pollId);

  // Calculate statistics
  const stats = {
    total: votes.length,
    byOption: {},
  };

  // Count votes per option
  votes.forEach((vote) => {
    const indexes = vote.selected_indexes || [];
    indexes.forEach((idx) => {
      stats.byOption[idx] = (stats.byOption[idx] || 0) + 1;
    });
  });

  return {
    poll,
    votes,
    stats,
  };
}

module.exports = {
  createPoll,
  getPoll,
  listPolls,
  removePoll,
  recordVote,
  getPollState,
};
