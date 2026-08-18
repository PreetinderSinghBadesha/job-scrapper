import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { createPool, getListings, getListingsSummary } from "./loader.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, "..", "public");

const databaseUrl = requireEnv("DATABASE_URL");
const port = process.env["PORT"] ? Number(process.env["PORT"]) : 3000;
const pool = createPool(databaseUrl);

const app = express();
app.use(express.static(publicDir));

app.get("/api/listings", async (req: Request, res: Response) => {
  const searchParam = req.query["search"];
  const sourceParam = req.query["source"];
  const search = typeof searchParam === "string" ? searchParam : undefined;
  const source = typeof sourceParam === "string" ? sourceParam : undefined;

  try {
    const [page, summary] = await Promise.all([
      getListings(pool, {
        ...(search !== undefined ? { search } : {}),
        ...(source !== undefined ? { source } : {}),
      }),
      getListingsSummary(pool),
    ]);
    res.json({ ...page, summary });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.listen(port, () => {
  process.stdout.write(`Listening on http://localhost:${port}\n`);
});
