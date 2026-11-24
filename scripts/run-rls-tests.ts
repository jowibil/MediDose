import "dotenv/config"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

const testFile = "supabase/tests/rls.test.sql"

if (!existsSync(testFile)) {
  console.error(`Missing ${testFile}`)
  process.exit(1)
}

const result = spawnSync(
  "psql",
  [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", testFile],
  { stdio: "inherit", shell: process.platform === "win32" },
)

if (result.error) {
  console.error(
    "Could not run psql. Install PostgreSQL client tools and start local Supabase with `npm run db:start`.",
  )
  process.exit(1)
}

process.exit(result.status ?? 1)
