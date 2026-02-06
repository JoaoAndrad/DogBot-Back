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

async function processVote(pollId, voterId, selectedIndex) {
  if (!pollId) throw new Error("pollId is required");
  if (!voterId) throw new Error("voterId is required");
  if (selectedIndex === undefined || selectedIndex === null) {
    throw new Error("selectedIndex is required");
  }

  console.info(
    "[pollService] processVote",
    pollId,
    "voter:",
    voterId,
    "index:",
    selectedIndex,
  );

  // Get poll with metadata
  const poll = await repo.findPollById(pollId);
  if (!poll) {
    throw new Error(`Poll ${pollId} not found`);
  }

  // Parse metadata
  const metadata = poll.metadata || {};
  console.info("[pollService] Poll metadata:", JSON.stringify(metadata));

  // Determine action type
  const actionType = metadata.actionType || poll.vote_type || "generic";

  // Build response based on action type and selected index
  const response = {
    pollId,
    voterId,
    selectedIndex,
    actionType,
    poll: {
      id: poll.id,
      chatId: poll.chat_id,
      title: poll.title,
    },
    data: {
      // Include all metadata for frontend to use
      ...metadata,
    },
  };

  // Process based on action type
  switch (actionType) {
    case "menu_spotify":
    case "menu":
      // Menu polls: extract action from metadata.options
      if (metadata.options && Array.isArray(metadata.options)) {
        const option = metadata.options.find((opt) => opt.index === selectedIndex);
        if (option) {
          response.action = option.action;
          // Merge option data with metadata
          response.data = { ...metadata, ...option.data };
          response.handler = option.handler;
          response.target = option.target;
        } else {
          response.action = "unknown";
          response.error = `No action defined for index ${selectedIndex}`;
        }
      } else {
        response.action = "unknown";
        response.error = "No options in metadata";
      }
      break;

    case "spotify_track":
    case "spotify_collection":
      // Spotify polls: return metadata for frontend to process
      response.action = actionType;
      response.data = metadata;
      break;

    case "confession":
      // Confession polls: approval/rejection
      response.action = "confession";
      response.data = metadata;
      response.approved = selectedIndex === 0; // Index 0 = approve
      break;

    default:
      // Generic poll: just return the selection
      response.action = "generic";
      response.data = metadata;
      break;
  }

  console.info(
    "[pollService] processVote result:",
    response.action,
    response.handler || response.target || "",
  );
  console.info(
    "[pollService] processVote response.data:",
    JSON.stringify(response.data),
  );

  return response;
}

module.exports = {
  createPoll,
  getPoll,
  listPolls,
  removePoll,
  recordVote,
  getPollState,
  processVote,
};
