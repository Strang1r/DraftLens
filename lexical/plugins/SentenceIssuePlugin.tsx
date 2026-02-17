import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { LexicalNode } from "lexical";
import {
  $getRoot,
  COMMAND_PRIORITY_LOW,
  createCommand,
  $isElementNode,
  $setSelection,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { $createSentenceIssueNode, $isSentenceIssueNode } from "../nodes/SentenceIssueNode";
import {
  $createSentenceIssueEndNode,
  $isSentenceIssueEndNode,
} from "../nodes/SentenceIssueEndNode";

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

  // 记录每个 issue 对应的“那句 text node key”
  const issueToTextKeyRef = useRef<Map<string, string>>(new Map());
  const modifiedIssueIdsRef = useRef<Set<string>>(new Set());

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

      // ✅ 每次重插先清空 map
      issueToTextKeyRef.current.clear();

      // 先清理旧的 issue node
      const walk = (node: LexicalNode) => {
        if ($isSentenceIssueNode(node)) {
          node.remove();
          return;
        }
        if ($isElementNode(node)) node.getChildren().forEach(walk);
      };
      root.getChildren().forEach(walk);

      const textNodes = root.getAllTextNodes();

      issues.forEach((it) => {
        const target = it.sentence.trim();
        if (!target) return;

        for (const tn of textNodes) {
          const t = tn.getTextContent();
          const idx = t.indexOf(target);
          if (idx === -1) continue;

          const parts = tn.splitText(idx, idx + target.length);
          const mid = parts.find((p) => p.getTextContent() === target) ?? parts[1];

          // 初始：正常下划线 + opacity 1
          mid.setStyle(
            [
              "text-decoration: underline",
              "text-decoration-style: wavy",
              "text-decoration-color: rgb(173, 163, 118)",
              `text-underline-offset: calc(10 / 1080 * 100vh)`,
              `text-decoration-thickness: calc(1.2 / 1080 * 100vh)`,

            ].join(";")
          );

          // 插入叹号 node
          const issueNode = $createSentenceIssueNode({ id: it.id, issue: it.issue });
          mid.insertBefore(issueNode);
          const endNode = $createSentenceIssueEndNode();
          mid.insertAfter(endNode);

          // 记录 id -> midTextKey
          issueToTextKeyRef.current.set(it.id, mid.getKey());

          break;
        }
      });
    });
  }, [editor, issues]);

  //  3) “修改变淡 + 离开后删除”
  /* useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();

        // ---- 1) 找到“当前光标属于哪个 issue”
        let activeIssueId: string | null = null;

        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();

          // 从光标所在节点开始向左扫 siblings，找到最近的 SentenceIssueNode
          // 这样即使 TextNode 被 split 成多段，也能正确找到那句的 issue
          let cur: any = anchor;

          // 如果 anchor 是 text 的一部分，它的 parent/兄弟结构是平铺的
          // 我们先尝试在同一层向左找
          while (cur) {
            if ($isSentenceIssueNode(cur)) {
              activeIssueId = cur.getPayload().id;
              break;
            }
            cur = cur.getPreviousSibling?.() ?? null;
          }

          // 如果同层没找到，可能 anchor 在更深层（一般不太会），再退一步从 parent 左扫
          if (!activeIssueId) {
            let p: any = anchor.getParent?.();
            while (p && !activeIssueId) {
              let sib: any = p.getPreviousSibling?.() ?? null;
              while (sib) {
                if ($isSentenceIssueNode(sib)) {
                  activeIssueId = sib.getPayload().id;
                  break;
                }
                sib = sib.getPreviousSibling?.() ?? null;
              }
              p = p.getParent?.();
            }
          }
        }

        const issueById = new Map(issues.map((x) => [x.id, x]));
        const toDim: string[] = [];
        const toRemove: string[] = [];

        // ---- 2) 如果光标在句子内：检测是否修改 → 叹号&下划线变淡（只做一次）
        if (activeIssueId) {
          const it = issueById.get(activeIssueId);
          if (it) {
            // 用“当前光标所在的整段文本”做近似比较：
            // 更稳：只要这句被改过一次，就一直保持 dim（直到离开后删除）
            // 这里我们不再依赖 textKey，因为 textKey 会变
            const orig = it.sentence.trim();
            const root = $getRoot();
            const full = root.getTextContent(); // 简单法：全局文本（你现在就是单 editor 文本区）

            // 只要原句不再完整匹配（说明发生过修改），就判为 modified
            // 但我们不要立刻删除！只 dim
            const modified = orig && !full.includes(orig);

            if (modified && !modifiedIssueIdsRef.current.has(activeIssueId)) {
              modifiedIssueIdsRef.current.add(activeIssueId);
              toDim.push(activeIssueId);
            }
          }
        }

        // ---- 3) 离开句子/点编辑器外：删除（叹号+下划线一起消失）
        for (const id of modifiedIssueIdsRef.current) {
          if (!activeIssueId || activeIssueId !== id) {
            toRemove.push(id);
          }
        }

        if (!toDim.length && !toRemove.length) return;

        editor.update(() => {
          const root = $getRoot();

          // 收集所有 issue nodes
          const issueNodes: any[] = [];
          const walk = (node: LexicalNode) => {
            if ($isSentenceIssueNode(node)) issueNodes.push(node);
            else if ($isElementNode(node)) node.getChildren().forEach(walk);
          };
          root.getChildren().forEach(walk);

          // helper：把 issueNode 后面连续的 TextNode 都做某个操作
          const forEachFollowingTextNodes = (issueNode: any, fn: (t: any) => void) => {
            let n: any = issueNode.getNextSibling?.() ?? null;
            while (n && typeof n.getTextContent === "function") {
              // 这里基本就是 TextNode（或者也可能是其它 inline）
              // 我们只处理有 setStyle 的
              if (typeof n.setStyle === "function") fn(n);
              n = n.getNextSibling?.() ?? null;
            }
          };

          // 1) dim：叹号 opacity 0.3 + 下划线颜色变淡（文字不变！）
          toDim.forEach((id) => {
            const issueNode = issueNodes.find((x) => x.getPayload().id === id);
            if (!issueNode) return;

            // 叹号变淡
            issueNode.getWritable().setModified(true);

            // 下划线变淡：不要 opacity，改成半透明的 underline color
            // 原色 #8f7409 -> rgba(143,116,9,0.3)
            forEachFollowingTextNodes(issueNode, (t) => {
              const prev = t.getStyle?.() ?? "";
              const cleaned = prev
                .split(";")
                .map((s: string) => s.trim())
                .filter((s: string) =>
                  s &&
                  !s.startsWith("opacity:") &&
                  !s.startsWith("text-decoration-color:")
                )
                .join(";");

              t.setStyle(
                [
                  cleaned,
                  "text-decoration: underline",
                  "text-decoration-style: wavy",
                  "text-decoration-color: rgba(173, 163, 118, 0.4)",
                  `text-underline-offset: calc(10 / 1080 * 100vh)`,
                  `text-decoration-thickness: calc(1.2 / 1080 * 100vh)`,
                ]
                  .filter(Boolean)
                  .join(";")
              );
            });
          });

          // 2) remove：清掉下划线 + 删除叹号 node（连续文本都清掉，保证不残留）
          toRemove.forEach((id) => {
            const issueNode = issueNodes.find((x) => x.getPayload().id === id);
            if (!issueNode) return;

            forEachFollowingTextNodes(issueNode, (t) => {
              t.setStyle(""); // 清掉下划线
            });

            issueNode.remove();
            issueToTextKeyRef.current.delete(id);
            modifiedIssueIdsRef.current.delete(id);
          });
        });
      });
    });
  }, [editor, issues]); */
  useEffect(() => {
    // 取当前 issueNode 右侧“这一句”的文本：拼到 EndMarker/下一个 IssueNode/非 text
    const getCurrentSentenceTextByIssueNode = (issueNode: any) => {
      let text = "";
      let n: any = issueNode.getNextSibling?.() ?? null;

      while (n) {
        if ($isSentenceIssueEndNode(n)) break; // 句子结束
        if ($isSentenceIssueNode(n)) break;    // 下一个 issue（保险）
        if (typeof n.getTextContent === "function") {
          text += n.getTextContent();
          n = n.getNextSibling?.() ?? null;
          continue;
        }
        break; // 非 text（段落/元素边界）
      }
      return text;
    };

    // 给 text node 应用波浪下划线（不改文字透明度）
    const applyUnderline = (t: any, color: string) => {
      const prev = t.getStyle?.() ?? "";
      const cleaned = prev
        .split(";")
        .map((s: string) => s.trim())
        .filter(
          (s: string) =>
            s &&
            !s.startsWith("opacity:") &&
            !s.startsWith("text-decoration-color:") &&
            !s.startsWith("text-decoration-style:") &&
            !s.startsWith("text-decoration:") &&
            !s.startsWith("text-underline-offset:") &&
            !s.startsWith("text-decoration-thickness:")
        )
        .join(";");

      t.setStyle(
        [
          cleaned,
          "text-decoration: underline",
          "text-decoration-style: wavy",
          `text-decoration-color: ${color}`,
          `text-underline-offset: calc(10 / 1080 * 100vh)`,
          `text-decoration-thickness: calc(1.2 / 1080 * 100vh)`,
        ]
          .filter(Boolean)
          .join(";")
      );
    };

    // 遍历 issueNode 后面连续 text nodes（直到 EndMarker/下一个 IssueNode/非 text）
    const forEachFollowingTextNodes = (issueNode: any, fn: (t: any) => void) => {
      let n: any = issueNode.getNextSibling?.() ?? null;
      while (n) {
        if ($isSentenceIssueEndNode(n)) break; // 句子结束
        if ($isSentenceIssueNode(n)) break;
        if (typeof n.getTextContent === "function") {
          if (typeof n.setStyle === "function") fn(n);
          n = n.getNextSibling?.() ?? null;
          continue;
        }
        break;
      }
    };

    // remove 时：把 issueNode 后面的 EndMarker 一起删掉（避免残留）
    const removeEndMarkerAfterIssueNode = (issueNode: any) => {
      let n: any = issueNode.getNextSibling?.() ?? null;
      while (n) {
        if ($isSentenceIssueEndNode(n)) {
          n.remove();
          break;
        }
        if ($isSentenceIssueNode(n)) break;
        // 跳过 text / 其它 inline，继续往右找
        n = n.getNextSibling?.() ?? null;
      }
    };

    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();

        // ---- 1) 找到“当前光标属于哪个 issue”（同时拿到 issueNode）
        let activeIssueId: string | null = null;
        let activeIssueNode: any = null;

        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();

          // 从光标节点向左扫 siblings，找最近的 SentenceIssueNode
          let cur: any = anchor;
          while (cur) {
            if ($isSentenceIssueNode(cur)) {
              activeIssueId = cur.getPayload().id;
              activeIssueNode = cur;
              break;
            }
            cur = cur.getPreviousSibling?.() ?? null;
          }

          // 如果同层没找到，向上找 parent，再从 parent 的左兄弟里找
          if (!activeIssueId) {
            let p: any = anchor.getParent?.();
            while (p && !activeIssueId) {
              let sib: any = p.getPreviousSibling?.() ?? null;
              while (sib) {
                if ($isSentenceIssueNode(sib)) {
                  activeIssueId = sib.getPayload().id;
                  activeIssueNode = sib;
                  break;
                }
                sib = sib.getPreviousSibling?.() ?? null;
              }
              p = p.getParent?.();
            }
          }
        }

        const issueById = new Map(issues.map((x) => [x.id, x]));
        const toDim: string[] = [];
        const toUndim: string[] = [];
        const toRemove: string[] = [];

        // ---- 2) 光标在句子内：比较当前句子 vs 原句
        if (activeIssueId && activeIssueNode) {
          const it = issueById.get(activeIssueId);
          if (it) {
            const now = getCurrentSentenceTextByIssueNode(activeIssueNode).trim();
            const orig = it.sentence.trim();

            if (now !== orig) {
              // 第一次变成 modified 才 dim（避免每次输入都 setStyle）
              if (!modifiedIssueIdsRef.current.has(activeIssueId)) {
                modifiedIssueIdsRef.current.add(activeIssueId);
                toDim.push(activeIssueId);
              }
            } else {
              // 改回原句：取消 modified，并恢复样式
              if (modifiedIssueIdsRef.current.has(activeIssueId)) {
                modifiedIssueIdsRef.current.delete(activeIssueId);
                toUndim.push(activeIssueId);
              }
            }
          }
        }

        // ---- 3) 离开句子/点编辑器外：只有仍在 modified 集合里的才 remove
        for (const id of modifiedIssueIdsRef.current) {
          if (!activeIssueId || activeIssueId !== id) {
            toRemove.push(id);
          }
        }

        if (!toDim.length && !toUndim.length && !toRemove.length) return;

        editor.update(() => {
          const root = $getRoot();

          // 收集当前所有 issue nodes
          const issueNodes: any[] = [];
          const walk = (node: LexicalNode) => {
            if ($isSentenceIssueNode(node)) issueNodes.push(node);
            else if ($isElementNode(node)) node.getChildren().forEach(walk);
          };
          root.getChildren().forEach(walk);

          // 1) dim：叹号变淡 + 波浪线变淡（文字不变）
          toDim.forEach((id) => {
            const issueNode = issueNodes.find((x) => x.getPayload().id === id);
            if (!issueNode) return;

            issueNode.getWritable().setModified(true);

            forEachFollowingTextNodes(issueNode, (t) => {
              applyUnderline(t, "rgba(173, 163, 118, 0.4)");
            });
          });

          // 2) undim：叹号恢复 + 波浪线恢复原色（不消失）
          toUndim.forEach((id) => {
            const issueNode = issueNodes.find((x) => x.getPayload().id === id);
            if (!issueNode) return;

            issueNode.getWritable().setModified(false);

            forEachFollowingTextNodes(issueNode, (t) => {
              applyUnderline(t, "#ada376");
            });
          });

          // 3) remove：清掉下划线 + 删除叹号 node + 删除 EndMarker
          toRemove.forEach((id) => {
            const issueNode = issueNodes.find((x) => x.getPayload().id === id);
            if (!issueNode) return;

            forEachFollowingTextNodes(issueNode, (t) => {
              t.setStyle("");
            });

            // 删除 end marker（边界）
            removeEndMarkerAfterIssueNode(issueNode);

            // 删除叹号 node
            issueNode.remove();

            // 这些 map/set 你保留也行（虽然现在 active 不靠 textKey 了）
            issueToTextKeyRef.current.delete(id);
            modifiedIssueIdsRef.current.delete(id);
          });
        });
      });
    });
  }, [editor, issues]);

  // 4) tooltip（保持你原来的不动）
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

        if (!tooltipEl) {
          tooltipEl = document.createElement("div");
          tooltipEl.className = "issueTooltip";
          document.body.appendChild(tooltipEl);
        }

        tooltipEl.textContent = tip;
        tooltipEl.style.opacity = "1";

        const padding = 12;
        const rect = tooltipEl.getBoundingClientRect();
        let x = e.clientX - rect.width / 2;
        let y = e.clientY - rect.height - padding;

        if (x < 8) x = 8;
        if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
        if (y < 8) y = e.clientY + padding;

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

  // 5) click（保持你原来的不动）
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

  // 6) blur（保持你原来的不动）
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
      const nextTarget =
        (e.relatedTarget as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
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
