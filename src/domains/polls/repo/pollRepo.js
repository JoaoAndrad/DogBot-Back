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
  return prisma.poll.delete({ where: { id: String(id) } });
}

async function insertVote(pollId, vote) {
  const prisma = db.getPrisma();
  const data = {
    poll_id: String(pollId),
    voter_id: String(vote.voter_id || vote.voterId || "unknown"),
    selected_options: vote.selected_options || null,
    selected_indexes: vote.selected_indexes || vote.selected_indexes || null,
    selected_names: vote.selected_names || vote.selected_names || null,
  };
  return prisma.vote.create({ data });
}

module.exports = {
  insertPoll,
  findPollById,
  listPolls,
  deletePoll,
  insertVote,
};
