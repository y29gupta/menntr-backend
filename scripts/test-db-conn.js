// scripts/test-db-conn.js
// Usage: node scripts/test-db-conn.js
// require('dotenv').config();
// console.log('=== test-db-conn starting ===');
// console.log('NODE ENV:', process.env.NODE_ENV || '(not set)');
// console.log('RAW DATABASE_URL:', process.env.DATABASE_URL);

// try {
//   if (!process.env.DATABASE_URL) {
//     console.error(
//       'ERROR: process.env.DATABASE_URL is empty. Load .env or set the env var in this shell.'
//     );
//     process.exit(1);
//   }
//   // parse URL to show username/password length (password is not printed)
//   try {
//     const p = new URL(process.env.DATABASE_URL);
//     console.log('DB host:', p.hostname + ':' + p.port);
//     console.log('DB user:', p.username);
//     console.log('DB password length:', p.password?.length ?? '(none)');
//   } catch (e) {
//     console.warn('WARN: Could not parse DATABASE_URL with URL():', e.message);
//   }
// } catch (e) {
//   console.error('Fatal checking env:', e);
//   process.exit(1);
// }

// // Try imports in order: standard @prisma/client, then generated client path fallback
// async function run() {
//   let PrismaClient;
//   try {
//     PrismaClient = require('@prisma/client').PrismaClient;
//     console.log('Using @prisma/client import');
//   } catch (e1) {
//     console.warn('Could not import @prisma/client, trying generated client paths...');
//     try {
//       PrismaClient = require('../src/generated/prisma/client').PrismaClient;
//       console.log('Using src/generated/prisma/client import');
//     } catch (e2) {
//       console.error('Failed to import Prisma client. Errors:');
//       console.error('@prisma/client:', e1 && e1.message);
//       console.error('src/generated/prisma/client:', e2 && e2.message);
//       process.exit(1);
//     }
//   }

//   const prisma = new PrismaClient({ log: ['info'] });

//   try {
//     await prisma.$connect();
//     console.log('OK: Prisma connected');
//     const now = await prisma.$queryRaw`SELECT now() as now`;
//     console.log('DB now:', now);
//   } catch (err) {
//     console.error('PRISMA CONNECT ERROR:');
//     console.error(err);
//   } finally {
//     try {
//       await prisma.$disconnect();
//     } catch (_) {}
//   }
// }

// run().catch((e) => {
//   console.error('RUN ERROR', e);
//   process.exit(1);
// });
