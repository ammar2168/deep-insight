import "server-only";

import { TRPCError } from "@trpc/server";

import { getClient, MODEL } from "./client";

/**
 * A tool definition paired with the function that actually runs it. Generic on
 * purpose: this file has no idea what tools exist or what they do — it just runs
 * whatever's registered. Swapping in a different or larger tool set later (e.g.
 * exposing Tier 2's own data-fetch steps as tools instead of one atomic tool) never
 * requires touching this loop, only the tool list passed in.
 */
export type ToolDefinition = {
	name: string;
	description: string;
	input_schema: {
		type: "object";
		// biome-ignore lint/suspicious/noExplicitAny: matches the Anthropic SDK's own loosely-typed JSON schema shape
		properties: Record<string, any>;
		required?: string[];
	};
	// biome-ignore lint/suspicious/noExplicitAny: tool args are inherently dynamic per-tool; each handler declares and casts its own narrow input type
	handler: (input: any) => Promise<string>;
};

const DEFAULT_MAX_ROUNDS = 4;

/**
 * Runs a standard Claude tool-use loop: call the model, and if it asks to use a tool,
 * run it and feed the result back, repeating until the model returns a final text
 * answer (or the round cap is hit — a hard structural bound on cost/latency,
 * independent of which or how many tools are registered).
 */
export async function runToolLoop(params: {
	system: string;
	// biome-ignore lint/suspicious/noExplicitAny: passed straight through to the SDK, which owns the real type
	messages: any[];
	tools: ToolDefinition[];
	maxTokens: number;
	maxRounds?: number;
}): Promise<string> {
	const client = getClient();
	const toolsByName = new Map(params.tools.map((t) => [t.name, t]));
	const anthropicTools = params.tools.map(
		({ name, description, input_schema }) => ({
			name,
			description,
			input_schema,
		}),
	);

	const messages = [...params.messages];
	const maxRounds = params.maxRounds ?? DEFAULT_MAX_ROUNDS;

	for (let round = 0; round < maxRounds; round++) {
		const response = await client.messages.create({
			model: MODEL,
			max_tokens: params.maxTokens,
			system: params.system,
			tools: anthropicTools,
			messages,
		});

		const toolUseBlocks = response.content.filter(
			(block) => block.type === "tool_use",
		);
		if (toolUseBlocks.length === 0) {
			const textBlock = response.content.find((block) => block.type === "text");
			if (textBlock?.type !== "text") {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Couldn't read a response from the model",
				});
			}
			return textBlock.text.trim();
		}

		for (const block of toolUseBlocks) {
			console.log(`[tool-loop] round ${round}: model called ${block.name}`);
		}

		messages.push({ role: "assistant", content: response.content });

		const toolResults = await Promise.all(
			toolUseBlocks.map(async (block) => {
				const tool = toolsByName.get(block.name);
				if (!tool) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Model tried to use an unknown tool: ${block.name}`,
					});
				}
				const content = await tool.handler(block.input);
				return {
					type: "tool_result" as const,
					tool_use_id: block.id,
					content,
				};
			}),
		);

		messages.push({ role: "user", content: toolResults });
	}

	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: `Tool loop exceeded ${maxRounds} rounds without a final answer`,
	});
}
