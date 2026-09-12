import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import type { Database } from "@fp/shared";
export interface Repository {
  read(): Promise<Database>;
  transact<T>(change: (db: Database) => T | Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export class FileRepository implements Repository {
  private tail: Promise<unknown> = Promise.resolve();
  private constructor(
    private path: string,
    private state: Database,
  ) {}
  static async open(path: string, seed: () => Database) {
    let state: Database;
    try {
      state = JSON.parse(await readFile(path, "utf8")) as Database;
      if (state.version !== 1) throw new Error("Unsupported database version");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = seed();
    }
    const repo = new FileRepository(path, state);
    await repo.persist(state);
    return repo;
  }
  private async persist(state: Database) {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temp, this.path);
  }
  async read() {
    await this.tail;
    return structuredClone(this.state);
  }
  transact<T>(change: (db: Database) => T | Promise<T>): Promise<T> {
    const work = this.tail.then(async () => {
      const next = structuredClone(this.state);
      const result = await change(next);
      next.revision = this.state.revision + 1;
      await this.persist(next);
      this.state = next;
      return structuredClone(result);
    });
    this.tail = work.catch(() => undefined);
    return work;
  }
  async close() {
    await this.tail;
  }
}
export class MongoRepository implements Repository {
  private constructor(private client: MongoClient) {}
  static async open(uri: string, seed: () => Database) {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();
    await Promise.all([
      db
        .collection("decisions")
        .createIndex({ scenarioId: 1, recipientId: 1 }, { unique: true }),
      db
        .collection("scoreEvents")
        .createIndex({ sourceId: 1, type: 1, userId: 1 }, { unique: true }),
      db
        .collection("callbacks")
        .createIndex({ callbackId: 1 }, { unique: true }),
    ]);
    await db
      .collection<
        Database & {
          _id: string;
        }
      >("state")
      .updateOne(
        { _id: "league" },
        { $setOnInsert: { ...seed(), _id: "league" } },
        { upsert: true },
      );
    return new MongoRepository(client);
  }
  async read() {
    const value = await this.client
      .db()
      .collection<
        Database & {
          _id: string;
        }
      >("state")
      .findOne({ _id: "league" });
    if (!value) throw new Error("Missing league state");
    const { _id, ...state } = value;
    return state as Database;
  }
  async transact<T>(change: (db: Database) => T | Promise<T>): Promise<T> {
    const session = this.client.startSession();
    try {
      return (await session.withTransaction(
        async () => {
          const collection = this.client.db().collection<
            Database & {
              _id: string;
            }
          >("state");
          const current = await collection.findOne(
            { _id: "league" },
            { session },
          );
          if (!current) throw new Error("Missing state");
          const next = structuredClone(current);
          const result = await change(next);
          next.revision = current.revision + 1;
          const written = await collection.replaceOne(
            { _id: "league", revision: current.revision },
            next,
            { session },
          );
          if (written.modifiedCount !== 1)
            throw new Error("Concurrent state update");
          for (const decision of next.decisions.filter(
            (d) => !current.decisions.some((c) => c.id === d.id),
          ))
            await this.client
              .db()
              .collection("decisions")
              .insertOne(decision, { session });
          for (const event of next.scoreEvents.filter(
            (d) => !current.scoreEvents.some((c) => c.id === d.id),
          ))
            await this.client
              .db()
              .collection("scoreEvents")
              .insertOne(event, { session });
          for (const callbackId of next.callbackIds.filter(
            (id) => !current.callbackIds.includes(id),
          ))
            await this.client
              .db()
              .collection("callbacks")
              .insertOne({ callbackId }, { session });
          return result;
        },
        { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
      )) as T;
    } finally {
      await session.endSession();
    }
  }
  async close() {
    await this.client.close();
  }
}
