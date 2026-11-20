// Creates (or updates the password of) one login user per app and puts each in its
// least-privilege group role from migrations/003_app_roles.sql. Run after migrating.
// In production, create these users through your database provider instead.
import pg from "pg";

const connectionString = process.env.MIGRATION_DATABASE_URL;
const users = [
  { name: "cms_user", group: "cms_app", password: process.env.CMS_DB_PASSWORD },
  { name: "site_user", group: "site_app", password: process.env.SITE_DB_PASSWORD },
];

const missing = [!connectionString && "MIGRATION_DATABASE_URL", ...users.filter((u) => !u.password).map((u) => u.name === "cms_user" ? "CMS_DB_PASSWORD" : "SITE_DB_PASSWORD")].filter(Boolean);
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}
const weak = users.filter((u) => u.password.length < 12);
if (weak.length) {
  console.error(`Passwords must be at least 12 characters (${weak.map((u) => u.name).join(", ")})`);
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  for (const { name, group, password } of users) {
    // Role names are fixed constants above; the password is a literal escaped by the driver.
    const ident = client.escapeIdentifier(name);
    const literal = client.escapeLiteral(password);
    const { rowCount } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name]);
    await client.query(
      rowCount
        ? `ALTER ROLE ${ident} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${literal}`
        : `CREATE ROLE ${ident} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${literal}`,
    );
    await client.query(`GRANT ${client.escapeIdentifier(group)} TO ${ident}`);
    console.log(`${rowCount ? "updated" : "created"} ${name} (member of ${group})`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
