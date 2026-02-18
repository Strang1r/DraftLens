import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from "lexical";

type Props = {
  onSelectionChange?: (text: string) => void;
  onSelectionFinal?: (range: Range | null) => void; // ✅ 带 range
  allowCollapsed?: boolean;
};

export default function SelectionContextPlugin({
  onSelectionChange,
  onSelectionFinal,
  allowCollapsed = false,
}: Props) {
  const [editor] = useLexicalComposerContext();
  const lastRef = useRef("");
  const onSelectionFinalRef = useRef(onSelectionFinal);

  useEffect(() => {
    onSelectionFinalRef.current = onSelectionFinal;
  }, [onSelectionFinal]);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const onUp = () => {
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      onSelectionFinalRef.current?.(range);
    };

    // 同时监听 mouseup 和 keyup，处理鼠标和键盘选择
    const onKeyUp = (e: KeyboardEvent) => {
      // 只在 Shift 键释放时触发（保证选区已确定）
      if (e.shiftKey) {
        const sel = window.getSelection();
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        onSelectionFinalRef.current?.(range);
      }
    };

    root.addEventListener("mouseup", onUp);
    root.addEventListener("keyup", onKeyUp);
    return () => {
      root.removeEventListener("mouseup", onUp);
      root.removeEventListener("keyup", onKeyUp);
    };
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        // 使用浏览器原生 Selection API 获取更准确的选中文本
        const nativeSelection = window.getSelection();
        let text = "";

        if (nativeSelection && nativeSelection.rangeCount > 0) {
          if (!nativeSelection.isCollapsed || allowCollapsed) {
            text = nativeSelection.toString();
          }
        }

        // 关键：没变化就不更新
        if (text === lastRef.current) return false;

        lastRef.current = text;
        onSelectionChange?.(text);

        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onSelectionChange, onSelectionFinal, allowCollapsed]);

  return null;
}