import pg from "pg";
import { loadServerConfig } from "../config.js";

const { Pool } = pg;
const { databaseUrl } = loadServerConfig();

export const pool = new Pool({ connectionString: databaseUrl });
