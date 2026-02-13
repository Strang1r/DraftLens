import { Router } from "express";
import { generateDraftFromLLM, generateSceneImageBase64 } from "../ai/llm";
import { withTimeout } from "../ai/llm";

console.log("🔥 USING SCRIPT ROUTE FILE:", __filename);

const router = Router();

router.post("/generate", async (req, res) => {

  const { instruction, conditionId } = req.body ?? {};
  const safeInstruction = String(instruction ?? "").trim();

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

    // 需要图片就打开
    // const draft = await attachImages(draftRaw);
    const draft = draftRaw;

    return res.json({ draft });

  } catch (e: any) {
    console.error("LLM failed:", e?.message || e);
    return res.json({ draft: makeDraftFallback(), error: "llm_failed" });
  }
});


export default router;