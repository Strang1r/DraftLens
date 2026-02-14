import { useEffect, useMemo, useRef, useState } from 'react';
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


const Edit = (props: EditProps) => {
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

  useEffect(() => {
    const el = scriptRef.current;
    if (!el) return;
    const text = (editedText[currentSceneIndex] || []).join("\n");
    if (el.innerText !== text) el.innerText = text;
  }, [currentSceneIndex, editedText]);

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
            <div
              className='scriptText'
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
            /* onBlur={(e) => {
              // blur 保存，可以把 saveDraft 放这里
            }} */
            />
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

export default Edit