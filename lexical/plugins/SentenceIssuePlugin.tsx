// 插入 Node + 点击联动 + 修改后移除
import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { LexicalNode } from "lexical";
import {
  $getRoot,
  COMMAND_PRIORITY_LOW,
  createCommand,
  $isElementNode, $setSelection,
} from "lexical";
import { $createSentenceIssueNode, $isSentenceIssueNode } from "../nodes/SentenceIssueNode";

export type SentenceIssue = {
  id: string;
  sentence: string;
  issue: string;
};

export const SELECT_ISSUE_COMMAND = createCommand<string>();

export default function SentenceIssuePlugin({
  issues,
  onSelectIssue,
}: {
  issues: SentenceIssue[];
  onSelectIssue?: (id: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  // 1) 注册点击联动（右侧 panel 用）
  useEffect(() => {
    return editor.registerCommand(
      SELECT_ISSUE_COMMAND,
      (id) => {
        onSelectIssue?.(id);
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onSelectIssue]);

  // 2) 初次/更新时插入标注
  useEffect(() => {
    if (!issues?.length) return;

    editor.update(() => {
      const root = $getRoot();

      // 先清理旧的 issue node（避免重复叠加）
      const walk = (node: LexicalNode) => {
        if ($isSentenceIssueNode(node)) {
          node.remove();
          return;
        }
        if ($isElementNode(node)) {
          node.getChildren().forEach(walk);
        }
      };

      $getRoot().getChildren().forEach(walk);

      // 再插入新的 issue node：最小策略——在包含该 sentence 的 text node 前插一个 issue node
      const textNodes = root.getAllTextNodes();
      issues.forEach((it) => {
        const target = it.sentence.trim();
        if (!target) return;

        for (const tn of textNodes) {
          const t = tn.getTextContent();
          const idx = t.indexOf(target);
          if (idx === -1) continue;

          // 1) 把当前 text node 切成 [before][mid][after]
          // Lexical TextNode.splitText 支持多个切分点
          const parts = tn.splitText(idx, idx + target.length);

          // splitText 返回包含切分后的节点数组，中间那段通常是 parts[1]
          // 为了稳一点，我们找长度等于 target 的那段
          const mid = parts.find(p => p.getTextContent() === target) ?? parts[1];

          // 2) 给 mid 加下划线（只作用于这句）
          // underline 用格式最稳定

          // ✅ 更推荐：直接用 setStyle 控制你想要的下划线样式
          mid.setStyle([
            "text-decoration: underline",
            "text-decoration-style: solid",
            "text-decoration-color: #8f7409",
            `text-underline-offset: calc(10 / 1080 * 100vh)`,
            `text-decoration-thickness: calc(1 / 1080 * 100vh)`,
          ].join(";"));

          // 3) 叹号插到 mid 前面，位置就正确了
          mid.insertBefore(
            $createSentenceIssueNode({
              id: it.id,
              issue: it.issue
            })
          );

          break;
        }
      });
    });
  }, [editor, issues]);

  // 3) 用户修改后移除：最小策略——每次内容变更时，如果对应 sentence 不再存在，就删掉该 issue node
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        const fullText = root.getTextContent();

        // 找到所有 issue node：如果它对应的 sentence 不在全文里，就删
        // 注意：这里需要在 update() 里删，所以用 editor.update 包一下
        const issueNodes: { nodeKey: string; id: string }[] = [];

        const walk = (node: LexicalNode) => {
          if ($isSentenceIssueNode(node)) {
            // 不要用 node.__payload（私有字段），用你 Node 里公开的 getter
            issueNodes.push({ nodeKey: node.getKey(), id: node.getPayload().id });
            return;
          }
          if ($isElementNode(node)) {
            node.getChildren().forEach(walk);
          }
        };

        root.getChildren().forEach(walk);

        if (!issueNodes.length) return;

        const idToSentence = new Map(issues.map((x) => [x.id, x.sentence]));
        const toRemove = issueNodes.filter((x) => {
          const s = (idToSentence.get(x.id) ?? "").trim();
          return s && !fullText.includes(s);
        });

        if (!toRemove.length) return;

        editor.update(() => {
          const root2 = $getRoot();
          const nodes = root2.getAllTextNodes(); // 触发树更新用
          void nodes;

          // 通过 key 找回 node 并删除
          toRemove.forEach(({ nodeKey }) => {
            const n = editor.getEditorState()._nodeMap.get(nodeKey);
            // 上面这行是内部结构，不建议长期用；
            // 更稳的做法是：遍历树用 getKey() 匹配删除（你需要的话我再给稳版本）
            // 这里先给你“最小能跑”的思路。
            if (n && $isSentenceIssueNode(n as any)) (n as any).remove();
          });
        });
      });
    });
  }, [editor, issues]);

  // 4) tooltip：鼠标移到叹号上显示 issue 描述
  useEffect(() => {
    let tooltipEl: HTMLDivElement | null = null;

    return editor.registerRootListener((rootElem) => {
      if (!rootElem) return;

      const onMouseMove = (e: MouseEvent) => {

        const bang = (e.target as HTMLElement | null)?.closest?.(".sentenceIssueBang") as HTMLElement | null;

        if (!bang) {
          if (tooltipEl) tooltipEl.style.opacity = "0";
          return;
        }

        const tip = bang.getAttribute("data-tip");

        if (!tip) return;

        // 创建 tooltip（只创建一次）
        if (!tooltipEl) {
          tooltipEl = document.createElement("div");
          tooltipEl.className = "issueTooltip";
          document.body.appendChild(tooltipEl);
        }

        tooltipEl.textContent = tip;
        tooltipEl.style.opacity = "1";

        const padding = 12;

        // 先获取 tooltip 尺寸
        const rect = tooltipEl.getBoundingClientRect();

        // 默认：在鼠标正上方居中
        let x = e.clientX - rect.width / 2;
        let y = e.clientY - rect.height - padding;

        // 避开左边界
        if (x < 8) x = 8;

        // 避开右边界
        if (x + rect.width > window.innerWidth - 8) {
          x = window.innerWidth - rect.width - 8;
        }

        // 如果上方空间不够 → 自动翻到鼠标下方
        if (y < 8) {
          y = e.clientY + padding;
        }

        tooltipEl.style.left = `${x}px`;
        tooltipEl.style.top = `${y}px`;
      };

      const onMouseLeave = () => {
        if (tooltipEl) tooltipEl.style.opacity = "0";
      };

      rootElem.addEventListener("mousemove", onMouseMove);
      rootElem.addEventListener("mouseleave", onMouseLeave);

      return () => {
        rootElem.removeEventListener("mousemove", onMouseMove);
        rootElem.removeEventListener("mouseleave", onMouseLeave);

        if (tooltipEl) {
          tooltipEl.remove();
          tooltipEl = null;
        }
      };
    });
  }, [editor]);

  // 5) click：点击叹号 -> 触发右侧 suggestion
  useEffect(() => {
    return editor.registerRootListener((rootElem) => {
      if (!rootElem) return;

      const onClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        const bang = target?.closest?.(".sentenceIssueBang") as HTMLElement | null;
        if (!bang) return;

        const id = bang.getAttribute("data-issue-id");
        if (!id) return;

        editor.dispatchCommand(SELECT_ISSUE_COMMAND, id);
      };

      rootElem.addEventListener("click", onClick);
      return () => rootElem.removeEventListener("click", onClick);
    });
  }, [editor]);

  // 6) blur on outside interaction：pointerdown + focusout，保证有标注时也能失焦
  useEffect(() => {
    let currentRoot: HTMLElement | null = editor.getRootElement();

    const blurEditor = (editable: HTMLElement) => {
      editor.blur();
      editor.update(() => {
        $setSelection(null);
      });
      window.getSelection()?.removeAllRanges();
      editable.blur();
    };

    const isInsideEditor = (target: EventTarget | null) => {
      if (!currentRoot || !target) return false;
      const el = target as HTMLElement;
      if (el.closest(".issueTooltip")) return true;
      return currentRoot.contains(el);
    };

    const onDocPointerDown = (e: PointerEvent) => {
      if (!currentRoot) return;
      if (isInsideEditor(e.target)) return;
      blurEditor(currentRoot);
    };

    const onRootFocusOut = (e: FocusEvent) => {
      if (!currentRoot) return;
      const nextTarget = (e.relatedTarget as HTMLElement | null) ?? document.activeElement as HTMLElement | null;
      if (isInsideEditor(nextTarget)) return;
      blurEditor(currentRoot);
    };

    const removeFocusOut = (root: HTMLElement | null) => {
      root?.removeEventListener("focusout", onRootFocusOut, true);
    };

    const addFocusOut = (root: HTMLElement | null) => {
      root?.addEventListener("focusout", onRootFocusOut, true);
    };

    const unregisterRootListener = editor.registerRootListener((rootElem) => {
      if (currentRoot === rootElem) return;
      removeFocusOut(currentRoot);
      currentRoot = rootElem;
      addFocusOut(currentRoot);
    });

    document.addEventListener("pointerdown", onDocPointerDown, true);
    addFocusOut(currentRoot);

    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      removeFocusOut(currentRoot);
      unregisterRootListener();
    };
  }, [editor]);

  return null;
}