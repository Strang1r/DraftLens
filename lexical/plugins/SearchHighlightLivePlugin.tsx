import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { applyAnnotationsToRoot } from "./AnnotationCond3Plugin";

export default function SearchHighlightLivePlugin({
  keyWords = [],
  keySentences = [],
  searchTerm = "",
  enabled = false,
  searchTriggered = false,
  wholeWordOnly = false,
}: {
  keyWords?: string[];
  keySentences?: string[];
  searchTerm?: string;
  enabled?: boolean;
  searchTriggered?: boolean;
  wholeWordOnly?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null> | null;
}) {
  const [editor] = useLexicalComposerContext();
  const isSelectingRef = useRef<boolean>(false);

  // 简化逻辑：只应用高亮，不尝试恢复焦点（焦点由父组件管理）
  const applyHighlight = () => {
    if (!enabled || !searchTerm.trim()) return;

    editor.update(() => {
      applyAnnotationsToRoot(
        keyWords,
        keySentences,
        [searchTerm],
        true,
        wholeWordOnly
      );
    });
  };

  // 1) 只在 searchTriggered 改变时应用高亮（即用户点击搜索按钮或按Enter）
  useEffect(() => {
    if (!enabled) return;
    if (!searchTerm.trim()) return;
    if (isSelectingRef.current) return;

    applyHighlight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTriggered]);

  // 2) 监听鼠标拖拽：防止拖拽时应用高亮
  useEffect(() => {
    if (!enabled) return;

    const rootEl = editor.getRootElement();
    if (!rootEl) return;

    const onMouseDown = () => {
      isSelectingRef.current = true;
    };

    const onMouseUp = () => {
      isSelectingRef.current = false;
    };

    rootEl.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      rootEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [editor, enabled]);

  return null;
}
