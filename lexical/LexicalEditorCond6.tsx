import { useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import SelectionContextPlugin from "./plugins/SelectionContextPlugin";
import type { LexicalEditor } from "lexical";
import EditorRefCond6Plugin from "./plugins/EditorRefCond6Plugin";

import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  $isParagraphNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
} from "lexical";

type Props = {
  value: string[]; // 每个段落一条 string
  sceneKey: number; // scene 切换时用于触发同步
  onBlurCommit: (lines: string[]) => void; // blur 时回传纯文本段落
  onSelectionChange?: (text: string) => void; // 选中文本回传
  onEditorReady?: (editor: LexicalEditor) => void;
  onSelectionFinal?: (range: Range | null) => void;
};

// 从 root 的子节点按段落取文本，避免段落间空行被存进去
function getParagraphLines() {
  const root = $getRoot();
  const children = root.getChildren();

  const lines: string[] = [];
  for (const node of children) {
    if ($isParagraphNode(node)) lines.push(node.getTextContent());
    else lines.push(node.getTextContent()); // 保险
  }

  // 去掉末尾多余空段（但保留中间空段）
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// 外部 value -> editor 内容（scene 切换 / 父组件 setEditedText 后同步）
function SyncValuePlugin({ value, sceneKey }: { value: string[]; sceneKey: any }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(() => {
      const root = $getRoot();
      root.clear();

      if (!value || value.length === 0) {
        root.append($createParagraphNode());
        return;
      }

      value.forEach((line) => {
        const p = $createParagraphNode();
        p.append($createTextNode(line ?? ""));
        root.append(p);
      });
    });
  }, [editor, sceneKey, value]);

  return null;
}

// editor blur -> 回传纯文本 lines
function BlurCommitPlugin({ onBlurCommit }: { onBlurCommit: (lines: string[]) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      BLUR_COMMAND,
      () => {
        editor.getEditorState().read(() => {
          onBlurCommit(getParagraphLines());
        });
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onBlurCommit]);

  return null;
}

export default function LexicalEditorCond6({
  value,
  sceneKey,
  onBlurCommit,
  onSelectionChange,
  onEditorReady,
  onSelectionFinal,
}: Props) {
  const initialConfig = {
    namespace: "DraftLensEditorCond6",
    onError(error: Error) {
      console.error(error);
    },
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={<ContentEditable className="scriptText" />}
        placeholder={null}
        ErrorBoundary={({ children }) => <>{children}</>}
      />
      <HistoryPlugin />
      <EditorRefCond6Plugin onReady={(ed) => onEditorReady?.(ed)} />

      {/* 选区变化时才回传；选区为空会回传 ""，避免右侧一直显示旧内容 */}
      <SelectionContextPlugin
        onSelectionChange={onSelectionChange}
        onSelectionFinal={onSelectionFinal}
        allowCollapsed={false}
      />

      <SyncValuePlugin value={value} sceneKey={sceneKey} />
      <BlurCommitPlugin onBlurCommit={onBlurCommit} />
    </LexicalComposer>
  );
}