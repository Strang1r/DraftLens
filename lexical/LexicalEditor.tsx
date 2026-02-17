import { useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import AnnotationOnBlurPlugin, { applyAnnotationsToRoot } from "./plugins/AnnotationOnBlurPlugin";
import SearchHighlightLivePlugin from "./plugins/SearchHighlightLivePlugin";
import {
  $createParagraphNode,
  $createTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  $isParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  $createRangeSelection,
  $getRoot,
} from "lexical";

type ParagraphAnnotation = {
  keyWords: string[];
  keySentences: string[];
};

type Props = {
  value: string[]; // 每个段落一条 string
  sceneKey: number;
  onBlurCommit: (lines: string[]) => void;
  annotations?: ParagraphAnnotation[]; // 与 value 一一对应（按段落）

  // condition3 
  searchTerm?: string;
  highlightEnabled?: boolean;
  searchTriggered?: boolean; // 用户是否主动搜索
  wholeWordOnly?: boolean; // 是否只匹配完整词
  searchInputRef?: React.RefObject<HTMLInputElement | null>; // 搜索框ref
};

// 从 root 的子节点按段落取文本，避免段落间空行被存进去
function getParagraphLines() {
  const root = $getRoot();
  const children = root.getChildren();

  const lines: string[] = [];
  for (const node of children) {
    if ($isParagraphNode(node)) {
      lines.push(node.getTextContent());
    } else {
      // 保险：非段落也取一下
      lines.push(node.getTextContent());
    }
  }

  // 去掉末尾多余空段（但保留中间空段）
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function flattenAnnotations(annotations: ParagraphAnnotation[]) {
  return {
    keyWords: annotations.flatMap((a) => a?.keyWords ?? []),
    keySentences: annotations.flatMap((a) => a?.keySentences ?? []),
  };
}

// 外部 value -> editor 内容（scene 切换 / 父组件 setEditedText 后同步）
function SyncValuePlugin({
  value,
  sceneKey,
  annotations = [],
}: {
  value: string[];
  sceneKey: any;
  annotations?: ParagraphAnnotation[];
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(() => {
      const root = $getRoot();
      root.clear();

      value.forEach((line) => {
        const p = $createParagraphNode();
        p.append($createTextNode(line ?? ""));
        root.append(p);
      });

      if (value.length === 0) root.append($createParagraphNode());

      // ✅ 同步后立即标注（当前版本：先 flatten 成全局应用）
      const { keyWords, keySentences } = flattenAnnotations(annotations);
      applyAnnotationsToRoot(keyWords, keySentences);
    });
  }, [editor, sceneKey]);

  return null;
}

function getGlobalOffsetFromSelection(): number {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return 0;

  const root = $getRoot();
  const anchor = selection.anchor;

  let count = 0;
  const textNodes = root.getAllTextNodes();

  for (const n of textNodes) {
    if (n.getKey() === anchor.key) break;
    count += n.getTextContentSize();
  }
  return count + anchor.offset;
}

function restoreSelectionByGlobalOffset(globalOffset: number) {
  const root = $getRoot();
  const textNodes = root.getAllTextNodes();

  let remain = globalOffset;
  for (const n of textNodes) {
    const size = n.getTextContentSize();
    if (remain <= size) {
      const sel = $createRangeSelection();
      sel.anchor.set(n.getKey(), Math.max(0, remain), "text");
      sel.focus.set(n.getKey(), Math.max(0, remain), "text");
      $setSelection(sel);
      return;
    }
    remain -= size;
  }
}

// editor blur -> 回传纯文本 lines
export function BlurCommitPlugin({
  onBlurCommit,
  annotations = [],
  updateAnnotationsOnBlur = true,
}: {
  onBlurCommit?: (lines: string[]) => void;
  annotations?: ParagraphAnnotation[];
  updateAnnotationsOnBlur?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onBlurCommit) return;

    return editor.registerCommand(
      BLUR_COMMAND,
      () => {
        // 1) 读 selection -> 全文 offset
        let globalOffset = 0;
        editor.getEditorState().read(() => {
          globalOffset = getGlobalOffsetFromSelection();
        });

        // 2) commit +（可选）更新标注 + 恢复 selection
        editor.update(() => {
          onBlurCommit(getParagraphLines());

          if (updateAnnotationsOnBlur) {
            const { keyWords, keySentences } = flattenAnnotations(annotations);
            applyAnnotationsToRoot(keyWords, keySentences);
            restoreSelectionByGlobalOffset(globalOffset);
          }
        });

        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onBlurCommit, annotations, updateAnnotationsOnBlur]);

  return null;
}

export default function LexicalEditor({
  value,
  sceneKey,
  onBlurCommit,
  annotations = [],
  searchTerm,
  highlightEnabled,
  searchTriggered,
  wholeWordOnly,
  searchInputRef,
}: Props) {
  const initialConfig = {
    namespace: "DraftLensEditor",
    onError(error: Error) {
      console.error(error);
    },
  };

  const flat = flattenAnnotations(annotations);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={<ContentEditable className="scriptText" />}
        placeholder={null}
        ErrorBoundary={({ children }) => <>{children}</>}
      />
      <HistoryPlugin />

      {/* 这个插件你目前 enabled=false，相当于不靠它自动刷新 */}
      <AnnotationOnBlurPlugin
        enabled={false}
        keyWords={flat.keyWords}
        keySentences={flat.keySentences}
      />

      <SyncValuePlugin
        value={value}
        sceneKey={sceneKey}
        annotations={annotations}
      />

      <BlurCommitPlugin
        onBlurCommit={onBlurCommit}
        annotations={annotations}
        updateAnnotationsOnBlur={false} // 想 blur 后自动重新 apply 就改 true
      />

      <SearchHighlightLivePlugin
        enabled={!!highlightEnabled && !!searchTerm?.trim()}
        keyWords={flat.keyWords}
        keySentences={flat.keySentences}
        searchTerm={searchTerm ?? ""}
        searchTriggered={searchTriggered}
        wholeWordOnly={wholeWordOnly}
        searchInputRef={searchInputRef}
      />
    </LexicalComposer>
  );
}
