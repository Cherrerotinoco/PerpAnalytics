import { neon } from '@neondatabase/serverless';
import { SCHEMA_SQL, MIGRATIONS_SQL } from './schema.js';

/**
 * Neon access over its SQL-over-HTTP endpoint.
 *
 * HTTP rather than a TCP `pg` pool on purpose. The queries here are a handful of
 * single-statement cache reads and upserts, which is exactly what the HTTP
 * driver is for — and it is the only option that works behind a TLS-intercepting
 * corporate proxy, which accepts a TCP connection on 5432 but never forwards
 * Postgres' plaintext startup packet. Render has no such proxy, so this choice
 * costs nothing in production and keeps local development working.
 */

type SqlClient = ReturnType<typeof neon>;

let client: SqlClient | null = null;

export const getSql = (): SqlClient => {
  if (client) {
    return client;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  client = neon(url);
  return client;
};

/** Run a parameterised statement. Returns the rows. */
export const query = async <T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> => {
  const sql = getSql();
  return (await sql.query(text, params)) as T[];
};

/**
 * Split a DDL script into statements.
 *
 * Line comments are stripped first: a statement preceded by a `--` comment would
 * otherwise still begin with one after splitting, and any "skip comment lines"
 * filter applied afterwards would silently drop the statement with it.
 * Adequate for this file's hand-written DDL — it assumes no semicolon or `--`
 * appears inside a string literal, which none here do.
 */
export const splitStatements = (ddl: string): string[] =>
  ddl
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/** Apply the schema and any later column additions. Safe to run on every boot. */
export const migrate = async (): Promise<void> => {
  const sql = getSql();
  // The HTTP endpoint takes one statement per request, so send them one by one.
  for (const statement of [...splitStatements(SCHEMA_SQL), ...splitStatements(MIGRATIONS_SQL)]) {
    await sql.query(statement);
  }
};
