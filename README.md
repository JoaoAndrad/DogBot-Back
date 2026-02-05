# DogBot — Backend

Este repositório contém o backend do DogBot: um serviço HTTP em Node.js (Express) com persistência em PostgreSQL via Prisma. Ele expõe as APIs e integrações necessárias para alimentar o frontend e a interface administrativa, além de componentes de processamento assíncrono responsáveis por monitoramento e sincronização de reprodução.

Visão técnica (resumo)

- Plataforma: Node.js + Express para APIs; organização em rotas, serviços e domínios para separar responsabilidades.
- Persistência: PostgreSQL com Prisma ORM; esquema versionado por migrações do Prisma.
- Integrações externas: Spotify (OAuth e chamadas à API), Last.fm (metadados e recomendações) e clientes via SSE para sincronização em tempo real.
- Funcionalidades principais: gestão de usuários, sessões de "jam" (host/listeners), fila colaborativa de reprodução, votações/polls, histórico de playbacks e sincronização com contas Spotify.

Infraestrutura e operação

- Suporte a execução local com Docker Compose (Postgres) para desenvolvimento.
- Scripts e comandos npm padrão para desenvolvimento e produção; uso de migrações Prisma para evolução do banco.
- O serviço depende de segredos e credenciais para proteger endpoints internos e fluxos administrativos — configure-os no ambiente de execução.

Como executar (resumo)

1. Subir dependências de infraestrutura (ex.: Postgres via Docker Compose)

```bash
docker-compose up -d
```

2. Instalar dependências e gerar cliente Prisma

```bash
cd backend
npm install
npx prisma generate
```

3. Aplicar migrações em ambiente de desenvolvimento

```bash
npx prisma migrate dev --name init
```

4. Iniciar a aplicação

```bash
npm run dev
# ou
npm run start:prod
```

Considerações sobre migrações e dados

- Use as migrações do Prisma para manter o schema consistente entre ambientes. Em produção, aplique migrações com o comando apropriado do Prisma.

Integrações externas (resumo)

- Spotify: fluxo OAuth para contas de usuário e conta do bot; refresh de tokens e tratamento de rate-limits.
- Last.fm: resolução de recomendações e enriquecimento de metadados.
- SSE: hub de eventos para comunicação em tempo real com clientes conectados.

Operação e manutenção

- Implemente backups e procedimentos de restauração do PostgreSQL adequados ao ambiente de produção.
- Monitore jobs periódicos (por exemplo, monitor de contas Spotify) e revise logs para detectar problemas operacionais.

Pontos observados e recomendações

- Há pontos no código marcados como TODO (ex.: implementação de workers para broadcasts) que merecem atenção antes de cargas de produção.
- Avaliar remoção de operações demoradas no bootstrap do processo de runtime (por exemplo, geracao de artefatos em startup) para melhorar confiabilidade em containers.
- Recomenda-se adicionar testes automatizados e pipeline de CI/CD para deploys mais seguros.

Sugestões de documentação adicional (recomendado)

- `ENV.md`: catálogo e descrição das variáveis de ambiente e segredos necessários.
- `DEPLOY.md`: procedimentos e recomendações para deploy em produção, healthchecks e rollback.
- `SPOTIFY.md`: detalhes do fluxo OAuth, scopes e procedimentos operacionais para contas Spotify.
- `MAINTENANCE.md`: rotina de manutenção, backups, migrações e recuperação.
