import "dotenv/config";
import OpenAI from "openai";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);


export const AnnotationsSchema = z.object({
  paragraphs: z.array(
    z.object({
      keyWords: z.array(z.string().min(1)).min(1).max(2),
      keySentences: z.array(z.string().min(1)).max(1),
    })
  ),
});
export type Annotations = z.infer<typeof AnnotationsSchema>;

//生成图片
/* export const DraftSchema = z.object({
  mainTitle: z.string().min(1),
  scenes: z
    .array(
      z.object({
        id: z.number().int().min(1).max(5),
        subTitle: z.string().min(1).max(60),
        img: z.string().regex(/^\/assets\/[1-5]\.png$/),
        text: z.array(z.string().min(1)).min(1),
        annotations: AnnotationsSchema.optional(),
        rationale: z.string().optional(),
      })
    )
    .min(3)
    .max(5),
}); */
export const DraftSchema = z.object({
  mainTitle: z.string().min(1),
  scenes: z
    .array(
      z.object({
        id: z.number().int().min(1).max(5),
        subTitle: z.string().min(1).max(88),
        text: z.array(z.string().min(1)).min(1),
        annotations: AnnotationsSchema.optional(),
        rationale: z.string().optional(),
      })
    )
    .length(5) // 强制必须 5 个
});

export type Draft = z.infer<typeof DraftSchema>;

// condition3 search 
const WhyHereSchema = z.object({
  explanation: z.string().min(0),
});
export type WhyHere = z.infer<typeof WhyHereSchema>;

// condition4 summary
const SceneRationaleSchema = z.object({
  rationale: z.string().min(0),
});
export type SceneRationale = z.infer<typeof SceneRationaleSchema>;

// condition5 suggestion
export const SentenceIssuesSchema = z.object({
  issues: z
    .array(
      z.object({
        id: z.string().min(1),
        sentence: z.string().min(1),
        issue: z.string().min(1),
      })
    )
    .min(0)
    .max(2),
});

export type SentenceIssues = z.infer<typeof SentenceIssuesSchema>;

// condition6 chatbot
export type ChatRewriteResponse = {
  type: "rewrite" | "advice" | "clarify" | "refuse";
  answer: string;          // 给用户看的文本（精简）
  replacement: string | null; // 可替换文本
};

const IssueSuggestionSchema = z.object({
  suggestion: z.string().min(1),
});
export type IssueSuggestion = z.infer<typeof IssueSuggestionSchema>;

const SceneAlternativesSchema = z.object({
  conversational: z.object({
    text: z.array(z.string().min(1)).min(1).max(3),
  }),
  professional: z.object({
    text: z.array(z.string().min(1)).min(1).max(3),
  }),
});

export type SceneAlternatives = z.infer<typeof SceneAlternativesSchema>;

export function withTimeout<T>(p: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export async function generateDraftFromLLM(args: {
  instruction: string;
}): Promise<Draft> {
  const { instruction } = args;

  // 1. 定义严格的 JSON Schema 🌟
  const responseSchema = {
    type: "object",
    properties: {
      mainTitle: { type: "string" },
      scenes: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            id: { type: "number" },
            subTitle: { type: "string" },
            text: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 2
            }
          },
          required: ["id", "subTitle", "text"] // 🌟 强制每个场景必须闭合且包含这三个字段
        }
      }
    },
    required: ["mainTitle", "scenes"]
  };

  const system = `
You generate a short video script as STRICT JSON only.
Return JSON with EXACT keys: mainTitle, scenes. No other keys. No markdown. No commentary.

Constraints:
- Language: English only.
- mainTitle: Max 10 words.
- scenes: Exactly 5 scenes.
- Each scene must have:
 - id: number (1..5)
 - subTitle: string, <= 10 words.
 - Must follow this exact format: "SceneX: subtitle"
 - text: An array of 1 to 2 strings, aim for 2 paragraphs per scene to ensure depth. Only use 1 paragraph if the topic is exceptionally concise.
 - Total word count per scene MUST be between 75 and 95 words (be verbose).
- Style: popular science + storytelling, clear and accessible.
- Avoid: first-person ("I/we"), rhetorical questions, lists/bullets, and value judgments.

Format Template:
{
  "mainTitle": "string",
  "scenes": [
    {
      "id": 1,
      "subTitle": "string",
      "text": ["string"]
    },
    {
      "id": 2,
      "subTitle": "string",
      "text": ["string"]
    }
    // ... exactly 5 scenes total
  ]
}

Output MUST be valid JSON parsable by JSON.parse.
`.trim();

  const user = `
Instruction: ${instruction || "(empty)"}

`.trim();

  const req = ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 0.6,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: `SYSTEM:\n${system}\n\nUSER:\n${user}\n\nReturn ONLY valid JSON.` },
        ],
      },
    ],
  });

  const resp = await withTimeout(req, 20000);

  // Gemini 返回值不是 choices/message；一般直接 resp.text
  const content = (resp.text ?? "").trim() || "{}";

  console.log("LLM response:", content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    let fixed = jsonrepair(content);

    // 修复：在 scenes 数组中，如果发现孤立的 "id": N，在之前补 {
    fixed = fixed.replace(
      /("text":\s*\[[^\]]*\])\s*,\s*"id":/g,
      '$1\n},\n{\n"id":'
    );

    parsed = JSON.parse(fixed);
  }
  return DraftSchema.parse(parsed);
}

