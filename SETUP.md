# Menntr Backend - Local Setup Guide

This guide will help you set up the Menntr backend application locally for the first time.

## Prerequisites

Before you begin, ensure you have the following installed:

1. **Node.js** (v18 or higher recommended)
   - Check version: `node --version`
   - Download: https://nodejs.org/

2. **PostgreSQL** (v12 or higher)
   - Check version: `psql --version`
   - Download: https://www.postgresql.org/download/
   - Or use Docker: `docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres`

3. **npm** (comes with Node.js)
   - Check version: `npm --version`

4. **Git** (if cloning from repository)
   - Check version: `git --version`

## Step-by-Step Setup

### Step 1: Clone the Repository (if not already done)

```bash
git clone <repository-url>
cd menntr-backend
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all the required packages listed in `package.json`.

### Step 3: Set Up PostgreSQL Database

#### Option A: Using Local PostgreSQL

1. Create a new PostgreSQL database:
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE menntr_db;

# Exit psql
\q
```

#### Option B: Using Docker (Recommended for Quick Setup)

```bash
# Run PostgreSQL in Docker
docker run --name menntr-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=menntr_db \
  -p 5432:5432 \
  -d postgres:15

# Verify it's running
docker ps
```

### Step 4: Create Environment Variables File

Create a `.env` file in the root directory:

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

If `.env.example` doesn't exist, create `.env` with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=4000

# Frontend URL
FRONTEND_URL=http://localhost:3000
RESET_PASSWORD_URL=/reset-password

# Cookie Secret (generate a random 32+ character string)
COOKIE_SECRET=your-super-secret-cookie-key-minimum-32-characters-long

# Database Connection
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/menntr_db?schema=public

# JWT Configuration
# Generate RSA key pair for JWT (see instructions below)
JWT_PRIVATE_KEY_B64=<base64-encoded-private-key>
JWT_PUBLIC_KEY_B64=<base64-encoded-public-key>

# Or use direct PEM format (newline-escaped)
# JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
# JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

JWT_ISSUER=menntr
JWT_AUDIENCE=menntr.api
JWT_EXPIRES_IN=604800

# Auth Configuration
OTP_EXPIRY_MINUTES=15
RESET_PASSWORD_EXPIRY_MINUTES=15
ONE_TIME_LINK_BASE=http://localhost:3000/auth/one-time-login
BCRYPT_SALT_ROUNDS=12
ENABLE_SUPERADMIN_CREATION=true

# Email Configuration (Azure Communication Services)
ACS_CONNECTION_STRING=your-azure-communication-connection-string
ACS_FROM_EMAIL=noreply@yourdomain.com
INVITE_FROM_EMAIL=invites@yourdomain.com

# SMTP Configuration (Alternative to Azure)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Step 5: Generate JWT Keys

You need to generate RSA key pairs for JWT authentication. Here are two methods:

#### Method 1: Using OpenSSL (Recommended)

```bash
# Generate private key
openssl genrsa -out jwt-private.pem 2048

# Generate public key
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem

# Convert to base64 (for JWT_PRIVATE_KEY_B64 and JWT_PUBLIC_KEY_B64)
# Windows PowerShell:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("jwt-private.pem"))
[Convert]::ToBase64String([IO.File]::ReadAllBytes("jwt-public.pem"))

# Linux/Mac:
base64 -i jwt-private.pem
base64 -i jwt-public.pem
```

Copy the base64 output to your `.env` file for `JWT_PRIVATE_KEY_B64` and `JWT_PUBLIC_KEY_B64`.

#### Method 2: Using Online Tools (Less Secure)

You can use online RSA key generators, but be cautious with security.

### Step 6: Set Up Prisma

1. **Generate Prisma Client:**
```bash
npm run prisma:generate
```

2. **Run Database Migrations:**
```bash
npx prisma migrate deploy
```

Or if you want to apply migrations and see the SQL:
```bash
npx prisma migrate dev
```

3. **Verify Database Connection:**
```bash
node scripts/test-db-conn.js
```

