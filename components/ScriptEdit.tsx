import { useEffect, useMemo, useRef, useState } from 'react';
import logoSvg from '../src/assets/logo.svg'
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import './ScriptEdit.scss'
import AlternativePop from './AlternativePop';
import Spinner from './Spinner';
import LexicalEditor from "../lexical/LexicalEditor";
import LexicalEditorCond5 from '../lexical/LexicalEditorCond5';
import LexicalEditorCond3 from '../lexical/LexicalEditorCond3';
import LexicalEditorCond6 from '../lexical/LexicalEditorCond6';
import { type LexicalEditor as LexicalEditorInstance } from "lexical";
import { $getSelection, $isRangeSelection } from "lexical";
import { $getRoot, $isTextNode, $getNodeByKey, $createRangeSelection, $setSelection } from "lexical";
import { $createTextNode } from "lexical";
import Regenerate from './Regenerate';

type ParagraphAnnotation = {
  keyWords: string[];       // 1-2
  keySentences: string[];   // 0-1
};

type Scene = {
  id: number | string;
  subTitle: string;
  img: string;
  text: string[];
  annotations?: {
    paragraphs: ParagraphAnnotation[]; // 与 text.length 对齐
  };
  rationale?: string; // condition4 
};

type Draft = {
  mainTitle: string;
  scenes: Scene[];
};

type EditProps = {
  showSearch?: boolean;
  showWhyHere?: boolean;
  showAlternative?: boolean;
  showAnnotation?: boolean; // condition2 
  showSummary?: boolean; // condition4 
  showSuggestion?: boolean; // condition5 
  showChatBot?: boolean; // condition6 
};

type AltScene = {
  id: string;
  text: string[];
  img: string;
  // 后端如果返回 tone 也可以收着
  tone?: "conversational" | "professional";
};

// condition5 
type SentenceIssue = {
  id: string;
  sentence: string;
  issue: string;
};

// condition6 
type ChatMsg = {
  id: string;
  role: "user" | "ai";
  text: string;
  loading?: boolean;
  replacement?: string | null;
  applied?: boolean;
};

