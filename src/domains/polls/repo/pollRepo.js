// Repo: encapsulate Prisma calls for Poll and Vote
const db = require("../../../db");

async function insertPoll(p) {
  const prisma = db.getPrisma();
  const data = {
    id: String(p.id),
    chatId: String(p.chat_id || p.chatId || ""),
    title: p.title || null,
    options: p.options || null,
    pollOptions: p.poll_options || p.pollOptions || null,
    optionsObj: p.options_obj || p.optionsObj || null,
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
  const where = chat_id ? { chatId: String(chat_id) } : {};
  return prisma.poll.findMany({
    where,
    orderBy: { createdAt: "desc" },
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
    pollId: String(pollId),
    voterId: String(vote.voter_id || vote.voterId || "unknown"),
    selectedOptions: vote.selected_options || vote.selectedOptions || null,
    selectedIndexes: vote.selected_indexes || vote.selectedIndexes || null,
    selectedNames: vote.selected_names || vote.selectedNames || null,
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