You should see:
```
OK: Prisma connected
DB now: [timestamp]
```

### Step 7: Seed the Database (Optional)

The seed file creates initial data (plans, super admin user, etc.):

```bash
# Run the seed script
npx ts-node prisma/seed/seed.ts
```

This creates:
- Free and Enterprise plans
- Harvard University institution
- Super Admin role
- Super Admin user (email: `superadmin@menntr.com`, password: `SuperAdmin@123`)

### Step 8: Start the Development Server

```bash
npm run dev
```

The server should start on `http://localhost:4000` (or the port specified in your `.env`).

You should see output like:
```
Server listening on port 4000
```

### Step 9: Verify the Setup

1. **Check if the server is running:**
   - Open browser: `http://localhost:4000`
   - Or use curl: `curl http://localhost:4000`

2. **Test database connection:**
   - The server should start without database connection errors
   - Check logs for any Prisma connection messages

3. **Test API endpoints:**
   - Check if you have API documentation or test endpoints
   - Try logging in with the super admin credentials if seeded

## Common Issues and Solutions

### Issue 1: Database Connection Error

**Error:** `Can't reach database server` or `Connection refused`

**Solutions:**
- Verify PostgreSQL is running: `docker ps` or check PostgreSQL service
- Check `DATABASE_URL` in `.env` matches your database credentials
- Ensure PostgreSQL is listening on port 5432
- For Docker: `docker start menntr-postgres`

### Issue 2: Prisma Client Not Generated

**Error:** `Cannot find module '@prisma/client'`

**Solution:**
```bash
npm run prisma:generate
```

### Issue 3: JWT Keys Missing

**Error:** `JWT keys are missing`

**Solutions:**
- Ensure `JWT_PRIVATE_KEY_B64` and `JWT_PUBLIC_KEY_B64` are set in `.env`
- Or use `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` with newline-escaped PEM format
- Regenerate keys if needed (Step 5)

### Issue 4: Port Already in Use

**Error:** `EADDRINUSE: address already in use :::4000`

**Solutions:**
- Change `PORT` in `.env` to a different port (e.g., 4001)
- Or stop the process using port 4000

### Issue 5: TypeScript Compilation Errors

**Error:** Type errors during build

**Solutions:**
```bash
# Check for type errors
npm run typecheck

# Fix linting issues
npm run lint:fix
```

## Useful Commands

```bash
# Development
npm run dev              # Start development server with hot reload

# Database
npm run prisma:generate  # Generate Prisma Client
npx prisma migrate dev   # Create and apply migrations
npx prisma studio       # Open Prisma Studio (database GUI)
npx prisma db pull      # Pull schema from database

# Code Quality
npm run lint            # Check for linting errors
npm run lint:fix        # Fix linting errors
npm run format          # Format code with Prettier
npm run typecheck       # Check TypeScript types

# Production
npm run build           # Build for production
npm start              # Start production server
```

## Database Management

### Access Prisma Studio (Database GUI)

```bash
npm run prisma:studio
```

This opens a web interface at `http://localhost:5555` to view and edit your database.

### View Database Schema

```bash
npx prisma db pull
```

### Create a New Migration

```bash
npx prisma migrate dev --name your_migration_name
```

## Next Steps

1. **Explore the API:**
   - Check the routes in `src/routes/`
   - Review controllers in `src/controllers/`

2. **Set Up Frontend:**
   - If you have a frontend application, configure it to point to `http://localhost:4000`

3. **Configure Email:**
   - Set up Azure Communication Services or SMTP for email functionality
   - Update email credentials in `.env`

4. **Environment-Specific Config:**
   - Create `.env.development` and `.env.production` for different environments
   - Use environment-specific values

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Fastify Documentation](https://www.fastify.io/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## Support

If you encounter issues:
1. Check the error logs in the console
2. Verify all environment variables are set correctly
3. Ensure all prerequisites are installed
4. Check database connection and migrations
5. Review the Common Issues section above

---

**Happy Coding! 🚀**

