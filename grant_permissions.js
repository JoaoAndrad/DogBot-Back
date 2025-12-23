const db = require('./src/db.js');

async function grantPermissions() {
  try {
    console.log('Tentando conceder permissões ao usuário squarecloud...');
    const prisma = db.getPrisma();

    console.log('Executando GRANT USAGE ON SCHEMA public...');
    await prisma.$executeRaw`GRANT USAGE ON SCHEMA public TO squarecloud`;

    console.log('Executando GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES...');
    await prisma.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO squarecloud`;

    console.log('Executando GRANT USAGE, SELECT ON ALL SEQUENCES...');
    await prisma.$executeRaw`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO squarecloud`;

    console.log('Executando ALTER DEFAULT PRIVILEGES para tabelas...');
    await prisma.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO squarecloud`;

    console.log('Executando ALTER DEFAULT PRIVILEGES para sequências...');
    await prisma.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO squarecloud`;

    console.log('✅ Permissões concedidas com sucesso ao usuário squarecloud!');
  } catch (err) {
    console.error('❌ Erro ao conceder permissões:', err.message);
    console.error('Stack trace:', err.stack);
  } finally {
    process.exit(0);
  }
}

grantPermissions();
