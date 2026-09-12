import { createSeed } from "@fp/shared";
import { loadConfig } from "./config.js";
import { FileRepository, MongoRepository } from "./repository.js";
import { GameService } from "./service.js";
import { createServer } from "./server.js";
const config = loadConfig();
const repo = config.mongodbUri
  ? await MongoRepository.open(config.mongodbUri, () => createSeed())
  : await FileRepository.open(config.dataFile, () => createSeed());
const service = new GameService(repo, config);
const { app } = await createServer(service);
await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(
  `Fantasy Phishing API: ${config.apiOrigin}/health (${config.mode}; ${config.mongodbUri ? "MongoDB" : "single-process JSON"})`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
