import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ThreadState = {
	channel: string;
	rootThreadTs: string;
	claudeSessionId: string;
	workspacePath: string;
	createdAt: string;
	updatedAt: string;
};

type ThreadStateRecord = Record<string, ThreadState>;

export class ThreadStateStore {
	private dirEnsured = false;

	constructor(private readonly filePath: string) {}

	async get(key: string): Promise<ThreadState | null> {
		const state = await this.readAll();
		return state[key] ?? null;
	}

	async set(key: string, value: ThreadState): Promise<void> {
		const state = await this.readAll();
		state[key] = value;
		await this.writeAll(state);
	}

	async upsert(
		key: string,
		updater: (existing: ThreadState | null) => ThreadState,
	): Promise<void> {
		const state = await this.readAll();
		state[key] = updater(state[key] ?? null);
		await this.writeAll(state);
	}

	private async readAll(): Promise<ThreadStateRecord> {
		try {
			const content = await readFile(this.filePath, "utf8");
			return JSON.parse(content) as ThreadStateRecord;
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return {};
			}
			throw error;
		}
	}

	private async writeAll(state: ThreadStateRecord): Promise<void> {
		if (!this.dirEnsured) {
			await mkdir(path.dirname(this.filePath), { recursive: true });
			this.dirEnsured = true;
		}
		await writeFile(
			this.filePath,
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);
	}
}
