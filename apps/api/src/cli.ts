import { createSeed } from "@fp/shared";
import { loadConfig } from "./config.js";
import { FileRepository, MongoRepository } from "./repository.js";
import { GameService } from "./service.js";
const config = loadConfig();
if (config.mode !== "demo")
  throw new Error(
    "Seed/reset are demo-only commands. Live membership must be provisioned independently.",
  );
const repo = config.mongodbUri
  ? await MongoRepository.open(config.mongodbUri, () => createSeed())
  : await FileRepository.open(config.dataFile, () => createSeed());
if (process.argv[2] === "reset") await new GameService(repo, config).reset();
const db = await repo.read();
console.log(
  `Demo ${process.argv[2] === "reset" ? "reset" : "ready"}: ${db.profiles.length} fictional members; ${db.match.state}. Stop the API before running CLI reset against JSON storage.`,
);
await repo.close();