export async function generateDraftImage(args: {
  mainTitle: string;
  subTitle: string;
  text: string[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  // 使用 v1beta 路径下的 predict 接口
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;

  // 🌟 优化点：移除 "1:1" 文本描述，强化色调和风格关键词
  const prompt = `A professional square-framed illustration in light sepia tones, low saturation, story hand-sketched style, rough artistic lines, vintage paper texture. No text.
  Scene: ${args.subTitle}. 
  Context: ${args.text.join(" ")}. 
  [Strictly no text, no numbers, no labels, no watermarks, no 1:1 text]`.trim();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1", // 这里已指定比例，无需在 prompt 中写 "1:1"
          outputMimeType: "image/png",
        },
      }),
    });

    const data = await response.json();

    // 1. 检查 API 错误
    if (data.error) {
      throw new Error(`Google API Error: ${data.error.message}`);
    }

    // 2. 检查安全过滤或空返回
    if (!data.predictions || data.predictions.length === 0) {
      console.error("Possible safety filter block or empty prediction:", data);
      throw new Error("Image generation was blocked or returned no data.");
    }

    // 3. 处理 Imagen 4 的 Base64 返回格式
    // 兼容 bytesBase64Encoded 字段或直接返回字符串的情况
    const b64Data = data.predictions[0].bytesBase64Encoded || data.predictions[0];

    if (!b64Data) {
      throw new Error("Failed to extract Base64 data from predictions.");
    }

    return `data:image/png;base64,${b64Data}`;
  } catch (error) {
    console.error("Imagen 4 Generation Error:", error);
    throw error;
  }
}

export async function generateSceneAlternativesFromLLM(args: {
  mainTitle: string;
  subTitle: string;   // 用当前 scene subtitle 当上下文
  text: string[];     // 当前 scene 原文
}): Promise<SceneAlternatives> {
  const system = `
You are given factual content about one scene.

Generate TWO entirely new versions from clearly different narrative angles.

Return STRICT JSON with EXACT keys: conversational, professional.
Each must contain key: text (array of 1-3 paragraphs). No other keys. No markdown. No commentary.

CRITICAL:
- Do NOT paraphrase the original sentence-by-sentence.
- Do NOT preserve the original structure.
- Reframe the content from new perspectives.
- You may change the order of ideas.
- You may introduce narrative framing (e.g., historical impact, human motivation, technological shift).
- The two versions must feel like independently written texts.

Constraints:
- Language: English only.
- conversational: friendly, simple, approachable, but still accurate.
- professional: formal, concise, neutral tone.
- Avoid lists/bullets.
- Total per version: about 75-95 words (across its paragraphs).
Output MUST be valid JSON parsable by JSON.parse.
`.trim();

  const user = `
Main title: ${args.mainTitle}
Scene subtitle (keep unchanged): ${args.subTitle}

Original scene text:
${args.text.join("\n\n")}
`.trim();

  const req = ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `SYSTEM:\n${system}\n\nUSER:\n${user}\n\nReturn ONLY valid JSON.`,
          },
        ],
      },
    ],
  });

  const resp = await withTimeout(req, 20000, "alt_text_timeout");

  // ✅ Gemini 的返回：resp.text
  const content = (resp.text ?? "").trim() || "{}";

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // 打印出来方便你看 Gemini 是否夹了多余文本
    console.log("Gemini non-JSON raw:", content);
    throw new Error("LLM returned non-JSON for alternatives");
  }


  return SceneAlternativesSchema.parse(parsed);
}

