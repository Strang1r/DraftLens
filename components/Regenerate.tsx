import "./Regenerate.scss"
import { useNavigate } from "react-router-dom";

const Regenerate = () => {

  const navigate = useNavigate();

  const handleRegenerate = () => {
    // 1) 读当前条件（你一直用 sessionStorage 存的）
    const cond = sessionStorage.getItem("experimentConditionId") || "1";

    // 2) 可选：清掉上一轮生成内容，避免回去后还显示旧 draft
    sessionStorage.removeItem("draft");
    sessionStorage.removeItem("issuesByScene");
    // 如果你还有其他缓存（如 alternatives/annotations/searchTerms），也一起清

    // 3) 回到 Prompt，并把 cond 放回 URL
    navigate(`/?cond=${cond}`);
  };

  return (
    <div className="regeneratePrompt" onClick={handleRegenerate}>
      Regenerate from Prompt
    </div>
  )
}

export default Regenerate 