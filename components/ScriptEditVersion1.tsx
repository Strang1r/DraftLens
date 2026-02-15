import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import logoSvg from '../src/assets/logo.svg'
import { useNavigate, useParams } from 'react-router-dom';
import './ScriptEdit.scss'
import AlternativePop from './AlternativePop';
import Spinner from './Spinner';

type Scene = {
  id: number | string;
  subTitle: string;
  img: string;
  text: string[];
};

type Draft = {
  mainTitle: string;
  scenes: Scene[];
};

type EditProps = {
  showSearch?: boolean;
  showWhyHere?: boolean;
  showAlternative?: boolean;
  showAnnotation?: boolean; // condition2 专用
};

type AltScene = {
  id: string;
  text: string[];
  img: string;
  // 后端如果返回 tone 也可以收着
  tone?: "conversational" | "professional";
};

// condition2 标注
type TextRange = { start: number; end: number };
type SentencePick = { p: number; s: number };

type Annotation = {
  sceneId: string;
  keyWords: string[];
  keySentencePicks: SentencePick[];
  keySentenceRanges: TextRange[];
  baseText: string; // ✅ ranges 对应的文本基准（normalized）
};


const Edit1 = (props: EditProps) => {
  const navigate = useNavigate();
  const { sceneId } = useParams();

  // ✅ 统一从 draft 读
  const draft: Draft | null = useMemo(() => {
    const raw = sessionStorage.getItem("draft");
    return raw ? JSON.parse(raw) : null;
  }, []);

  const scenes: Scene[] = draft?.scenes ?? [];
  const initialTitle = draft?.mainTitle ?? "HISTORY";

  // ✅ 初始定位到点击的那个 scene
  const initialIndex = useMemo(() => {
    const idx = scenes.findIndex(s => String(s.id) === String(sceneId));
    return idx >= 0 ? idx : 0;
  }, [scenes, sceneId]);

  // scene index（可前后切换）
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number>(initialIndex);

  // 当用户从 Final 点了另一个 scene 进来，sceneId 变了时，重新定位
  useEffect(() => {
    setCurrentSceneIndex(initialIndex);
  }, [initialIndex]);

  const currentScene = scenes[currentSceneIndex];
  const isFirst = currentSceneIndex === 0;
  const isLast = currentSceneIndex === scenes.length - 1;

  // 确认弹框
  const [showConfirm, setShowConfirm] = useState(false);

  // 编辑状态：依旧是“全局数组”，支持切 scene
  const [editedMainTitle, setEditedMainTitle] = useState<string>(initialTitle);
  const [editedSubTitle, setEditedSubTitle] = useState<string[]>(
    () => scenes.map(s => s.subTitle)
  );
  const [editedText, setEditedText] = useState<string[][]>(
    () => scenes.map(s => [...s.text])
  );
  const [editedImg, setEditedImg] = useState<string[]>(
    () => scenes.map(s => s.img)
  );

  // 如果 draft/scenes 为空，直接回 final（避免报错）
  useEffect(() => {
    if (!draft || scenes.length === 0) navigate("/final");
  }, [draft, scenes.length, navigate]);

  // ✅ 保存回 draft（唯一真相）
  const saveDraftToStorage = (nextMain: string, nextSub: string[], nextText: string[][], nextImg: string[]) => {
    const raw = sessionStorage.getItem("draft");
    if (!raw) return;

    const d: Draft = JSON.parse(raw);
    d.mainTitle = nextMain;

    d.scenes = d.scenes.map((s, i) => ({
      ...s,
      subTitle: nextSub[i] ?? s.subTitle,
      text: nextText[i] ?? s.text,
      img: nextImg[i] ?? s.img,
    }));

    sessionStorage.setItem("draft", JSON.stringify(d));
  };


  // prev / next
  const goPrev = () => {
    if (isFirst) return;
    // 可选：切换前先存一次（避免用户没 blur 就切走）
    saveDraftToStorage(editedMainTitle, editedSubTitle, editedText, editedImg);
    setCurrentSceneIndex(v => Math.max(0, v - 1));
  };

  const goNext = () => {
    if (isLast) {
      setShowConfirm(true);
      return;
    }
    saveDraftToStorage(editedMainTitle, editedSubTitle, editedText, editedImg);
    setCurrentSceneIndex(v => Math.min(scenes.length - 1, v + 1));
  };

  // subtitle blur
  const onEditSubTitle = (value: string) => {
    setEditedSubTitle(prev => {
      const copy = [...prev];
      copy[currentSceneIndex] = value;
      saveDraftToStorage(editedMainTitle, copy, editedText, editedImg);
      return copy;
    });
  };

  // mainTitle blur
  const onEditMainTitle = (value: string) => {
    setEditedMainTitle(value);
    saveDraftToStorage(value, editedSubTitle, editedText, editedImg);
  };

  // contentEditable text：保持你原来的方案
  const mainTitleRef = useRef<HTMLHeadingElement | null>(null);
  const scriptRef = useRef<HTMLDivElement | null>(null);

  /* useEffect(() => {
    const el = scriptRef.current;
    if (!el) return;
    const text = (editedText[currentSceneIndex] || []).join("\n");
    if (el.innerText !== text) el.innerText = text;
  }, [currentSceneIndex, editedText]); */

  useLayoutEffect(() => {
    const el = scriptRef.current;
    if (!el) return;

    // 当前 scene 的真实文本
    const t = normalizeText(
      (editedText[currentSceneIndex] ?? []).join("\n")
    );

    // 1️⃣ 先把 DOM 强制同步为唯一真相
    if (normalizeText(el.textContent ?? "") !== t) {
      el.textContent = t;
    }

    // 2️⃣ 同步 liveText + prev
    setLiveText(t);
    prevTextRef.current = t;

    // 3️⃣ 清空旧 annotation（非常关键）
    setAnnotation(null);

  }, [currentSceneIndex]);

  const [isGenerating, setIsGenerating] = useState(false);

  if (!currentScene) return null;

  // why here
  const [showWhyHereState, setShowWhyHereState] = useState(false);

  // 弹框动画
  const [modalOpenClass, setModalOpenClass] = useState(false);

  // Alternative
  const [showAlternativeState, setShowAlternativeState] = useState(false);

  useEffect(() => {
    if (showConfirm) {
      setModalOpenClass(false);
      requestAnimationFrame(() => setModalOpenClass(true));
    }
    else if (showAlternativeState) {
      setModalOpenClass(false);
      requestAnimationFrame(() => setModalOpenClass(true));
    }
    else {
      setModalOpenClass(false);
    }
  }, [showConfirm, showAlternativeState]);

  // 替换“当前scene”的文本（不动图）
  const handleReplaceText = (alt: { text: string[] }) => {
    const nextSub = [...editedSubTitle]; // 不改subtitle也行（那就不赋值）
    const nextText = editedText.map(arr => [...arr]);
    const nextImg = [...editedImg];

    nextText[currentSceneIndex] = [...alt.text];

    setEditedText(nextText);
    setEditedImg(nextImg);

    saveDraftToStorage(editedMainTitle, nextSub, nextText, nextImg);
    setShowAlternativeState(false);
  };


  // 替换“当前scene”的文本 + 图片
  const handleReplaceAll = (alt: { text: string[]; img: string }) => {
    const nextSub = [...editedSubTitle];
    const nextText = editedText.map(arr => [...arr]);
    const nextImg = [...editedImg];

    nextText[currentSceneIndex] = [...alt.text];
    nextImg[currentSceneIndex] = alt.img;

    setEditedText(nextText);
    setEditedImg(nextImg);

    saveDraftToStorage(editedMainTitle, nextSub, nextText, nextImg);
    setShowAlternativeState(false);
  };

  // 调用后端接口获取替换选项（文本 + 图片）
  const [alternativeScene, setAlternativeScene] = useState<AltScene[]>([]);
  const [altLoading, setAltLoading] = useState(false);
  const [altError, setAltError] = useState<string | null>(null);


  const placeholderAlternatives: AltScene[] = [
    {
      id: "1",
      tone: "conversational",
      img: "/assets/4.png",
      text: [
        "Placeholder conversational version for this scene.",
        "It will be replaced once the backend is available.",
      ],
    },
    {
      id: "2",
      tone: "professional",
      img: "/assets/5.png",
      text: [
        "Placeholder professional version for this scene.",
        "It will be replaced once the backend is available.",
      ],
    },
  ];

  const fetchAlternatives = async () => {
    setAltLoading(true);
    setAltError(null);

    try {
      const res = await fetch("http://localhost:3001/api/script/alternatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainTitle: editedMainTitle,
          subTitle: editedSubTitle[currentSceneIndex],
          text: editedText[currentSceneIndex],
          generateImages: false, // 先只要文本，图等后续再加（避免接口超时）
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // 期待后端返回：{ alternatives: [{id,tone,text,img}, ...] }
      const normalizeTone = (t: any): AltScene["tone"] =>
        t === "conversational" || t === "professional" ? t : undefined;

      const alts: AltScene[] = (data.alternatives ?? []).map(
        (a: any, idx: number) => ({
          id: String(a.id ?? idx + 1),
          tone: normalizeTone(a.tone),
          text: Array.isArray(a.text) ? a.text : [],
          img: String(a.img ?? ""),
        })
      );

      setAlternativeScene(alts);
      return alts;
    } catch (e: any) {
      setAltError(e?.message ?? "Failed to load alternatives");
      setAlternativeScene(placeholderAlternatives);
      return placeholderAlternatives;
    } finally {
      setAltLoading(false);
    }
  };


  useEffect(() => {
    setAlternativeScene([]);
    setAltError(null);
  }, [currentSceneIndex]);

  // 当前subtitle
  const currentSubTitle = editedSubTitle[currentSceneIndex];

  // 打开替换选项：先从缓存拿，有就用；没有就调接口，拿到后顺便存缓存
  const altCacheRef = useRef<Record<string, AltScene[]>>({});
  const openAlternative = () => {
    setShowAlternativeState(true);

    const key = String(currentScene.id);
    const cached = altCacheRef.current[key];

    if (cached?.length) {
      setAlternativeScene(cached);
      setAltLoading(false);
      setAltError(null);
      return;
    }

    fetchAlternatives().then((alts) => {
      if (alts?.length) altCacheRef.current[key] = alts;
    });
  };

  // 重新生成替换选项：直接调接口，拿到后更新缓存
  const regenerateAlternatives = () => {
    if (altLoading) return;
    const key = String(currentScene.id);
    fetchAlternatives().then((alts) => {
      if (alts?.length) altCacheRef.current[key] = alts; // 覆盖缓存
    });
  };

  // condition2 标注数据
  const [liveText, setLiveText] = useState("");
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const prevTextRef = useRef("");

  const sceneIdStr = String(currentScene?.id ?? "");

  // --- sessionStorage ---
  const ANN_KEY = "draftlens_condition2_ann_v1";

  function loadAnnMap(): Record<string, Annotation> {
    try {
      return JSON.parse(sessionStorage.getItem(ANN_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function loadAnn(sceneId: string): Annotation | null {
    const map = loadAnnMap();
    return map[sceneId] ?? null;
  }
  function saveAnn(sceneId: string, ann: Annotation) {
    const map = loadAnnMap();
    map[sceneId] = ann;
    sessionStorage.setItem(ANN_KEY, JSON.stringify(map));
  }

  // --- text normalize (must be single truth) ---
  function normalizeText(s: string) {
    return (s ?? "")
      .replace(/\r/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  // --- helpers: keywords ranges ---
  function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function findKeywordRanges(text: string, keywords: string[]): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    const sorted = [...(keywords ?? [])].filter(Boolean).sort((a, b) => b.length - a.length);
    for (const kw of sorted) {
      const re = new RegExp(escapeRegExp(kw), "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        ranges.push([m.index, m.index + m[0].length]);
      }
    }
    return ranges;
  }

  // --- helpers: offsets -> DOM Range ---
  function getTextNodes(root: Node): Text[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);
    return nodes;
  }
  function resolveOffset(textNodes: Text[], globalOffset: number) {
    let offset = globalOffset;
    for (const tn of textNodes) {
      const len = tn.nodeValue?.length ?? 0;
      if (offset <= len) return { node: tn, offset };
      offset -= len;
    }
    const last = textNodes[textNodes.length - 1];
    return { node: last, offset: last?.nodeValue?.length ?? 0 };
  }
  function makeDomRange(rootEl: HTMLElement, start: number, end: number): Range | null {
    const textNodes = getTextNodes(rootEl);
    if (!textNodes.length) return null;

    const s = resolveOffset(textNodes, start);
    const e = resolveOffset(textNodes, end);

    const r = document.createRange();
    r.setStart(s.node, s.offset);
    r.setEnd(e.node, e.offset);
    return r;
  }

  // --- helpers: diff + remove touched sentences ---
  function computeSimpleDiff(prev: string, next: string): {
    pos: number;
    removedLen: number;
    insertedLen: number;
    delta: number;
  } | null {
    if (prev === next) return null;

    let start = 0;
    const minLen = Math.min(prev.length, next.length);
    while (start < minLen && prev[start] === next[start]) start++;

    let endPrev = prev.length - 1;
    let endNext = next.length - 1;
    while (endPrev >= start && endNext >= start && prev[endPrev] === next[endNext]) {
      endPrev--;
      endNext--;
    }

    const removedLen = Math.max(0, endPrev - start + 1);
    const insertedLen = Math.max(0, endNext - start + 1);
    const delta = insertedLen - removedLen;

    return { pos: start, removedLen, insertedLen, delta };
  }

  type TextRange = { start: number; end: number };

  function updateSentenceRangesOnEdit(
    ranges: TextRange[],
    edit: { pos: number; removedLen: number; delta: number }
  ): TextRange[] {
    const { pos, removedLen, delta } = edit;
    const editStart = pos;
    const editEndPrev = pos + removedLen; // 这段在“旧文本”里的结束位置

    return ranges
      .filter(r => {
        // 触碰/相交：删掉（下划线消失）
        const touched = editStart <= r.end && editEndPrev >= r.start;
        return !touched;
      })
      .map(r => {
        // 编辑在 range 前面：range 整体平移
        if (editEndPrev <= r.start) {
          return { start: r.start + delta, end: r.end + delta };
        }
        // 编辑在 range 后面：不动
        if (editStart >= r.end) return r;

        // （理论上相交已经被 filter 掉了，这里只是兜底）
        return r;
      })
      .map(r => {
        // 兜底：防负数/倒置
        const s = Math.max(0, r.start);
        const e = Math.max(s, r.end);
        return { start: s, end: e };
      });
  }

  // --- key: compute sentence ranges from picks ---
  function computeSentenceRangesFromPicks(text: string, picks: SentencePick[]): TextRange[] {
    if (!text) return [];

    const src = normalizeText(text);

    // protect abbreviations (length preserved by replacing "." with "·")
    const protectedText = src
      .replace(/\b([A-Za-z])\.([A-Za-z])\./g, "$1·$2·")
      .replace(/\be\.g\./gi, "e·g·")
      .replace(/\bi\.e\./gi, "i·e·")
      .replace(/\bMr\./g, "Mr·")
      .replace(/\bMrs\./g, "Mrs·")
      .replace(/\bDr\./g, "Dr·")
      .replace(/\bProf\./g, "Prof·")
      .replace(/\bInc\./g, "Inc·");

    // paragraphs: real starts in full text
    const paras: string[] = [];
    const paraStarts: number[] = [];
    for (const m of protectedText.matchAll(/[^\n]+/g)) {
      const seg = m[0];
      if (!seg.trim()) continue;
      paras.push(seg);
      paraStarts.push(m.index ?? 0);
    }

    const sentenceRegex = /[^.!?]+[.!?]?(\s+|$)/g;

    const ranges: TextRange[] = [];
    for (const pick of picks) {
      const pText = paras[pick.p];
      const base = paraStarts[pick.p];
      if (!pText || base == null) continue;

      const matches = [...pText.matchAll(sentenceRegex)];
      const mm = matches[pick.s];
      if (!mm) continue;

      const s0 = mm.index ?? 0;
      let e0 = s0 + mm[0].length;
      while (e0 > s0 && /\s/.test(pText[e0 - 1])) e0--;

      ranges.push({ start: base + s0, end: base + e0 });
    }

    return ranges;
  }

  // --- ① scene change: sync DOM + liveText + prev (layout effect) ---
  useLayoutEffect(() => {
    if (!props.showAnnotation) return;
    const el = scriptRef.current;
    if (!el) return;

    const t = normalizeText((editedText[currentSceneIndex] ?? []).join("\n"));

    // sync DOM text
    if (normalizeText(el.textContent ?? "") !== t) {
      el.textContent = t;
    }

    setLiveText(t);
    prevTextRef.current = t;

    // ✅ IMPORTANT: do NOT blindly setAnnotation(null) here.
    // We let the init effect below decide saved vs new.
  }, [props.showAnnotation, currentSceneIndex, editedText]);

  // --- ② init annotation on enter / scene change ---
  useEffect(() => {
    if (!props.showAnnotation) return;
    if (!sceneIdStr) return;

    const t = normalizeText((editedText[currentSceneIndex] ?? []).join("\n"));
    if (!t) return;

    const saved = loadAnn(sceneIdStr);
    if (saved && normalizeText(saved.baseText) === t) {
      setAnnotation(saved);
      return;
    }

    // TODO: you can customize by sceneIdStr if needed
    const keyWords = ["ARPANET", "global communication"];
    const keySentencePicks: SentencePick[] = [
      { p: 0, s: 0 }, // 第一段第1句
      { p: 1, s: 0 }, // 第二段第1句（想第二句就 s:1）
    ];

    const ranges = computeSentenceRangesFromPicks(t, keySentencePicks);

    const init: Annotation = {
      sceneId: sceneIdStr,
      keyWords,
      keySentencePicks,
      keySentenceRanges: ranges,
      baseText: t,
    };

    setAnnotation(init);
    saveAnn(sceneIdStr, init);
  }, [props.showAnnotation, sceneIdStr, currentSceneIndex, editedText]);

  // --- ③ render highlights ---
  useEffect(() => {
    const el = scriptRef.current;
    // @ts-ignore
    if (!window.CSS?.highlights) return;
    // @ts-ignore
    CSS.highlights.clear();

    if (!props.showAnnotation || !annotation || !el) return;

    const text = normalizeText(el.textContent ?? "");

    // keywords
    const kwPairs = findKeywordRanges(text, annotation.keyWords);

    // sentences (clamp)
    const sentPairs: Array<[number, number]> = annotation.keySentenceRanges.map(r => {
      const s = Math.max(0, Math.min(r.start, text.length));
      const e = Math.max(s, Math.min(r.end, text.length));
      return [s, e];
    });

    const kwDom: Range[] = [];
    for (const [s, e] of kwPairs) {
      const rr = makeDomRange(el, s, e);
      if (rr) kwDom.push(rr);
    }

    const sentDom: Range[] = [];
    for (const [s, e] of sentPairs) {
      const rr = makeDomRange(el, s, e);
      if (rr) sentDom.push(rr);
    }

    // @ts-ignore
    CSS.highlights.set("kw", new Highlight(...kwDom));
    // @ts-ignore
    CSS.highlights.set("sent", new Highlight(...sentDom));
  }, [props.showAnnotation, annotation, currentSceneIndex]);


  return (
    <div className="edit1BackGround">
      <div className='logo'>
        <img src={logoSvg} alt="" />
      </div>
      <div className='paper'>
        <div className='imgArea'>
          <div className='sceneOptions'>
            <div className='sceneImg' key={currentSceneIndex}>
              <img src={editedImg[currentSceneIndex]} alt="" />
            </div>
            <div className='regenerateBtn'>
              <h5>Regenerate</h5>
            </div>
          </div>
        </div>
        <div className='textArea'>
          <div className='sceneCount'>
            <p>{scenes.length} Scenes</p>
          </div>
          <div className='title'>
            <h3
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onEditMainTitle(e.currentTarget.textContent ?? "")}
              ref={mainTitleRef}
            >
              {editedMainTitle}
            </h3>
          </div>
          <div className='subTitle' key={currentSceneIndex}>
            <h4
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onEditSubTitle(e.currentTarget.textContent ?? "")}
            >
              {editedSubTitle[currentSceneIndex]}
            </h4>
          </div>
          {/* condition2 annotation */}
          {props.showAnnotation && (
            <div className='annotation'>
              <div className='annotation1-1'></div>
              <div className='annotation1-2'>Key Words</div>
              <div className='annotation2-1'></div>
              <div className='annotation2-2'>Key Sentences</div>
            </div>
          )}
          {/* condition3 searchBar */}
          {props.showSearch && (
            <div className="searchBar">
              <input
                type="text"
                placeholder="Search in script..."
                onKeyDown={
                  (e) => {
                    if (e.key === "Enter") {
                      setShowWhyHereState(true)
                    }
                  }
                }
              />
              <div
                className='searchButton'
                onClick={() => setShowWhyHereState(true)}
              ></div>
            </div>
          )}
          <div className='script'>
            {props.showAnnotation ? (
              <div
                className="scriptText"
                key={currentSceneIndex}
                contentEditable
                suppressContentEditableWarning
                ref={scriptRef}
                onInput={(e) => {
                  const next = normalizeText(e.currentTarget.textContent || "");
                  const prev = prevTextRef.current;

                  setLiveText(next);

                  setAnnotation(prevAnn => {
                    if (!prevAnn) return prevAnn;

                    const diff = computeSimpleDiff(prev, next);
                    if (!diff) return prevAnn;

                    const updated: Annotation = {
                      ...prevAnn,
                      keySentenceRanges: updateSentenceRangesOnEdit(prevAnn.keySentenceRanges, diff),
                      // 关键词如果你也是用“动态正则匹配”，不需要存 ranges；每次渲染会重新 findKeywordRanges
                    };

                    saveAnn(updated.sceneId, updated); // 持久化：刷新/回来一致
                    return updated;
                  });

                  prevTextRef.current = next;
                }}
                onBlur={(e) => {
                  const raw = (e.currentTarget.innerText || "").replace(/\r/g, "");
                  let lines = raw.split("\n");
                  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

                  setEditedText(prev => {
                    const copy = prev.map(arr => [...arr]);
                    copy[currentSceneIndex] = lines;
                    saveDraftToStorage(editedMainTitle, editedSubTitle, copy, editedImg);
                    return copy;
                  });
                }}
              />
            ) : (
              <div
                className="scriptText"
                key={currentSceneIndex}
                contentEditable
                suppressContentEditableWarning
                ref={scriptRef}
                onBlur={(e) => {
                  const raw = (e.currentTarget.innerText || "").replace(/\r/g, "");
                  let lines = raw.split("\n");
                  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

                  setEditedText(prev => {
                    const copy = prev.map(arr => [...arr]);
                    copy[currentSceneIndex] = lines;
                    saveDraftToStorage(editedMainTitle, editedSubTitle, copy, editedImg);
                    return copy;
                  });
                }}
              />
            )
            }

          </div>
          <div className='btnArea'>
            <div
              className={`preBtn ${isFirst ? "invalideBtn" : ""}`}
              onClick={() => {
                goPrev();
                setShowWhyHereState(false);
              }}
            >
            </div>
            <div
              className='nextBtn'
              onClick={() => {
                goNext();
                setShowWhyHereState(false);
              }}
            >
            </div>
          </div>
          {/* storyBoard */}
          <div className='storyBoard' onClick={() =>
            navigate("/final", {
              state: { scrollToId: currentScene?.id },
            })
          }>
            <h5>Storyboard</h5>
          </div>
          {/* alternative */}
          {props.showAlternative && (
            <div className='alternative' onClick={openAlternative}>
              <h5>Alternatives</h5>
            </div>
          )}
        </div>
        <div className="divider" />
      </div>
      {/* 确认弹框 */}
      {showConfirm && (
        <div
          className={`overlay ${modalOpenClass ? "open" : ""}`}
          onClick={() => setShowConfirm(false)} // 点击遮罩关闭
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()} // 阻止点弹框时触发遮罩关闭
            role="dialog"
            aria-modal="true"
          >
            <h3>Generate final script</h3>
            <p>Are you sure you want to generate the final script now?</p>

            <div className="modalActions">
              <div
                className="cancelBtn"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </div>

              <div
                className={`${isGenerating ? "disabled" : ""} confirmBtn`}
                onClick={() => {
                  if (isGenerating) return; // 防止重复点击
                  setIsGenerating(true);

                  // 最终保存一次
                  saveDraftToStorage(
                    mainTitleRef.current?.textContent ?? editedMainTitle,
                    editedSubTitle,
                    editedText,
                    editedImg
                  );

                  // 回 final（Final 从 draft 读）
                  setTimeout(() => {
                    navigate('/final');
                    setShowConfirm(false);
                    setIsGenerating(false);
                  }, 3000);

                }}
              >
                {isGenerating ? "Generating..." : "Confirm"}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Why here */}
      {props.showWhyHere && showWhyHereState && (
        <div className="whyHere">
          <p>Why here?</p>
        </div>
      )}
      {/* Alternative */}
      {showAlternativeState && (
        <div className={`alternativeOverlay ${modalOpenClass ? "open" : ""}`} onClick={() => setShowAlternativeState(false)}>
          {/* regenerate */}

          <div
            className='regenBtn'
            onClick={(e) => {
              e.stopPropagation();      //阻止冒泡到 overlay
              regenerateAlternatives();
            }}
          >
            <h5>Regenerate</h5>
          </div>

          <div className='paper' onClick={(e) => e.stopPropagation()}>
            {altLoading ? (
              <div className="altLoadingWrapper">
                <Spinner />
                <div className='altLoadingText'>Generating alternatives...</div>
              </div>
            ) : (
              alternativeScene.map((scene, index) => (
                <AlternativePop
                  key={index}
                  id={scene.id}
                  subTitle={currentSubTitle}
                  img={scene.img}
                  text={scene.text}
                  onReplaceText={() => handleReplaceText(scene)}
                  onReplaceAll={() => handleReplaceAll(scene)}
                />
              ))
            )}
            {
              altLoading ? null : <div className="divider" />
            }
            {
              !altLoading && (
                <div className='sceneCount1'>
                  <p>More conversational</p>
                </div>
              )
            }
            {
              !altLoading && (
                <div className='sceneCount2'>
                  <p>More professional</p>
                </div>
              )
            }

          </div>
        </div>
      )
      }
    </div>

  )
}

export default Edit1