export async function generateAnnotationsFromLLM(args: {
  text: string[] | string;
}): Promise<Annotations> {
  const paragraphs = Array.isArray(args.text)
    ? args.text.map((p) => String(p ?? ""))
    : String(args.text || "").split(/\n\s*\n/).filter(Boolean);

  const system = `
You extract annotations for EACH paragraph as STRICT JSON only.

Return JSON with EXACT key:
- paragraphs

paragraphs is an array with the SAME length as the input paragraphs.
Each paragraphs[i] MUST contain EXACT keys:
- keyWords: string[] (0-2 items)
- keySentences: string[] (0-1 item)

Rules:
- Language: English only.
- Treat each paragraph independently.
- For EACH paragraph:
  - keyWords: pick 0-2 short terms/phrases (<= 3 words each) that APPEAR in that paragraph.
  - keySentences: pick at most ONE sentence excerpt copied EXACTLY from that paragraph.
    Must be a contiguous substring with identical punctuation/spaces.
- Do NOT invent facts. Do NOT paraphrase.
- If no good key sentence exists, return [] for keySentences.

Output MUST be valid JSON parsable by JSON.parse. No markdown.
`.trim();

  const user = `
Paragraphs:
${paragraphs.map((p, i) => `P${i + 1}: ${p}`).join("\n\n")}
`.trim();

  const req = ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `SYSTEM:\n${system}\n\nUSER:\n${user}\n\nReturn ONLY valid JSON.`,
          },
        ],
      },
    ],
  });

  const resp = await withTimeout(req, 15000, "annotation_timeout");
  const content = (resp.text ?? "").trim() || "{}";

  console.log("LLM annotation response:", content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.log("Gemini non-JSON raw:", content);
    throw new Error("LLM returned non-JSON for annotations");
  }

  const ann = AnnotationsSchema.parse(parsed);

  // ✅ 防御：长度不一致时，强制补齐/截断
  if (ann.paragraphs.length !== paragraphs.length) {
    const fixed = paragraphs.map(
      (_, i) => ann.paragraphs[i] ?? { keyWords: [], keySentences: [] }
    );
    return { paragraphs: fixed };
  }

  return ann;
}

export async function generateWhyHereFromLLM(args: {
  searchTerm: string;
  sceneText: string[] | string;
}): Promise<WhyHere> {
  const paragraphs = Array.isArray(args.sceneText)
    ? args.sceneText.map((p) => String(p ?? ""))
    : String(args.sceneText || "").split(/\n\s*\n/).filter(Boolean);

  const system = `
You explain why a given search term appears in the scene text.
Return STRICT JSON only with EXACT key: explanation.
Constraints:
- English only.
- within 80 words.
- Explain the role/purpose in THIS scene (definition, example, evidence, transition, etc.).
- Do NOT add new facts beyond the text.
- No markdown.
`.trim();

  const user = `
Search term: ${String(args.searchTerm || "").trim()}

Scene text:
${paragraphs.join("\n\n")}
`.trim();

  const req = ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 0.3,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `SYSTEM:\n${system}\n\nUSER:\n${user}\n\nReturn ONLY valid JSON.`,
          },
        ],
      },
    ],
  });

  const resp = await withTimeout(req, 15000, "why_here_timeout");
  const content = (resp.text ?? "").trim() || "{}";

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.log("Gemini non-JSON raw:", content);
    throw new Error("LLM returned non-JSON for whyHere");
  }

  return WhyHereSchema.parse(parsed);
}

