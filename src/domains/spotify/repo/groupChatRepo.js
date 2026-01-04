const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Repository for GroupChat operations
 */
module.exports = {
  /**
   * Find or create a group chat by WhatsApp chat ID
   */
  async findOrCreateByChatId(chatId, data = {}) {
    return await prisma.groupChat.upsert({
      where: { chatId },
      update: { updatedAt: new Date() },
      create: {
        chatId,
        name: data.name,
        settings: data.settings || {},
      },
      include: {
        playlist: true,
      },
    });
  },

  /**
   * Find group chat by chat ID
   */
  async findByChatId(chatId) {
    return await prisma.groupChat.findUnique({
      where: { chatId },
      include: {
        playlist: true,
      },
    });
  },

  /**
   * Update group chat playlist
   */
  async updatePlaylist(chatId, playlistId) {
    return await prisma.groupChat.update({
      where: { chatId },
      data: { playlistId },
      include: {
        playlist: true,
      },
    });
  },

  /**
   * Get group settings
   */
  async getSettings(chatId) {
    const group = await prisma.groupChat.findUnique({
      where: { chatId },
      select: { settings: true },
    });
    return group?.settings || {};
  },

  /**
   * Update group settings
   */
  async updateSettings(chatId, settings) {
    return await prisma.groupChat.update({
      where: { chatId },
      data: { settings },
    });
  },
};
