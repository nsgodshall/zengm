// International Soccer Zen GM mod (storytelling, STORY_TELLING_PLAN.md Phase
// 7): where a World's written season reviews can come from. All of these speak
// OpenAI's chat completions API, so the only thing that changes is the address,
// the key and the model name - and a custom provider takes any other service
// that speaks it too (a local llama.cpp or Ollama server, say).

export type LlmProviderKey = "openai" | "openrouter" | "deepseek" | "custom";

export type LlmProvider = {
	key: LlmProviderKey;
	name: string;
	// Empty for a custom provider, where the user gives their own
	baseUrl: string;
	// Models worth offering, the first being the default
	models: string[];
	// Where to get a key
	keyUrl?: string;
};

export const LLM_PROVIDERS: LlmProvider[] = [
	{
		key: "openrouter",
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		models: [
			"deepseek/deepseek-chat",
			"anthropic/claude-sonnet-4.5",
			"openai/gpt-4o-mini",
			"meta-llama/llama-3.3-70b-instruct",
			"google/gemini-2.5-flash",
		],
		keyUrl: "https://openrouter.ai/keys",
	},
	{
		key: "deepseek",
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com/v1",
		models: ["deepseek-chat", "deepseek-reasoner"],
		keyUrl: "https://platform.deepseek.com/api_keys",
	},
	{
		key: "openai",
		name: "OpenAI",
		baseUrl: "https://api.openai.com/v1",
		models: ["gpt-4o-mini", "gpt-4o"],
		keyUrl: "https://platform.openai.com/api-keys",
	},
	{
		key: "custom",
		name: "Something else",
		baseUrl: "",
		models: [],
	},
];

export const getLlmProvider = (key: string | undefined) =>
	LLM_PROVIDERS.find((provider) => provider.key === key) ??
	LLM_PROVIDERS.find((provider) => provider.key === "openrouter")!;

/**
 * The address and model to use, from what the user picked. A custom provider
 * uses whatever they typed; the rest fall back to their own defaults, so a key
 * on its own is enough to get going.
 */
export const resolveLlmSettings = ({
	provider,
	baseUrl,
	model,
}: {
	provider: string | undefined;
	baseUrl: string | undefined;
	model: string | undefined;
}) => {
	const chosen = getLlmProvider(provider);
	return {
		provider: chosen,
		baseUrl: (chosen.key === "custom" ? baseUrl?.trim() : chosen.baseUrl) ?? "",
		model: model?.trim() || chosen.models[0] || "",
	};
};