export async function generateSceneRationaleFromLLM(args: {
  mainTitle: string;
  subTitle: string;
  text: string[] | string;
}): Promise<SceneRationale> {
  const paragraphs = Array.isArray(args.text)
    ? args.text.map((p) => String(p ?? ""))
    : String(args.text || "").split(/\n\s*\n/).filter(Boolean);

  const system = `
You explain the writing rationale for ONE scene as STRICT JSON only.
Return JSON with EXACT key: rationale. No other keys. No markdown.

What to include in rationale (1 sentences, <= 25 words):
- Why this scene exists (writing intent / goal)
- What role it plays in the overall script (setup, context, transition, evidence, payoff, etc.)
- Stay grounded in the given text; do NOT add new facts.
Language: English only.
`.trim();

  const user = `
Main title: ${String(args.mainTitle || "").trim()}
Scene subtitle: ${String(args.subTitle || "").trim()}

Scene text:
${paragraphs.join("\n\n")}
`.trim();

  const req = ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 0.3,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `SYSTEM:\n${system}\n\nUSER:\n${user}\n\nReturn ONLY valid JSON.`,
          },
        ],
      },
    ],
  });

  const resp = await withTimeout(req, 15000, "rationale_timeout");
  const content = (resp.text ?? "").trim() || "{}";

  console.log("LLM rationale response:", content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.log("Gemini non-JSON raw:", content);
    throw new Error("LLM returned non-JSON for rationale");
  }

  return SceneRationaleSchema.parse(parsed);
}

export async function generateSentenceIssuesFromLLM(args: {
  sceneText: string[] | string;
}): Promise<SentenceIssues> {
  const paragraphs = Array.isArray(args.sceneText)
    ? args.sceneText.map((p) => String(p ?? ""))
    : String(args.sceneText || "").split(/\n\s*\n/).filter(Boolean);

  const fullText = paragraphs.join("\n\n");

  const system = `
You identify EXACTLY ONE sentence in a scene that may need revision, as STRICT JSON only.

Return JSON with EXACT key:
- issues

issues is an array with EXACT length 1, containing ONE object with EXACT keys:
- id: string ("s1")
- sentence: string
- issue: string

Rules:
- Language: English only.
- Select the SINGLE sentence that is MOST likely to need revision (choose the worst one). (examples: overly generic/neutral phrasing, repetitive/templated AI style, ambiguity, missing specificity, claims that should be verified, unclear causality, etc.).
- IMPORTANT: sentence MUST be copied EXACTLY from the provided scene text, including punctuation and spacing. Do NOT paraphrase.
- issue MUST describe the problem in <= 15 words.
- If truly nothing seems problematic, return {"issues": []}. (Only in that case.)
- No markdown. Output MUST be valid JSON parsable by JSON.parse.
`.trim();

  const user = `
Scene text:
${fullText}
`.trim();

  const req = ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `SYSTEM:\n${system}\n\nUSER:\n${user}\n\nReturn ONLY valid JSON.`,
          },
        ],
      },
    ],
  });

  const resp = await withTimeout(req, 15000, "sentence_issues_timeout");
  const content = (resp.text ?? "").trim() || "{}";

  console.log("LLM sentence issues response:", content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.log("Gemini non-JSON raw:", content);
    throw new Error("LLM returned non-JSON for sentence issues");
  }

  // 1) schema validate
  const data = SentenceIssuesSchema.parse(parsed);

  // 2) defensive fixes to help your frontend matching:
  //    - ensure sentence exists in fullText
  //    - force ids to "s1","s2" order
  const filtered = (data.issues ?? []).filter((it) => {
    const s = String(it.sentence ?? "").trim();
    return s.length > 0 && fullText.includes(s);
  });

  const normalized = filtered.slice(0, 1).map((it, idx) => ({
    id: `s${idx + 1}`,
    sentence: it.sentence,
    issue: it.issue,
  }));

  return { issues: normalized };
}

