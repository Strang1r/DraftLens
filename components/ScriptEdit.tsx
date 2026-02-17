import { useEffect, useMemo, useRef, useState } from 'react';
import logoSvg from '../src/assets/logo.svg'
import { useNavigate, useParams } from 'react-router-dom';
import './ScriptEdit.scss'
import AlternativePop from './AlternativePop';
import Spinner from './Spinner';
import LexicalEditor from "../lexical/LexicalEditor";
import LexicalEditorCond5 from '../lexical/LexicalEditorCond5';

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

const Edit = (props: EditProps) => {
  const navigate = useNavigate();
  const { sceneId } = useParams();

  // 统一从 draft 读
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

  useEffect(() => {
    setAlternativeScene([]);
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
                ref={searchInputRef}
                type="text"
                placeholder="Search in script..."
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
              <LexicalEditor
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
            )}
          </div>
          <div className='btnArea'>
            <div
              className={`preBtn ${isFirst ? "invalideBtn" : ""}`}
              onClick={() => {
                goPrev();
                setActiveIssueId(null);
              }}
            >
            </div>
            <div
              className='nextBtn'
              onClick={() => {
                goNext();
                setActiveIssueId(null);
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
                  }, 1000);

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

export default Edit