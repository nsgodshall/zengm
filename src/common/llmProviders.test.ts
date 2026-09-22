import { describe, expect, test } from "vitest";
import {
	getLlmProvider,
	LLM_PROVIDERS,
	resolveLlmSettings,
} from "./llmProviders.ts";

describe("LLM providers", () => {
	test("offers OpenRouter, DeepSeek, OpenAI and anything else", () => {
		expect(LLM_PROVIDERS.map((provider) => provider.key)).toEqual([
			"openrouter",
			"deepseek",
			"openai",
			"custom",
		]);
	});

	test("falls back to OpenRouter for an unknown or missing provider", () => {
		expect(getLlmProvider(undefined).key).toBe("openrouter");
		expect(getLlmProvider("nonsense").key).toBe("openrouter");
	});

	test("uses a known provider's own address, whatever is typed", () => {
		expect(
			resolveLlmSettings({
				provider: "deepseek",
				baseUrl: "https://example.com/ignored",
				model: undefined,
			}),
		).toMatchObject({
			baseUrl: "https://api.deepseek.com/v1",
			model: "deepseek-chat",
		});
	});

	test("lets a custom provider give its own address", () => {
		expect(
			resolveLlmSettings({
				provider: "custom",
				baseUrl: " http://localhost:11434/v1 ",
				model: " llama3 ",
			}),
		).toMatchObject({
			baseUrl: "http://localhost:11434/v1",
			model: "llama3",
		});
	});

	test("keeps a model the user chose", () => {
		expect(
			resolveLlmSettings({
				provider: "openrouter",
				baseUrl: undefined,
				model: "anthropic/claude-sonnet-4.5",
			}).model,
		).toBe("anthropic/claude-sonnet-4.5");
	});
});
