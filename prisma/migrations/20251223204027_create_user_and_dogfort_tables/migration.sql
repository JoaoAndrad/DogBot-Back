-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "title" TEXT,
    "options" JSON,
    "poll_options" JSON,
    "options_obj" JSON,
    "type" TEXT DEFAULT 'native',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "voter_id" TEXT NOT NULL,
    "selected_options" JSON,
    "selected_indexes" JSON,
    "selected_names" JSON,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "from_id" TEXT,
    "display_name" TEXT,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT,
    "snippet" TEXT,
    "has_media" BOOLEAN NOT NULL DEFAULT false,
    "media_meta" JSON,
    "msg_type" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" TEXT DEFAULT 'whatsapp-frontend',

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "sender_number" TEXT NOT NULL,
    "identifiers" TEXT[],
    "display_name" TEXT,
    "push_name" TEXT,
    "push_name_history" JSON,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ(6),
    "last_group_activity" TIMESTAMPTZ(6),
    "last_known_lid" TEXT,
    "confissoes" JSON,
    "metadata" JSON,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushNameHistory" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "observed_from" TEXT,
    "observed_lid" TEXT,
    "push_name" TEXT NOT NULL,
    "ts" BIGINT,

    CONSTRAINT "PushNameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DogFortStats" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "saldo" INTEGER DEFAULT 0,
    "mensal" INTEGER DEFAULT 0,
    "anual" INTEGER DEFAULT 0,
    "trofeus" INTEGER DEFAULT 0,
    "ultimo_treino" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DogFortStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vote_poll_id_idx" ON "Vote"("poll_id");

-- CreateIndex
CREATE INDEX "Vote_voter_id_idx" ON "Vote"("voter_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_sender_number_key" ON "User"("sender_number");

-- CreateIndex
CREATE INDEX "PushNameHistory_user_id_idx" ON "PushNameHistory"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "DogFortStats_user_id_key" ON "DogFortStats"("user_id");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushNameHistory" ADD CONSTRAINT "PushNameHistory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DogFortStats" ADD CONSTRAINT "DogFortStats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
