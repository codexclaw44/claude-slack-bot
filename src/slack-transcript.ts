import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WebClient } from "@slack/web-api";

export type SlackFile = {
	id: string;
	name: string | null;
	mimetype: string;
	urlPrivate: string;
};

export function extractSlackFiles(
	raw: Array<Record<string, unknown>>,
): SlackFile[] {
	return raw
		.filter(
			(f): f is Record<string, unknown> & { id: string; url_private: string } =>
				typeof f.id === "string" && typeof f.url_private === "string",
		)
		.map((f) => ({
			id: f.id,
			name: typeof f.name === "string" ? f.name : null,
			mimetype:
				typeof f.mimetype === "string"
					? f.mimetype
					: "application/octet-stream",
			urlPrivate: f.url_private,
		}));
}

export type SlackTranscriptMessage = {
	ts: string;
	threadTs: string;
	userId: string | null;
	role: "user" | "assistant";
	text: string;
	files?: SlackFile[];
};

type SlackMessage = {
	ts?: string;
	thread_ts?: string;
	text?: string;
	user?: string;
	bot_id?: string;
	subtype?: string;
	files?: Array<{
		id?: string;
		name?: string | null;
		mimetype?: string;
		url_private?: string;
	}>;
};

export async function fetchSlackTranscript(
	client: WebClient,
	channel: string,
	rootThreadTs: string,
	botUserId: string,
): Promise<SlackTranscriptMessage[]> {
	const messages: SlackMessage[] = [];
	let cursor: string | undefined;

	do {
		const response = await client.conversations.replies({
			channel,
			ts: rootThreadTs,
			cursor,
			limit: 200,
		});

		for (const message of response.messages ?? []) {
			messages.push(message as SlackMessage);
		}

		cursor = response.response_metadata?.next_cursor || undefined;
	} while (cursor);

	return messages
		.filter((message) => {
			if (!message.ts || !message.text) {
				return false;
			}

			if (
				message.subtype === "message_changed" ||
				message.subtype === "message_deleted"
			) {
				return false;
			}

			return true;
		})
		.sort((left, right) => Number(left.ts) - Number(right.ts))
		.map((message) => ({
			ts: message.ts ?? "",
			threadTs: message.thread_ts ?? message.ts ?? "",
			userId: message.user ?? null,
			role: message.user === botUserId || message.bot_id ? "assistant" : "user",
			text: message.text ?? "",
			files: message.files?.length
				? extractSlackFiles(message.files as Array<Record<string, unknown>>)
				: undefined,
		}));
}

export async function downloadSlackFiles(
	files: SlackFile[],
	destDir: string,
	token: string,
): Promise<string[]> {
	await mkdir(destDir, { recursive: true });

	const results = await Promise.all(
		files.map(async (file) => {
			const filename = file.name ?? file.id;
			if (!filename) return null;

			try {
				const response = await fetch(file.urlPrivate, {
					headers: { Authorization: `Bearer ${token}` },
				});
				if (!response.ok) {
					console.error(
						`[slack] Failed to download file ${filename}: ${response.status}`,
					);
					return null;
				}

				const buffer = await response.arrayBuffer();
				await writeFile(path.join(destDir, filename), Buffer.from(buffer));
				return filename;
			} catch (err) {
				console.error(`[slack] Error downloading file ${filename}:`, err);
				return null;
			}
		}),
	);

	return results.filter((name): name is string => name !== null);
}
