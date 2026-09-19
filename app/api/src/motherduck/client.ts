import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { z } from "zod";

export class MotherDuckUnavailableError extends Error {
  constructor() { super("MotherDuck no está disponible. Comprueba la conexión y MOTHERDUCK_TOKEN del servidor."); }
}

/** DuckDB remota por defecto; `MOTHERDUCK_DATABASE` o `buildApp` pueden cambiarla. */
export const DEFAULT_MOTHERDUCK_DATABASE = "md:hackspain_2026?saas_mode=true";

export class MotherDuckClient {
  readonly database: string;
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private closed = false;

  constructor(database: string = process.env.MOTHERDUCK_DATABASE ?? DEFAULT_MOTHERDUCK_DATABASE) {
    this.database = database;
  }

  private async connect(): Promise<DuckDBConnection> {
    if (this.closed) throw new MotherDuckUnavailableError();
    if (this.connection) return this.connection;
    const token = process.env.MOTHERDUCK_TOKEN ?? process.env.motherduck_token;
    if (!token && this.database.startsWith("md:")) throw new MotherDuckUnavailableError();
    let expired = false;
    let timer: NodeJS.Timeout | undefined;
    const opening = (async () => {
      const instance = await DuckDBInstance.create(this.database, token ? { motherduck_token: token } : {});
      if (expired || this.closed) { instance.closeSync(); throw new MotherDuckUnavailableError(); }
      const connection = await instance.connect();
      if (expired || this.closed) { connection.closeSync(); instance.closeSync(); throw new MotherDuckUnavailableError(); }
      this.instance = instance;
      this.connection = connection;
      return connection;
    })();
    try {
      return await Promise.race([opening, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { expired = true; reject(new MotherDuckUnavailableError()); }, 15_000);
      })]);
    } finally { clearTimeout(timer); }
  }

  async query<T>(sql: string, schema: z.ZodType<T>, values: string[] = []): Promise<T[]> {
    if (this.pending >= 32 || this.closed) throw new MotherDuckUnavailableError();
    this.pending += 1;
    const previous = this.queue;
    let release: () => void = () => undefined;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    let timer: NodeJS.Timeout | undefined;
    try {
      const connection = await this.connect();
      timer = setTimeout(() => connection.interrupt(), 30_000);
      const result = await connection.runAndReadAll(sql, values);
      return z.array(schema).parse(result.getRowObjectsJson());
    } catch (error) {
      if (error instanceof MotherDuckUnavailableError) throw error;
      // The driver may include credentials in its errors: expose only a safe boundary error.
      throw new MotherDuckUnavailableError();
    } finally {
      clearTimeout(timer);
      this.pending -= 1;
      release();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.queue;
    this.connection?.closeSync();
    this.instance?.closeSync();
  }
}
