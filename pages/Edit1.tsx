import { useEffect, useMemo, useRef, useState } from 'react';
import logoSvg from '../src/assets/logo.svg'
import './Edit1.scss'
import { useNavigate, useParams } from 'react-router-dom';

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


const Edit1 = () => {
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

  // 如果 draft/scenes 为空，直接回 final（避免报错）
  useEffect(() => {
    if (!draft || scenes.length === 0) navigate("/final");
  }, [draft, scenes.length, navigate]);

  // ✅ 保存回 draft（唯一真相）
  const saveDraftToStorage = (nextMain: string, nextSub: string[], nextText: string[][]) => {
    const raw = sessionStorage.getItem("draft");
    if (!raw) return;

    const d: Draft = JSON.parse(raw);
    d.mainTitle = nextMain;

    d.scenes = d.scenes.map((s, i) => ({
      ...s,
      subTitle: nextSub[i] ?? s.subTitle,
      text: nextText[i] ?? s.text,
      // img 你目前没编辑，就保持原样
    }));

    sessionStorage.setItem("draft", JSON.stringify(d));
  };


  // prev / next
  const goPrev = () => {
    if (isFirst) return;
    // 可选：切换前先存一次（避免用户没 blur 就切走）
    saveDraftToStorage(editedMainTitle, editedSubTitle, editedText);
    setCurrentSceneIndex(v => Math.max(0, v - 1));
  };

  const goNext = () => {
    if (isLast) {
      setShowConfirm(true);
      return;
    }
    saveDraftToStorage(editedMainTitle, editedSubTitle, editedText);
    setCurrentSceneIndex(v => Math.min(scenes.length - 1, v + 1));
  };

  // subtitle blur
  const onEditSubTitle = (value: string) => {
    setEditedSubTitle(prev => {
      const copy = [...prev];
      copy[currentSceneIndex] = value;
      saveDraftToStorage(editedMainTitle, copy, editedText);
      return copy;
    });
  };

  // mainTitle blur
  const onEditMainTitle = (value: string) => {
    setEditedMainTitle(value);
    saveDraftToStorage(value, editedSubTitle, editedText);
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

  // 弹框动画（保持你原逻辑）
  const [modalOpenClass, setModalOpenClass] = useState(false);
  useEffect(() => {
    if (showConfirm) {
      setModalOpenClass(false);
      requestAnimationFrame(() => setModalOpenClass(true));
    } else {
      setModalOpenClass(false);
    }
  }, [showConfirm]);

  const [isGenerating, setIsGenerating] = useState(false);

  if (!currentScene) return null;


  return (
    <div className="edit1BackGround">
      <div className='logo'>
        <img src={logoSvg} alt="" />
      </div>
      <div className='paper'>
        <div className='imgArea'>
          <div className='sceneOptions'>
            <div className='sceneImg' key={currentSceneIndex}>
              <img src={currentScene.img} alt="" />
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
          {/* <div className='script'>
            <div
              className='scriptText'
              key={currentSceneIndex}
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => {
                // 把编辑后的内容按段落拆回数组
                const lines = (e.currentTarget.innerText || "")
                  .split("\n")
                  .map(s => s.trim())
                  .filter(Boolean);

                setEditedText(prev => {
                  const copy = prev.map(arr => [...arr]);
                  copy[currentSceneIndex] = lines;
                  saveDraft(editedMainTitle, editedSubTitle, copy);
                  return copy;
                });
              }}
            >
              {editedText[currentSceneIndex].map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>  */}
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
                  saveDraftToStorage(editedMainTitle, editedSubTitle, copy);
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
              onClick={goPrev}
            >
            </div>
            <div
              className='nextBtn'
              onClick={goNext}
            >
            </div>
          </div>

          {/* storyBoard */}
          {/* <div className='regenerateBtn' onClick={() => navigate("/final")}>
            <h5>Storyboard</h5>
          </div> */}
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
                    editedText
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
    </div>

  )
}

export default Edit1