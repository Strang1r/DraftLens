import { useEffect, useRef, useState } from 'react';
import logoSvg from '../src/assets/logo.svg'
import './ScriptEdit.scss'
import { useNavigate, useLocation } from 'react-router-dom';

type Scene = {
  id: number;
  subTitle: string;
  img: string;          // e.g. "/assets/2.png"
  text: string[];       // paragraphs
};

// condition3 传 showSearch
type SearchProps = {
  showSearch?: boolean;
};

type WhyHereProps = {
  showWhyHere?: boolean;
};


const ScriptEdit = ({ showSearch, showWhyHere }: SearchProps & WhyHereProps) => {

  // 获取传递的数据
  const location = useLocation();
  const stored = sessionStorage.getItem("selectedScript");
  const storedData = stored ? JSON.parse(stored) : null;
  const data = location.state ?? storedData;
  const scenes: Scene[] = data?.scenes ?? [];
  const initialTitle = data?.mainTitle ?? "HISTORY";

  // ✅ 用 A/B 当草稿key（每个版本一份）
  const draftId = data?.id ?? "UNKNOWN";
  const draftKey = `draft_script_edit_${draftId}`;

  // 确认弹框
  const [showConfirm, setShowConfirm] = useState(false);

  // scene index
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);

  const currentScene = scenes[currentSceneIndex];
  const isFirst = currentSceneIndex === 0;
  const isLast = currentSceneIndex === scenes.length - 1;

  const goPrev = () => {
    if (isFirst) return;
    setCurrentSceneIndex((v) => Math.max(0, v - 1));
  };

  const goNext = () => {
    if (isLast) {
      setShowConfirm(true);
      return;
    }
    setCurrentSceneIndex((v) => Math.min(scenes.length - 1, v + 1));
  };

  // 可编辑
  // subtitle
  const onEditSubTitle = (value: string) => {
    setEditedSubTitle((prev) => {
      const copy = [...prev];
      copy[currentSceneIndex] = value;
      saveDraft(editedMainTitle, copy, editedText);
      return copy;
    });
  };

  // mainTitle
  const onEditMainTitle = (value: string) => {
    setEditedMainTitle(value);
    saveDraft(value, editedSubTitle, editedText);
  };

  const navigate = useNavigate();

  // 刷新后不丢失
  const DEFAULT_DRAFT = {
    mainTitle: initialTitle,
    scenes: scenes.map((s) => ({
      subTitle: s.subTitle,
      scriptImg: s.img,
      scriptText: [...s.text],
    })),
  };

  const [editedMainTitle, setEditedMainTitle] = useState<string>(() => DEFAULT_DRAFT.mainTitle);
  const [editedSubTitle, setEditedSubTitle] = useState<string[]>(() => DEFAULT_DRAFT.scenes.map((x: any) => x.subTitle));
  const [editedText, setEditedText] = useState<string[][]>(() => DEFAULT_DRAFT.scenes.map((x: any) => x.scriptText));

  const saveDraft = (nextMain: string, nextSub: string[], nextText: string[][]) => {
    const draft = {
      mainTitle: nextMain,
      scenes: scenes.map((s, i) => ({
        subTitle: nextSub[i],
        scriptImg: s.img,
        scriptText: nextText[i],
      })),
    };
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  };

  // 大标题
  const mainTitleRef = useRef<HTMLHeadingElement | null>(null);

  // 渐入动画
  const [modalOpenClass, setModalOpenClass] = useState(false);
  useEffect(() => {
    if (showConfirm) {
      setModalOpenClass(false);
      requestAnimationFrame(() => setModalOpenClass(true));
    } else {
      setModalOpenClass(false);
    }
  }, [showConfirm]);

  // 点击confirm后
  const [isGenerating, setIsGenerating] = useState(false);

  const scriptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scriptRef.current;
    if (!el) return;

    const text = (editedText[currentSceneIndex] || []).join("\n");

    // 避免每次 state 更新都覆盖导致光标跳
    if (el.innerText !== text) {
      el.innerText = text;
    }
  }, [currentSceneIndex, editedText]);

  // Why here
  const [showWhyHereState, setShowWhyHereState] = useState(false);


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
          {showSearch && (
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
                // ✅ 保留空行：split 后不要 filter(Boolean)
                let lines = raw.split("\n");

                // （可选）只去掉“最后多出来的空行”，避免末尾无限空行
                while (lines.length > 1 && lines[lines.length - 1] === "") {
                  lines.pop();
                }

                setEditedText(prev => {
                  const copy = prev.map(arr => [...arr]);
                  copy[currentSceneIndex] = lines; // ✅ lines 里可以包含 ""
                  saveDraft(editedMainTitle, editedSubTitle, copy);
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
              onClick={() => { goPrev(); setShowWhyHereState(false); }}
            >
            </div>
            <div
              className='nextBtn'
              onClick={() => { goNext(); setShowWhyHereState(false); }}
            >
            </div>
          </div>
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

                  const finalScript = {
                    title: mainTitleRef.current?.textContent ?? editedMainTitle,
                    scenes: scenes.map((s, index) => ({
                      id: String(s.id),
                      subTitle: editedSubTitle[index],
                      scriptImg: s.img,
                      scriptText: editedText[index],
                    })),
                  };

                  sessionStorage.setItem("finalScript", JSON.stringify(finalScript));

                  setTimeout(() => {
                    navigate('/final', { state: finalScript });
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
      {showWhyHere && showWhyHereState && (
        <div className="whyHere">
          <p>Why here?</p>
        </div>
      )}
    </div>

  )
}

export default ScriptEdit