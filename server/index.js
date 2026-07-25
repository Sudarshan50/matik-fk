import path from "node:path";
import { loadEnvFile } from "./loadEnv.js";
import { loadServerConfig } from "./config.js";
import { createApp } from "./app.js";
import { initDb, tokenRepository } from "./db/index.js";
import { schedulerService } from "./services/SchedulerService.js";
import { warmBotImageInBackground } from "./services/DockerContainerRunner.js";

loadEnvFile();
const config = loadServerConfig();

await initDb();
await tokenRepository.importFromFile(path.resolve(config.tokensFile));
await schedulerService.reschedule();

// Pre-warm shared bot image so Fire for user 2/3/N never rebuilds.
warmBotImageInBackground();

const app = createApp({ auth: config.auth });
app.listen(config.port, () => {
  console.log(`Matik admin portal → http://localhost:${config.port}`);
  console.log(`Database → ${config.databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
  console.log(`Bot image → ${process.env.BOT_IMAGE || "matik-fk-bot:latest"} (shared cache)`);
  console.log(`Auth user → ${config.auth.username}`);
});