const Edit = (props: EditProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sceneId } = useParams();

  // 统一从 draft 读
  const draft: Draft | null = useMemo(() => {
    const raw = sessionStorage.getItem("draft");
    return raw ? JSON.parse(raw) : null;
  }, []);

  const scenes: Scene[] = draft?.scenes ?? [];
  const initialTitle = draft?.mainTitle ?? "HISTORY";

  // 初始定位到点击的那个 scene
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


  // 保存回 draft（唯一真相）
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

  // contentEditable text
  const mainTitleRef = useRef<HTMLHeadingElement | null>(null);
  const scriptRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (props.showAnnotation) return; // condition2 走 Lexical，就别碰 DOM
    const el = scriptRef.current;
    if (!el) return;

    const text = (editedText[currentSceneIndex] || []).join("\n");
    if (el.innerText !== text) el.innerText = text;
  }, [props.showAnnotation, currentSceneIndex, editedText]);

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

  // 替换“当前scene”的图片
  const handleReplaceImage = (alt: { img: string }) => {
    const nextSub = [...editedSubTitle]; // 不改subtitle也行（那就不赋值）
    const nextText = editedText.map(arr => [...arr]);
    const nextImg = [...editedImg];

    nextImg[currentSceneIndex] = alt.img;

    setEditedText(nextText);
    setEditedImg(nextImg);

    saveDraftToStorage(editedMainTitle, nextSub, nextText, nextImg);
    setShowAlternativeState(false);
  };

  // condition1 替换“当前scene”的文本 + 图片
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

  // condition1 调用后端接口获取替换选项（文本 + 图片）
  const [alternativeScene, setAlternativeScene] = useState<AltScene[]>([]);
  const [altLoading, setAltLoading] = useState(false);

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
      setAlternativeScene(placeholderAlternatives);
      return placeholderAlternatives;
    } finally {
      setAltLoading(false);
    }
  };

  const prevSceneIdRef = useRef<number | string | null>(null);
  useEffect(() => {
    const currentId = currentScene?.id ?? null;
    if (prevSceneIdRef.current === null) {
      prevSceneIdRef.current = currentId;
      return;
    }
    if (prevSceneIdRef.current !== currentId) {
      setAlternativeScene([]);
      prevSceneIdRef.current = currentId;
    }
  }, [currentScene]);

  // 当前subtitle
  const currentSubTitle = editedSubTitle[currentSceneIndex];

  // 打开替换选项：先从缓存拿，有就用；没有就调接口，拿到后顺便存缓存
  const altCacheRef = useRef<Record<string, AltScene[]>>({});
  const ALT_CACHE_KEY = "alternativesByScene";

  const readAltCache = (): Record<string, AltScene[]> => {
    try {
      const raw = sessionStorage.getItem(ALT_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const writeAltCache = (next: Record<string, AltScene[]>) => {
    try {
      sessionStorage.setItem(ALT_CACHE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const updateAltCache = (key: string, alts: AltScene[]) => {
    altCacheRef.current[key] = alts;
    const existing = readAltCache();
    existing[key] = alts;
    writeAltCache(existing);
  };

  const openAlternative = () => {
    setShowAlternativeState(true);

    const key = String(currentScene.id);
    const cached = altCacheRef.current[key] ?? readAltCache()[key];

    if (cached?.length) {
      altCacheRef.current[key] = cached;
      setAlternativeScene(cached);
      setAltLoading(false);
      return;
    }

    fetchAlternatives().then((alts) => {
      if (alts?.length) updateAltCache(key, alts);
    });
  };

  const autoOpenAltRef = useRef(false);
  useEffect(() => {
    if (!props.showAlternative) return;
    if (autoOpenAltRef.current) return;
    const state = location.state as { openAlternative?: boolean } | null;
    if (!state?.openAlternative) return;
    if (!currentScene) return;

    autoOpenAltRef.current = true;
    openAlternative();
  }, [currentScene, location.state, props.showAlternative]);

  // 重新生成替换选项：直接调接口，拿到后更新缓存
  const regenerateAlternatives = () => {
    if (altLoading) return;
    const key = String(currentScene.id);
    fetchAlternatives().then((alts) => {
      if (alts?.length) updateAltCache(key, alts); // 覆盖缓存
    });
  };

  // condition3 搜索高亮
  const [searchTerm, setSearchTerm] = useState("");
  const [showHighlight, setShowHighlight] = useState(false); // 是否展示高亮（=whyHere那层）
  const [searchTriggered, setSearchTriggered] = useState(false); // ✅ 用户是否主动搜索

  // condition3 请求后端接口
  const [whyHereText, setWhyHereText] = useState("");
  const [isWhyHereLoading, setIsWhyHereLoading] = useState(false);

  async function fetchWhyHere(term: string, sceneText: string[]) {

    const t = term.trim();

    // 空输入：直接清空，不请求
    if (!t) {
      setWhyHereText("");
      setIsWhyHereLoading(false);
      return;
    }

    setIsWhyHereLoading(true);

    try {
      const resp = await fetch("http://localhost:3001/api/script/why-here", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerm: t, sceneText }),
      });

      const data = await resp.json();
      setWhyHereText(data.explanation || "");
    } catch (e) {
      console.error(e);
      setWhyHereText("");
    } finally {
      setIsWhyHereLoading(false);
    }
  }

  // condition5 句子问题
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

  // condition5 从缓存拿 issues（如果有），避免每次切 scene 都丢
  const [issuesByScene, setIssuesByScene] = useState<Record<number, SentenceIssue[]>>(() => {
    try {
      const raw = sessionStorage.getItem("issuesByScene");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const issuesSceneId = Number(currentScene.id);
  const issuesForThisScene = issuesByScene[issuesSceneId] ?? [];

  // condition5 调接口拿 suggestion
  const [suggestionText, setSuggestionText] = useState<string>("");
  const [suggestionTextLoading, setSuggestionTextLoading] = useState(false);
  useEffect(() => {
    if (!activeIssueId) return;

    const activeIssue = issuesForThisScene.find((x) => x.id === activeIssueId);
    if (!activeIssue) return;

    let cancelled = false;

    (async () => {
      try {
        setSuggestionTextLoading(true);
        setSuggestionText(""); // 可选：显示 loading 文案用
        const res = await fetch("http://localhost:3001/api/script/issue-suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentence: activeIssue.sentence,
            issue: activeIssue.issue,
            // 不传 prevSuggestion：第一次生成
          }),
        });

        if (!res.ok) return;
        const data = await res.json(); // { suggestion }

        if (!cancelled) {
          setSuggestionText(String(data?.suggestion ?? "").trim());
        }
      } catch (err) {
        console.error("issue-suggestion failed:", err);
      } finally {
        setSuggestionTextLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeIssueId, issuesForThisScene]);

  const handleClickSuggestion = async () => {
    if (!activeIssueId) return;

    const activeIssue = issuesForThisScene.find((x) => x.id === activeIssueId);
    if (!activeIssue) return;

    // 先保存旧 suggestion，避免清空 state 后传空字符串
    const prev = suggestionText;

    try {
      setSuggestionTextLoading(true);
      setSuggestionText("");
      const res = await fetch("http://localhost:3001/api/script/issue-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentence: activeIssue.sentence,
          issue: activeIssue.issue,
          prevSuggestion: prev, // ✅ 传上一次，触发“换角度”
        }),
      });

      if (!res.ok) return;
      const data = await res.json();
      setSuggestionText(String(data?.suggestion ?? "").trim());
    } catch (err) {
      console.error("regenerate failed:", err);
    } finally {
      setSuggestionTextLoading(false);
    }
  };

  // condition6
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [aiIsGenerating, setAiIsGenerating] = useState(false);
  // 自动调整文本框高度
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  // condition6 选中文本
  const [selectedText, setSelectedText] = useState("")
  const [editorInstance, setEditorInstance] = useState<LexicalEditorInstance | null>(null);
  const selectedTextRef = useRef("");
  useEffect(() => {
    selectedTextRef.current = selectedText;
  }, [selectedText]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  function uid() {
    return Math.random().toString(36).slice(2);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || aiIsGenerating) return;

    //const pinnedSelected = selectedTextRef.current.trim();

    setAiIsGenerating(true);

    const userMsg: ChatMsg = { id: uid(), role: "user", text };
    const aiPlaceholderId = uid();
    const aiMsg: ChatMsg = {
      id: aiPlaceholderId,
      role: "ai",
      text: "",
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setInput("");

    // 清空 textarea 高度（否则会保持很高）
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("http://localhost:3001/api/script/chat2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          //selectedText: pinnedSelected,
          userPrompt: text,
          sceneText: editedText[currentSceneIndex],
        }),
      });

      const data = await res.json();

      setMessages(prev =>
        prev.map(m =>
          m.id === aiPlaceholderId
            ? {
              ...m,
              loading: false,
              text: data.answer ?? "No response.",
              //replacement: data.replacement ?? null,
            }
            : m
        )
      );
    } catch (err) {
      console.error(err);

      setMessages(prev =>
        prev.map(m =>
          m.id === aiPlaceholderId
            ? {
              ...m,
              loading: false,
              text: "Ask AI for help with this scene.",
              //replacement: null,
            }
            : m
        )
      );
    } finally {
      setAiIsGenerating(false);
    }
  };

  // condition6 模拟 AI 响应
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // condition6 句子高亮不消失
  const pinnedKeysRef = useRef<Set<string>>(new Set());
  const clearPinnedHighlight = () => {
    if (!editorInstance) return;

    editorInstance.update(() => {
      const keys = pinnedKeysRef.current;
      if (keys.size === 0) return;

      for (const key of keys) {
        const n = $getNodeByKey(key);
        if (n && $isTextNode(n)) n.setStyle("");
      }
      pinnedKeysRef.current = new Set();
    });
  };

  function getAbsOffsetFromDOMRange(paragraphEl: HTMLElement, range: Range) {
    try {
      // 先拿到“段落内容的 Range”
      const base = document.createRange();
      base.selectNodeContents(paragraphEl);

      // startAbs = 段落开头 -> 选区 start 的文本长度
      const rStart = base.cloneRange();
      rStart.setEnd(range.startContainer, range.startOffset);
      const startAbs = rStart.toString().length;

      // endAbs = 段落开头 -> 选区 end 的文本长度
      const rEnd = base.cloneRange();
      rEnd.setEnd(range.endContainer, range.endOffset);
      const endAbs = rEnd.toString().length;

      // 验证并修正偏移值，防止超过文本长度
      const textLen = paragraphEl.textContent?.length || 0;
      const validStart = Math.max(0, Math.min(startAbs, textLen));
      const validEnd = Math.max(0, Math.min(endAbs, textLen));

      return {
        startAbs: validStart,
        endAbs: validEnd
      };
    } catch {
      return null;
    }
  }

  function normalizeParagraphTextNodesKeepText(paragraph: any) {
    const merged = paragraph.getTextContent();
    paragraph.clear();
    const t = $createTextNode(merged);
    paragraph.append(t);
    return t; // 返回新的单一 TextNode
  }

  const pinCurrentSelectionFromRange = (domRange: Range | null) => {
    if (!editorInstance || !domRange) return;

    editorInstance.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) return;

      const anchorNode = selection.anchor.getNode();
      const paraNode = anchorNode.getParent();
      if (!paraNode) return;

      const rootEl = editorInstance.getRootElement();
      if (!rootEl) return;

      // 找段落 DOM
      const pEl = domRange.commonAncestorContainer instanceof Element
        ? domRange.commonAncestorContainer.closest("p")
        : (domRange.commonAncestorContainer.parentElement?.closest("p") ?? null);

      if (!pEl) return;

      const offsets = getAbsOffsetFromDOMRange(pEl as HTMLElement, domRange);
      if (!offsets) return;

      let { startAbs, endAbs } = offsets;
      if (startAbs > endAbs) [startAbs, endAbs] = [endAbs, startAbs];

      // 清旧 pinned
      for (const key of pinnedKeysRef.current) {
        const n = $getNodeByKey(key);
        if (n && $isTextNode(n)) n.setStyle("");
      }
      pinnedKeysRef.current = new Set();

      // normalize（保留参考句子位置）
      const single = normalizeParagraphTextNodesKeepText(paraNode);
      if (!$isTextNode(single)) return;

      const textContent = single.getTextContent();

      // 确保 endAbs 不超过文本长度
      const safeEndAbs = Math.min(endAbs, textContent.length);
      const safeStartAbs = Math.min(startAbs, safeEndAbs);

      if (safeStartAbs === safeEndAbs) return; // 防止空选区

      // 设 selection
      const rangeSel = $createRangeSelection();
      rangeSel.setTextNodeRange(single, safeStartAbs, single, safeEndAbs);
      $setSelection(rangeSel);

      // 改进的 split 和高亮逻辑
      const parts = single.splitText(safeStartAbs, safeEndAbs);

      // 根据 parts.length 正确选择要高亮的部分
      let middlePart = null;
      if (parts.length === 3) {
        // [0..start), [start..end), [end..length)
        middlePart = parts[1];
      } else if (parts.length === 2) {
        // 可能是 [start..end), [end..length) 或 [0..start), [start..length)
        if (safeStartAbs === 0) {
          // [0..end), [end..length)
          middlePart = parts[0];
        } else {
          // [0..start), [start..length)
          middlePart = parts[1];
        }
      } else if (parts.length >= 1) {
        // 只有一个部分，应该不太可能，但保险起见
        middlePart = parts[0];
      }

      if (middlePart && $isTextNode(middlePart)) {
        middlePart.setStyle("background:#e6e1db; padding: calc(6.5 / 1080 * 100vh) 0;");
        pinnedKeysRef.current = new Set([middlePart.getKey()]);
      }

      const pinnedString = domRange.toString().replace(/\s+/g, " ").trim();
      selectedTextRef.current = pinnedString;
      setSelectedText(pinnedString);
    });
  };

  const applySuggestionToPinned = (newText: string) => {
    if (!editorInstance) return;

    editorInstance.update(() => {
      const keys = pinnedKeysRef.current;
      if (!keys || keys.size === 0) return;

      const root = $getRoot();
      const nodes = root.getAllTextNodes().filter(n => keys.has(n.getKey()));
      if (nodes.length === 0) return;

      // 第一个 node 放新文本，其余 node 清空
      const first = nodes[0];
      first.setTextContent(newText);
      first.setStyle(""); // 可选：apply 后取消高亮

      for (let i = 1; i < nodes.length; i++) {
        nodes[i].setTextContent("");
        nodes[i].setStyle("");
      }

      // 清空 pinned keys
      pinnedKeysRef.current = new Set();
    });

    // 可选：UI 也清空 selectedText
    setSelectedText("");
  };

  return (
    <div className={`edit1BackGround ${props.showChatBot ? "withChatBot" : ""}`}>
      <div className='logo'>
        <img src={logoSvg} alt="" />
      </div>
      <Regenerate />
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
            <p className='tip'>Click text to edit</p>
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
                ref={searchInputRef}
                type="text"
                placeholder="Search for why here..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={
                  (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // 搜索框为空时清空高亮，否则显示高亮
                      setShowHighlight(searchTerm.trim() !== "");
                      setShowWhyHereState(true);
                      setSearchTriggered(prev => !prev);
                      // 将光标设置到末尾
                      setTimeout(() => {
                        if (searchInputRef.current) {
                          const len = searchInputRef.current.value.length;
                          searchInputRef.current.setSelectionRange(len, len);
                        }
                      }, 0);
                      // 调接口拿 why here 文本
                      fetchWhyHere(searchInputRef.current?.value || "", editedText[currentSceneIndex] || []);
                    }
                  }
                }
              />
              <div
                className='searchButton'
                onMouseDown={(e) => {
                  e.preventDefault(); // 阻止焦点转移
                  // 搜索框为空时清空高亮，否则显示高亮
                  setShowHighlight((searchInputRef.current?.value || "").trim() !== "");
                  setShowWhyHereState(true);
                  setSearchTriggered(prev => !prev);
                  // 将光标设置到末尾
                  setTimeout(() => {
                    if (searchInputRef.current) {
                      const len = searchInputRef.current.value.length;
                      searchInputRef.current.setSelectionRange(len, len);
                      searchInputRef.current.focus();
                    }
                  }, 0);
                  // 调接口拿 why here 文本
                  fetchWhyHere(searchInputRef.current?.value || "", editedText[currentSceneIndex] || []);
                }}
              >
              </div>
            </div>
          )}
          {/* condition4 summary */}
          {props.showSummary && (
            <div className="summary" key={`summary-${currentSceneIndex}`}>
              <div className="summaryTitle">Writing Rationale</div>
              <p className="summaryContent">
                {currentScene.rationale || "This is a placeholder summary for the current scene. It will be replaced with an AI-generated summary once the backend is implemented. It will be replaced with an AI-generated summary once the backend is implemented."}
              </p>
            </div>
          )}
          <div className='script'>
            {props.showAnnotation ? (
              <LexicalEditor
                key={String(currentScene.id)}
                value={editedText[currentSceneIndex] || []}
                sceneKey={Number(currentScene.id)}
                annotations={currentScene.annotations?.paragraphs || []}
                onBlurCommit={(lines) => {
                  setEditedText((prev) => {
                    const copy = prev.map((arr) => [...arr]);
                    copy[currentSceneIndex] = lines;
                    saveDraftToStorage(editedMainTitle, editedSubTitle, copy, editedImg);
                    return copy;
                  });
                }}
              />
            ) : props.showSearch ? (
              <LexicalEditorCond3
                key={`search-${String(currentScene.id)}`}
                value={editedText[currentSceneIndex] || []}
                sceneKey={Number(currentScene.id)}
                onBlurCommit={(lines) => {
                  setEditedText((prev) => {
                    const copy = prev.map((arr) => [...arr]);
                    copy[currentSceneIndex] = lines;
                    saveDraftToStorage(editedMainTitle, editedSubTitle, copy, editedImg);
                    return copy;
                  });
                }}
                // search
                searchTerm={searchTerm}
                highlightEnabled={showHighlight}
                searchTriggered={searchTriggered}
                wholeWordOnly={true}
                searchInputRef={searchInputRef}
              />
            ) : props.showSuggestion ? (
              <LexicalEditorCond5
                key={`suggestion-${String(currentScene.id)}`}
                value={editedText[currentSceneIndex] || []}
                sceneKey={Number(currentScene.id)}
                onBlurCommit={(lines) => {
                  setEditedText((prev) => {
                    const copy = prev.map((arr) => [...arr]);
                    copy[currentSceneIndex] = lines;
                    saveDraftToStorage(editedMainTitle, editedSubTitle, copy, editedImg);
                    return copy;
                  });
                }}
                issues={issuesForThisScene}
                onSelectIssue={(id) => setActiveIssueId(id)}
              />
            ) : props.showChatBot ? (
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
              /* <LexicalEditorCond6
                key={`chatbot-${String(currentScene.id)}`}
                value={editedText[currentSceneIndex] || []}
                sceneKey={Number(currentScene.id)}
                onSelectionChange={(text) => {
                  // 把选中的文本给右侧 chatBot 用
                  setSelectedText(text);

                }}
                onSelectionFinal={(range) => pinCurrentSelectionFromRange(range)}// ✅ 松手后把“选区”变成持久高亮
                onEditorReady={setEditorInstance}
                onBlurCommit={(lines) => {
                  setEditedText((prev) => {
                    const prevLines = prev[currentSceneIndex] || [];
                    const same =
                      prevLines.length === lines.length &&
                      prevLines.every((v, i) => v === lines[i]);

                    if (same) return prev; // 不更新，不触发 SyncValuePlugin 重刷

                    const copy = prev.map((arr) => [...arr]);
                    copy[currentSceneIndex] = lines;
                    saveDraftToStorage(editedMainTitle, editedSubTitle, copy, editedImg);
                    return copy;
                  });
                }}
              /> */
              : (
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
              )}
          </div>
          <div className='btnArea'>
            <div className='pre'>
              <div
                className={`preBtn ${isFirst ? "invalideBtn" : ""}`}
                onClick={() => {
                  goPrev();
                  setActiveIssueId(null);
                }}
              >
              </div>
              <p className={isFirst ? "invalide" : ""}>Prev</p>
              <p className={isFirst ? "invalide" : ""}>Scene</p>
            </div>
            <div className='next'>
              <div
                className={`nextBtn ${isLast ? "invalideBtn" : ""}`}
                onClick={() => {
                  goNext();
                  setActiveIssueId(null);
                }}
              >
              </div>
              <p className={isLast ? "invalide" : ""}>Next</p>
              <p className={isLast ? "invalide" : ""}>Scene</p>
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
      {/* ChatBot */}
      {
        props.showChatBot && (
          <div className="chatBot">
            <div className='messages' ref={messagesRef}>
              {messages.map(m => {
                if (m.role === "user") {
                  return (
                    <div className="userPrompt" key={m.id}>
                      <p>{m.text}</p>
                    </div>
                  );
                }
                return (
                  <div className="AIInterface" key={m.id}>
                    <div className='AIResponse'>
                      {m.loading ? <Spinner /> : null}
                      <p>
                        {m.text}
                      </p>
                    </div>
                    {/* apply */}
                    {/* {m.role === "ai" && !m.loading && m.replacement && (
                      <div
                        className="applyBtn"
                        onClick={() => {
                          const rep = m.replacement!;
                          applySuggestionToPinned(rep);

                          setMessages(prev =>
                            prev.map(x =>
                              x.id === m.id
                                ? {
                                  ...x,
                                  text: rep,              // 把 replacement 固化成 AI 回复显示文本
                                  applied: true,
                                  replacement: null,      // 清掉 replacement，让按钮消失
                                }
                                : x
                            )
                          );
                        }}
                      >
                        <h5>Apply</h5>
                      </div>
                    )} */}
                  </div>
                );
              })}
            </div>
            <form className='promptInput' onSubmit={handleSubmit}>
              <textarea
                value={input}
                ref={textareaRef}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (isGenerating) return;
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Ask for how to improve this scene."
              />
              <button className='submitButton' type="submit" disabled={aiIsGenerating}>
              </button>
            </form>
          </div>
        )
      }
      {/* 确认弹框 */}
      {/* {showConfirm && (
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
                  }, 1000);

                }}
              >
                {isGenerating ? "Generating..." : "Confirm"}
              </div>
            </div>
          </div>
        </div>
      )}  */}
      {/* Why here */}
      {props.showWhyHere && showWhyHereState && (
        <div className="whyHere">
          <p>Why here?</p>
          <p>{
            isWhyHereLoading ? <Spinner /> : (whyHereText || "Search a term to see its role in this scene.")
          }</p>
        </div>
      )}
      {/* condition5 suggestion */}
      {props.showSuggestion && activeIssueId && (
        <div className="suggestion">
          <p>Revision Suggestion</p>
          <p>{
            suggestionTextLoading ? <Spinner /> : (suggestionText || "Make the sentence more specific by naming one concrete driver (e.g., ARPA funding) and clarifying what 'research challenges' were.")
          }</p>
          <div className="suggestionIcon" onClick={handleClickSuggestion}></div>
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
          {
            !altLoading && (
              <div className='closeButton' onClick={() => setShowAlternativeState(false)}>
              </div>
            )
          }
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
                  onReplaceImage={() => handleReplaceImage(scene)}
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

export default Edit