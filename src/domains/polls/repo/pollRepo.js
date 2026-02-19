// Repo: encapsulate Prisma calls for Poll and Vote
const db = require("../../../db");

async function insertPoll(p) {
  const prisma = db.getPrisma();
  const data = {
    id: String(p.id),
    chat_id: String(p.chat_id || p.chatId || ""),
    title: p.title || null,
    options: p.options || null,
    poll_options: p.poll_options || p.pollOptions || null,
    options_obj: p.options_obj || p.optionsObj || null,
    type: p.type || "native",
    metadata: p.metadata || null,
    vote_type: p.vote_type || p.voteType || null,
    vote_id: p.vote_id || p.voteId || null,
    group_id: p.group_id || p.groupId || null,
  };
  return prisma.poll.create({ data });
}

async function findPollById(id) {
  const prisma = db.getPrisma();
  return prisma.poll.findUnique({ where: { id: String(id) } });
}

async function listPolls({ chat_id, limit = 50 } = {}) {
  const prisma = db.getPrisma();
  const where = chat_id ? { chat_id: String(chat_id) } : {};
  return prisma.poll.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: limit,
  });
}

async function deletePoll(id) {
  const prisma = db.getPrisma();
  // Delete child votes first to avoid FK constraint violation
  await prisma.vote.deleteMany({ where: { poll_id: String(id) } });
  return prisma.poll.delete({ where: { id: String(id) } });
}

async function insertVote(pollId, vote) {
  const prisma = db.getPrisma();
  const data = {
    poll_id: String(pollId),
    voter_id: String(vote.voter_id || vote.voterId || "unknown"),
    selected_options: vote.selected_options || vote.selectedOptions || null,
    selected_indexes: vote.selected_indexes || vote.selectedIndexes || null,
    selected_names: vote.selected_names || vote.selectedNames || null,
  };
  return prisma.vote.create({ data });
}

async function findVotesByPollId(pollId) {
  const prisma = db.getPrisma();
  return prisma.vote.findMany({
    where: { poll_id: String(pollId) },
    orderBy: { created_at: "asc" },
  });
}

module.exports = {
  insertPoll,
  findPollById,
  listPolls,
  deletePoll,
  insertVote,
  findVotesByPollId,
};
