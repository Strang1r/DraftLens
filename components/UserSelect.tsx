import { useNavigate } from "react-router-dom";
import "./UserSelect.scss"

type Scene = {
  id: number;
  subTitle: string;
  img: string;
  text: string[];
};

type Draft = {
  id: "A" | "B";
  instruction: string;
  mainTitle?: string;
  scenes: Scene[];
};

type UserSelectProps = {
  title: string;
  previewScene: Scene;
  draft: Draft; // 如果你想 UserSelect 拿到整个 draft，可以加这个字段
}

const UserSelect = ({ title, previewScene, draft }: UserSelectProps) => {

  const navigate = useNavigate();

  const goEdit = () => {
    if (!draft) return;

    // ✅ 策略1：每次进入 edit 都当新草稿（清理历史草稿）
    const draftKey = `draft_edit1_${draft.id}`; // 用 A/B 区分，而不是 v0
    sessionStorage.removeItem(draftKey);

    // ✅ 把“统一结构”直接传过去（不要再包一层 versionId/title）
    sessionStorage.setItem("selectedScript", JSON.stringify(draft));
    navigate("/Condition1", { state: draft });
  };

  return (
    <div className='userSelect'>
      <div className='title'>
        <h3>{title}</h3>
      </div>
      <div className='subTitle'>
        <h4>{previewScene.subTitle}</h4>
      </div>
      <div className='script'>
        <div className='scriptImg'>
          <img src={previewScene.img} alt="" />
        </div>
        <div className='scriptText'>
          {Array.isArray(previewScene.text) ? (
            previewScene.text.map((text, index) => <div key={index}><p>{text}</p><br /></div>)
          ) : (
            <p>{previewScene.text}</p>
          )}
        </div>
      </div>

      <div
        className='selectBtn'
        onClick={goEdit}

      >
        <h4>Edit this version</h4>
      </div>
    </div>

  )
}

export default UserSelect
