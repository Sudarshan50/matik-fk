import { loadBotConfig } from "./config.js";
import { MatiksBot } from "./MatiksBot.js";

async function main() {
  const config = loadBotConfig();
  const bot = new MatiksBot(config);
  await bot.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
