import type { Art50Category } from '../deadlines.js';

export type DetectorKind = 'sdk' | 'http-api' | 'ui-widget' | 'dependency';

export interface Detector {
  id: string;
  title: string;
  /** File extensions (without dot) this detector applies to. Empty = all text files. */
  extensions: string[];
  pattern: RegExp;
  categories: Art50Category[];
  kind: DetectorKind;
  hint: string;
}

const JS = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte', 'astro'];
const PY = ['py'];
const MANIFEST = ['json', 'txt', 'toml', 'mod', 'gradle', 'xml', 'yaml', 'yml', 'lock'];

/**
 * Signatures of AI surfaces that trigger Article 50 obligations.
 * Line-based regex matching: fast, language-tolerant, good enough to find
 * the conversation starters. False positives are acceptable (the report
 * asks a human to confirm); false negatives are the real enemy.
 */
export const DETECTORS: Detector[] = [
  // ---- LLM / chat SDKs → interaction (50(1)) + synthetic text (50(2)) ----
  {
    id: 'openai-sdk',
    title: 'OpenAI SDK',
    extensions: [...JS, ...PY],
    pattern: /(from\s+['"]openai['"]|require\(['"]openai['"]\)|import\s+openai|from\s+openai\s+import|new\s+OpenAI\s*\()/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'OpenAI client usage — chat/completions output is AI-generated content.',
  },
  {
    id: 'anthropic-sdk',
    title: 'Anthropic SDK',
    extensions: [...JS, ...PY],
    pattern: /(@anthropic-ai\/sdk|from\s+anthropic\s+import|import\s+anthropic|new\s+Anthropic\s*\()/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'Anthropic Claude client usage.',
  },
  {
    id: 'google-genai',
    title: 'Google Gemini SDK',
    extensions: [...JS, ...PY],
    pattern: /(@google\/generative-ai|@google\/genai|google\.generativeai|from\s+google\s+import\s+genai|GoogleGenerativeAI)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'Google Gemini client usage.',
  },
  {
    id: 'mistral-sdk',
    title: 'Mistral SDK',
    extensions: [...JS, ...PY],
    pattern: /(@mistralai\/mistralai|from\s+mistralai|import\s+mistralai)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'Mistral client usage.',
  },
  {
    id: 'cohere-sdk',
    title: 'Cohere SDK',
    extensions: [...JS, ...PY],
    pattern: /(cohere-ai|from\s+cohere|import\s+cohere|new\s+CohereClient)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'Cohere client usage.',
  },
  {
    id: 'vercel-ai',
    title: 'Vercel AI SDK',
    extensions: JS,
    pattern: /(from\s+['"]ai['"]|from\s+['"]ai\/react['"]|useChat\s*\(|useCompletion\s*\(|streamText\s*\(|generateText\s*\()/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'Vercel AI SDK — useChat/streamText indicate a user-facing AI interface.',
  },
  {
    id: 'langchain',
    title: 'LangChain',
    extensions: [...JS, ...PY],
    pattern: /(from\s+langchain|import\s+langchain|@langchain\/|langchain_core|langchain_openai|langchain_anthropic)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'LangChain orchestration — typically powers chat or generation features.',
  },
  {
    id: 'llamaindex',
    title: 'LlamaIndex',
    extensions: [...JS, ...PY],
    pattern: /(from\s+llama_index|import\s+llama_index|llamaindex)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'LlamaIndex RAG/agent framework.',
  },
  {
    id: 'litellm',
    title: 'LiteLLM',
    extensions: PY,
    pattern: /(from\s+litellm|import\s+litellm)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'LiteLLM multi-provider gateway.',
  },
  {
    id: 'transformers',
    title: 'Hugging Face Transformers',
    extensions: PY,
    pattern: /(from\s+transformers\s+import|import\s+transformers|pipeline\s*\(\s*['"]text-generation['"])/,
    categories: ['synthetic-content'],
    kind: 'sdk',
    hint: 'Local model inference via transformers.',
  },
  {
    id: 'ollama',
    title: 'Ollama',
    extensions: [...JS, ...PY],
    pattern: /(import\s+ollama|from\s+ollama|ollama\.chat|localhost:11434)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'Local LLM serving via Ollama.',
  },
  {
    id: 'bedrock',
    title: 'AWS Bedrock',
    extensions: [...JS, ...PY],
    pattern: /(BedrockRuntimeClient|bedrock-runtime|InvokeModelCommand|boto3\.client\(\s*['"]bedrock)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'AWS Bedrock model invocation.',
  },
  {
    id: 'azure-openai',
    title: 'Azure OpenAI',
    extensions: [...JS, ...PY],
    pattern: /(AzureOpenAI|openai\.azure\.com|@azure\/openai)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'sdk',
    hint: 'Azure OpenAI service usage.',
  },

  // ---- Raw HTTP endpoints ----
  {
    id: 'llm-http',
    title: 'LLM provider HTTP API',
    extensions: [],
    pattern: /(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.cohere\.(ai|com)|api\.groq\.com|api\.together\.(ai|xyz)|openrouter\.ai\/api)/,
    categories: ['interaction', 'synthetic-content'],
    kind: 'http-api',
    hint: 'Direct HTTP call to an LLM provider API.',
  },

  // ---- Image / audio / video generation → synthetic content (50(2)), deepfake (50(4)) ----
  {
    id: 'image-gen',
    title: 'Image generation API',
    extensions: [],
    pattern: /(images\.generate|dall-e-[23]|gpt-image-1|api\.stability\.ai|replicate\.com\/|replicate\.run|fal\.ai|api\.midjourney|black-forest-labs|flux-pro|stable-diffusion)/i,
    categories: ['synthetic-content', 'deepfake-text'],
    kind: 'http-api',
    hint: 'AI image generation — outputs must carry machine-readable AI marking.',
  },
  {
    id: 'audio-gen',
    title: 'Speech/audio generation API',
    extensions: [],
    pattern: /(api\.elevenlabs\.io|elevenlabs|audio\.speech|text[-_]?to[-_]?speech|tts-1|play\.ht|api\.murf\.ai|resemble\.ai)/i,
    categories: ['synthetic-content', 'deepfake-text'],
    kind: 'http-api',
    hint: 'AI voice/audio generation — synthetic audio must be marked; voice clones are deepfakes.',
  },
  {
    id: 'video-gen',
    title: 'Video generation API',
    extensions: [],
    pattern: /(runwayml|api\.lumalabs\.ai|api\.heygen\.com|synthesia\.io|d-id\.com|sora-[0-9]|veo-[0-9])/i,
    categories: ['synthetic-content', 'deepfake-text'],
    kind: 'http-api',
    hint: 'AI video/avatar generation — deepfake disclosure obligations likely apply.',
  },

  // ---- Emotion / biometric → 50(3) ----
  {
    id: 'emotion-api',
    title: 'Emotion recognition / biometric API',
    extensions: [],
    pattern: /(api\.hume\.ai|hume[-_]?ai|affectiva|emotion[-_]?recognition|detect[-_]?emotion|DetectFaces.*Emotions|biometric[-_]?categori[sz]ation)/i,
    categories: ['emotion-biometric'],
    kind: 'http-api',
    hint: 'Emotion recognition / biometric categorisation — affected persons must be informed.',
  },

  // ---- Chat UI widgets → interaction (50(1)) ----
  {
    id: 'chat-ui',
    title: 'AI chat UI component',
    extensions: JS,
    pattern: /(@nlux\/|react-chatbot-kit|@chatscope\/chat-ui-kit|botpress|@copilotkit\/|deep-chat|assistant-ui|<Chatbot|ChatWindow|ChatWidget)/,
    categories: ['interaction'],
    kind: 'ui-widget',
    hint: 'Chat interface component — users must be told they are talking to an AI.',
  },

  // ---- Dependency manifests (strong, low-noise signal) ----
  {
    id: 'manifest-ai-dep',
    title: 'AI SDK dependency declared',
    extensions: MANIFEST,
    pattern: /(["']openai["']|["']@anthropic-ai\/sdk["']|["']@google\/generative-ai["']|["']@mistralai\/mistralai["']|["']cohere-ai["']|["']@langchain\/|^\s*(openai|anthropic|google-generativeai|google-genai|mistralai|cohere|litellm|langchain|llama-index|transformers|elevenlabs)\s*([=><~^]|$)|github\.com\/sashabaranov\/go-openai|github\.com\/anthropics\/anthropic-sdk-go|com\.openai|com\.anthropic)/m,
    categories: ['interaction', 'synthetic-content'],
    kind: 'dependency',
    hint: 'AI SDK declared in dependency manifest.',
  },
];

/** Signals that some Article 50 work already exists in the codebase. */
export interface EvidenceDetector {
  id: string;
  title: string;
  pattern: RegExp;
  categories: Art50Category[];
}

export const EVIDENCE_DETECTORS: EvidenceDetector[] = [
  {
    id: 'disclosure-markup',
    title: 'AI disclosure markup',
    pattern: /(data-ai-disclosure|ai-disclosure|aria-label=["'][^"']*\bAI\b|you (are|'re) (chatting|talking|interacting) with (an )?AI|powered by (an )?AI|AI[- ]generated|artificial intelligence assistant)/i,
    categories: ['interaction', 'deepfake-text'],
  },
  {
    id: 'machine-readable-marking',
    title: 'Machine-readable AI content marking',
    pattern: /(<meta\s+name=["']ai-(generated|disclosure)["']|trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|digitalSourceType|c2pa|content_credentials|contentcredentials|synthid|invisible[-_]?watermark)/i,
    categories: ['synthetic-content'],
  },
  {
    id: 'a50-config',
    title: 'article50 configuration',
    pattern: /(a50\.config|article50\.config|\.a50rc)/,
    categories: ['interaction', 'synthetic-content', 'emotion-biometric', 'deepfake-text'],
  },
];
