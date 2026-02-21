import { Router } from "express";
import { generateDraftFromLLM, generateSceneImageBase64, generateSceneAlternativesFromLLM, generateWhyHereFromLLM, generateSceneRationaleFromLLM, generateSentenceIssuesFromLLM, generateIssueSuggestionFromLLM, generateChatReplyFromLLM, generateChatReplyFromLLM2 } from "../ai/llm";
import { withTimeout } from "../ai/llm";
import { generateAnnotationsFromLLM } from "../ai/llm";

console.log("🔥 USING SCRIPT ROUTE FILE:", __filename);

const router = Router();

router.post("/generate", async (req, res) => {

  const { instruction, conditionId } = req.body ?? {};
  const safeInstruction = String(instruction ?? "").trim();

  const cond = String(conditionId ?? "").trim(); // "1".."6"
  const needAnnotations = cond === "2";
  const needRationale = cond === "4";

  const makeDraftFallback = () => ({
    mainTitle: "THE ORIGINS OF THE INTERNET",
    scenes: [
      { id: 1, subTitle: `Scene1`, img: "/assets/1.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`, `ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 2, subTitle: `Scene2`, img: "/assets/2.png", text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 3, subTitle: `Scene3`, img: "/assets/3.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`] },
      { id: 4, subTitle: `Scene4`, img: "/assets/4.png", text: [`ARPANET introduced packet-based, decentralized data transmission, allowing information to travel along multiple paths and remain functional despite failures. Although limited in scale, these experiments established core networking principles that later enabled the Internet to expand beyond research and support global communication.`] },
      { id: 5, subTitle: `Scene5`, img: "/assets/5.png", text: [`Today’s Internet is widely seen as essential infrastructure, but it originated in a much narrower research context. Its early development was driven not by commercial demand, but by Cold War–era challenges in computing and communication. In the late 1960s, U.S. government-funded researchers created ARPANET to connect scarce computing resources across institutions.`] },
    ],
  });

  async function mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, idx: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let i = 0;

    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx], idx);
      }
    });

    await Promise.all(workers);
    return results;
  }

  const attachImages = async (draft: { mainTitle: string; scenes: any[] }) => {
    const scenesWithImgs = await mapLimit(draft.scenes, 1, async (s: any) => {
      try {
        const img = await withTimeout(
          generateSceneImageBase64({
            mainTitle: draft.mainTitle,
            subTitle: s.subTitle,
            text: s.text,
          }),
          60000,
          "image_timeout"
        );
        return { ...s, img };
      } catch (e: any) {
        console.warn("Image gen failed, fallback:", s.id, e?.message || e);
        return s; // 保持原 img
      }
    });

    return { ...draft, scenes: scenesWithImgs };
  };


  try {
    if (!safeInstruction) {
      return res.status(400).json({ error: "missing_instruction" });
    }

    // 永远单版本：你仍然可以把 conditionId 传给 LLM 用于不同 prompt/控制
    const draftRaw = await generateDraftFromLLM({
      instruction: safeInstruction,
    } as any);

    /* const scenesEnhanced = await Promise.all(
      draftRaw.scenes.map(async (scene: any) => {
        // 1) annotations（关键词/关键句）
        let annotations: any = {
          paragraphs: scene.text.map(() => ({ keyWords: [], keySentences: [] })),
        };
        try {
          annotations = await withTimeout(
            generateAnnotationsFromLLM({ text: scene.text }),
            15000,
            "annotation_timeout"
          );
        } catch (e: any) {
          console.warn("Annotation failed for scene:", scene.id, e?.message || e);
        }

        // 2) rationale
        let rationale = "";
        try {
          const out = await withTimeout(
            generateSceneRationaleFromLLM({
              mainTitle: draftRaw.mainTitle,
              subTitle: scene.subTitle,
              text: scene.text,
            }),
            15000,
            "rationale_timeout"
          );
          rationale = out.rationale || "";
        } catch (e: any) {
          console.warn("Rationale failed for scene:", scene.id, e?.message || e);
        }

        return { ...scene, annotations, rationale };
      })
    ); */

    const scenesEnhanced = await Promise.all(
      draftRaw.scenes.map(async (scene: any) => {
        // 默认：不生成
        let annotations: any = undefined;
        let rationale: string | undefined = undefined;

        // condition2 才生成 annotations
        if (needAnnotations) {
          annotations = {
            paragraphs: scene.text.map(() => ({ keyWords: [], keySentences: [] })),
          };
          try {
            annotations = await withTimeout(
              generateAnnotationsFromLLM({ text: scene.text }),
              15000,
              "annotation_timeout"
            );
          } catch (e: any) {
            console.warn("Annotation failed for scene:", scene.id, e?.message || e);
          }
        }

        // condition4 才生成 rationale
        if (needRationale) {
          rationale = "";
          try {
            const out = await withTimeout(
              generateSceneRationaleFromLLM({
                mainTitle: draftRaw.mainTitle,
                subTitle: scene.subTitle,
                text: scene.text,
              }),
              15000,
              "rationale_timeout"
            );
            rationale = out.rationale || "";
          } catch (e: any) {
            console.warn("Rationale failed for scene:", scene.id, e?.message || e);
          }
        }

        // 只在需要时才把字段挂回去（避免其它 condition 前端看到多余字段）
        return {
          ...scene,
          ...(needAnnotations ? { annotations } : {}),
          ...(needRationale ? { rationale } : {}),
        };
      })
    );
    // 需要图片就打开
    // const draft = await attachImages(draftRaw);
    // 3) 合并回 draft
    const draft = { ...draftRaw, scenes: scenesEnhanced };
    return res.json({ draft });
  } catch (e: any) {
    console.error("LLM failed:", e?.message || e);
    return res.json({ draft: makeDraftFallback(), error: "llm_failed" });
  }
});

router.post("/alternatives", async (req, res) => {
  const { mainTitle, subTitle, text, generateImages } = req.body ?? {};
  const safeMainTitle = String(mainTitle ?? "").trim();
  const safeSubTitle = String(subTitle ?? "").trim();
  const safeText: string[] = Array.isArray(text) ? text.map(String) : [];
  const wantImages = Boolean(generateImages);

  if (!safeMainTitle || !safeSubTitle || safeText.length === 0) {
    return res.status(400).json({ error: "missing_fields" });
  }

  try {
    // 1) 先让 LLM 生成两套文本（只要 text）
    const altTexts = await generateSceneAlternativesFromLLM({
      mainTitle: safeMainTitle,
      subTitle: safeSubTitle,
      text: safeText,
    });

    // 2) 再分别生成两张图（基于同一个 subTitle，但 text 不同）
    let conversationalImg = "/assets/4.png";
    let professionalImg = "/assets/5.png";

    if (wantImages) {
      conversationalImg = await withTimeout(
        generateSceneImageBase64({
          mainTitle: safeMainTitle,
          subTitle: safeSubTitle,
          text: altTexts.conversational.text,
        }),
        60000,
        "image_timeout_conversational"
      );

      professionalImg = await withTimeout(
        generateSceneImageBase64({
          mainTitle: safeMainTitle,
          subTitle: safeSubTitle,
          text: altTexts.professional.text,
        }),
        60000,
        "image_timeout_professional"
      );
    }

    // 3) 返回给前端：只给 text + img，不给 subtitle（subtitle 前端继续用当前 scene 的）
    return res.json({
      alternatives: [
        { id: "A", tone: "conversational", text: altTexts.conversational.text, img: conversationalImg },
        { id: "B", tone: "professional", text: altTexts.professional.text, img: professionalImg },
      ],
    });
  } catch (e: any) {
    console.error("alternatives failed:", e?.message || e);
    return res.status(500).json({ error: "alternatives_failed" });
  }
});

router.post("/why-here", async (req, res) => {
  const { searchTerm, sceneText } = req.body ?? {};
  const safeTerm = String(searchTerm ?? "").trim();
  const safeText: string[] = Array.isArray(sceneText) ? sceneText.map(String) : [];

  // 空搜索：直接返回空解释（前端就显示默认文案）
  if (!safeTerm) {
    return res.json({ explanation: "" });
  }

  // sceneText 最好传数组（你 scene.text 本来就是 string[]）
  if (safeText.length === 0) {
    return res.status(400).json({ error: "missing_sceneText", explanation: "" });
  }

  try {
    const out = await withTimeout(
      generateWhyHereFromLLM({ searchTerm: safeTerm, sceneText: safeText }),
      15000,
      "why_here_timeout"
    );
    return res.json(out); // { explanation }
  } catch (e: any) {
    console.error("why-here failed:", e?.message || e);
    return res.json({ explanation: "", error: "why_here_failed" });
  }
});

router.post("/issues", async (req, res) => {
  const { sceneText } = req.body ?? {};
  const safeText: string[] = Array.isArray(sceneText) ? sceneText.map(String) : [];

  if (safeText.length === 0) {
    return res.status(400).json({ error: "missing_sceneText", issues: [] });
  }

  try {
    const out = await withTimeout(
      generateSentenceIssuesFromLLM({ sceneText: safeText }),
      15000,
      "issues_timeout"
    );

    // out: { issues: [{id,sentence,issue}] }
    return res.json(out);
  } catch (e: any) {
    console.error("issues failed:", e?.message || e);
    return res.json({ issues: [], error: "issues_failed" });
  }
});

router.post("/issue-suggestion", async (req, res) => {
  const { sentence, issue, prevSuggestion } = req.body ?? {};

  const safeSentence = String(sentence ?? "").trim();
  const safeIssue = String(issue ?? "").trim();
  const safePrev = String(prevSuggestion ?? "").trim();

  if (!safeSentence || !safeIssue) {
    return res.status(400).json({ error: "missing_fields", suggestion: "" });
  }

  try {
    const out = await withTimeout(
      generateIssueSuggestionFromLLM({
        sentence: safeSentence,
        issue: safeIssue,
        prevSuggestion: safePrev || undefined,
      }),
      15000,
      "issue_suggestion_timeout"
    );

    // out: { suggestion }
    return res.json(out);
  } catch (e: any) {
    console.error("issue-suggestion failed:", e?.message || e);
    return res.json({ suggestion: "", error: "issue_suggestion_failed" });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const { selectedText, userPrompt, sceneText } = req.body ?? {};

    // 基础校验（防止 undefined）
    const safeSelectedText = String(selectedText ?? "").trim();
    const safeUserPrompt = String(userPrompt ?? "").trim();
    const safeSceneText = Array.isArray(sceneText)
      ? sceneText.map((t) => String(t ?? ""))
      : [];

    // 如果没有选中文本，不允许改写
    if (!safeSelectedText) {
      return res.status(400).json({
        type: "refuse",
        answer: "Please select a sentence before asking for revision.",
        replacement: null,
      });
    }

    // 如果用户没输入内容
    if (!safeUserPrompt) {
      return res.status(400).json({
        type: "refuse",
        answer: "Please enter your request.",
        replacement: null,
      });
    }

    // 如果选中的文本不在当前 scene 里（安全限制）
    const sceneJoined = safeSceneText.join(" ");
    if (!sceneJoined.includes(safeSelectedText)) {
      return res.status(400).json({
        type: "refuse",
        answer: "The selected text does not match the current script.",
        replacement: null,
      });
    }

    // 统一一些判定工具
    const promptLower = safeUserPrompt.toLowerCase();

    // 1) 超短/确认类输入：永远不触发改写（解决 “1” 也改写）
    const isTiny = safeUserPrompt.length <= 2;
    const isConfirmLike = /^(1|ok|okay|yes|yep|sure|thanks|thank you|cool|got it|done)$/i.test(
      safeUserPrompt
    );
    if (isTiny || isConfirmLike) {
      return res.json({
        type: "qa",
        answer: "If you want a rewrite, tell me how (e.g., “make it shorter” / “more formal”).",
        replacement: null,
      });
    }

    // 2) 判断是不是“改写意图”
    //    - 包含 rewrite/rephrase 等关键词
    //    - 或包含 “make it + tone/shorter/clearer …”
    const rewriteKw = /\b(rewrite|rephrase|paraphrase|improve|polish|edit|revise|shorten|simplify|clarify|make it|make this|change this|fix)\b/i;
    const toneKw = /\b(formal|informal|professional|casual|friendly|confident|neutral|academic|persuasive|tone|voice)\b/i;

    const wantsRewrite =
      rewriteKw.test(promptLower) ||
      (/make (it|this)/i.test(promptLower) && (toneKw.test(promptLower) || /\bshorter|clearer|tighter\b/i.test(promptLower)));

    // 3) 如果是改写：必须选中文本
    if (wantsRewrite && !safeSelectedText) {
      return res.status(400).json({
        type: "refuse",
        answer: "Please select a sentence before asking for revision.",
        replacement: null,
      });
    }

    // 调用 LLM
    const result = await generateChatReplyFromLLM({
      selectedText: safeSelectedText,
      userPrompt: safeUserPrompt,
      sceneText: safeSceneText,
    });

    return res.json(result);
  } catch (error: any) {
    console.error("Chat route error:", error);

    return res.status(500).json({
      type: "refuse",
      answer: "The AI assistant is temporarily unavailable.",
      replacement: null,
    });
  }
});

router.post("/chat2", async (req, res) => {
  try {
    const { userPrompt, sceneText } = req.body ?? {};

    // 基础校验
    const safeUserPrompt = String(userPrompt ?? "").trim();
    const safeSceneText = Array.isArray(sceneText)
      ? sceneText.map((t) => String(t ?? ""))
      : [];

    // 用户没输入内容
    if (!safeUserPrompt) {
      return res.status(400).json({
        answer: "Please enter your request.",
      });
    }

    // 可选：超短/确认类输入的快速提示（不想要可删）
    /* const isTiny = safeUserPrompt.length <= 2;
    const isConfirmLike =
      /^(1|ok|okay|yes|yep|sure|thanks|thank you|cool|got it|done)$/i.test(
        safeUserPrompt
      );

    if (isTiny || isConfirmLike) {
      return res.json({
        answer:
          "Tell me what you’d like help with (e.g., clarity, tone, structure, examples).",
      });
    } */

    // 调用 LLM（纯聊天）
    const result = await generateChatReplyFromLLM2({
      userPrompt: safeUserPrompt,
      sceneText: safeSceneText, // 不想给上下文就可以不传
    });

    return res.json(result); // { answer }
  } catch (error: any) {
    console.error("Chat route error:", error);

    return res.status(500).json({
      answer: "The AI assistant is temporarily unavailable.",
    });
  }
});

export default router;