export async function generateIssueSuggestionFromLLM(args: {
  sentence: string;
  issue: string;
  prevSuggestion?: string; // optional: used to force a different angle
}): Promise<IssueSuggestion> {
  const sentence = String(args.sentence ?? "").trim();
  const issue = String(args.issue ?? "").trim();
  const prev = String(args.prevSuggestion ?? "").trim();

  if (!sentence || !issue) {
    return { suggestion: "" };
  }

  const system = `
You write ONE revision suggestion for a sentence as STRICT JSON only.
Return JSON with EXACT key: suggestion. No other keys. No markdown.

Constraints:
- Language: English only.
- suggestion: <= 50 words.
- Give an actionable rewrite strategy (not just "be clearer").
- Do NOT add new facts not implied by the sentence/issue.
- Prefer concrete edits: specify what to add/remove/rephrase.

If a previous suggestion is provided, your new suggestion MUST take a DIFFERENT angle:
- use a different rewrite strategy or emphasis
- avoid repeating the same phrasing
`.trim();

  const user = `
Sentence:
${sentence}

Issue (<=15 words):
${issue}

Previous suggestion (if any):
${prev || "(none)"}

Now output a new suggestion as JSON:
`.trim();

  const req = ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 0.7,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `SYSTEM:\n${system}\n\nUSER:\n${user}\n\nReturn ONLY valid JSON.`,
          },
        ],
      },
    ],
  });

  const resp = await withTimeout(req, 15000, "issue_suggestion_timeout");
  const content = (resp.text ?? "").trim() || "{}";

  console.log("LLM issue suggestion response:", content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.log("Gemini non-JSON raw:", content);
    throw new Error("LLM returned non-JSON for issue suggestion");
  }

  const out = IssueSuggestionSchema.parse(parsed);

  // 防御：硬截断，避免偶发超长
  const words = out.suggestion.trim().split(/\s+/).filter(Boolean);
  if (words.length > 60) {
    out.suggestion = words.slice(0, 60).join(" ");
  }

  return out;
}

export async function generateChatReplyFromLLM2(args: {
  userPrompt: string;   // 用户输入的问题
  sceneText?: string[]; // 可选：当前 scene 全文（当作上下文）
}): Promise<{ answer: string }> {
  const systemPrompt = `
You are an AI assistant inside a script editor.

GOAL:
Help the user by answering questions or giving suggestions related to the CURRENT scene text when provided.

RULES:
- If scene text is provided, use it as the foundation.
- You ARE allowed to expand, elaborate, or make the scene more conversational or vivid,
  as long as it remains consistent with the original meaning.
- Do NOT introduce unrelated topics.
- Keep responses clear and useful.
- Return STRICT JSON only.

STRICT RULES:
- Return STRICT JSON only. No markdown. No extra text.

JSON format:
{ "answer": string }
`.trim();

  const prompt = (args.userPrompt ?? "").trim();
  const scene = Array.isArray(args.sceneText) ? args.sceneText : [];
  const scenePlain = scene.join("\n");

  if (!prompt) return { answer: "Please type a message." };

  const userPromptFormatted = `
Scene (optional context):
${scenePlain || "(empty)"}

User message:
"${prompt}"
`.trim();

  const req = ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 0.5,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPromptFormatted}\n\nReturn ONLY valid JSON.`,
          },
        ],
      },
    ],
  });

  const resp = await req;
  const raw = (resp.text ?? "").trim();

  try {
    const parsed = JSON.parse(raw);
    const answer = String(parsed.answer ?? "").trim();
    return { answer: answer || "No response." };
  } catch {
    // 兜底：模型没按 JSON 输出时，直接当文本回传
    return { answer: raw || "No response." };
  }
}

export async function generateSceneImageBase64(args: {
  mainTitle: string;
  subTitle: string;
  text: string[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  // 注意：predict 接口通常使用 v1beta 路径
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;

  const prompt = `A professional square-framed illustration in light sepia tones, low saturation, story hand-sketched style. Rough lines. No text. Scene: ${args.subTitle}. Context: ${args.text.join(" ")}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1",
          outputMimeType: "image/png",
        },
      }),
    });

    const data = await response.json();

    // 1. 检查 API 是否返回了错误对象
    if (data.error) {
      throw new Error(`Google API Error: ${data.error.message}`);
    }

    // 2. Imagen 4 的 predictions 有时会因为安全原因返回空数组
    if (!data.predictions || data.predictions.length === 0) {
      console.error("Possible safety filter block:", data);
      throw new Error("Image generation was blocked by safety filters.");
    }

    // Imagen 4 的返回结构通常在 predictions 数组里
    const b64Data = data.predictions[0].bytesBase64Encoded || data.predictions[0];

    return `data:image/png;base64,${b64Data}`;
  } catch (error) {
    console.error("Imagen 4 Fetch Error:", error);
    throw error;
  }
}

