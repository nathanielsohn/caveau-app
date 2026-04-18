"use client";

import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Send, Sparkles, X } from "lucide-react";
import type { TierSlug } from "@/lib/tiers";

interface ChatClientProps {
  memberName: string;
  tierSlug: TierSlug;
}

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatError = { kind: "config" | "rate" | "network"; text: string };

const STARTER_PROMPTS = [
  "What's my best exit opportunity right now?",
  "How am I tracking vs the Liv-ex 100?",
  "I'm grilling ribeye tonight — what should I open?",
  "Which bottles are closest to peak right now?",
];

// Matches the seven tools exposed by src/lib/advisor-dispatch.ts. A future
// tool added server-side will fall back to the raw name until this map picks
// it up — surfaces the gap rather than silently labeling it "Unknown".
const TOOL_LABELS: Record<string, string> = {
  getMemberPortfolio: "Checking your portfolio",
  getLivexPriceHistory: "Pulling Liv-ex price history",
  getActiveAlerts: "Reviewing your Sentinel alerts",
  getCCRList: "Looking up your CCRs",
  getTierDetails: "Reviewing your tier benefits",
  getWineDetail: "Getting bottle details",
  getLivexBenchmark: "Pulling Liv-ex 100 benchmark",
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/**
 * Render advisor text with paragraph breaks and **bold** spans. Pure React —
 * no dangerouslySetInnerHTML, no markdown lib. The advisor prompt only
 * authorizes bold emphasis (for bottle names) and plain paragraphs, so we
 * deliberately do not parse other markdown.
 */
function renderAdvisorText(text: string) {
  return text.split("\n\n").map((para, i) => {
    const parts = para.split(/\*\*(.+?)\*\*/g);
    return (
      <p key={i} className={i > 0 ? "mt-2" : undefined}>
        {parts.map((p, j) =>
          j % 2 === 1 ? (
            <strong key={j} className="text-primary font-semibold">
              {p}
            </strong>
          ) : (
            p
          ),
        )}
      </p>
    );
  });
}

export default function ChatClient({ memberName, tierSlug }: ChatClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [toolsInFlight, setToolsInFlight] = useState<string[]>([]);
  const [error, setError] = useState<ChatError | null>(null);
  const [input, setInput] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // True while the user is pinned near the bottom. Flipped to false the
  // moment they scroll up so new tokens don't yank them back.
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, toolsInFlight, error]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const firstName = memberName.split(" ")[0] || "Welcome";
  const memberInitial = (firstName.charAt(0) || "M").toUpperCase();

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
        // Placeholder assistant bubble so tool-use pills have a home even
        // when the model's first action is a tool call (no text yet).
        // Trimmed in `finally` if no content ever lands.
        { role: "assistant", content: "" },
      ];
      setMessages(nextMessages);
      setInput("");
      // Reset textarea height after clearing
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setStreaming(true);
      stickToBottomRef.current = true;

      const controller = new AbortController();
      abortRef.current = controller;

      // Body sends only the real conversation turns — never the empty
      // placeholder — so the server's message count matches what the model
      // expects.
      const bodyMessages = nextMessages.slice(0, -1);

      try {
        const response = await fetch("/api/advisor/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: bodyMessages }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          setError({
            kind: "rate",
            text: "You've reached the chat rate limit (20 per hour). Please try again soon.",
          });
          return;
        }

        if (response.status === 503) {
          setError({
            kind: "config",
            text: "The advisor is currently unavailable. Please try again later.",
          });
          return;
        }

        // Defensive: if the middleware redirected us (e.g. the session
        // expired mid-chat) fetch would have silently followed to an HTML
        // page. Only proceed when we actually got an event-stream back.
        const contentType = response.headers.get("content-type") ?? "";
        if (
          !response.ok ||
          !response.body ||
          !contentType.includes("text/event-stream")
        ) {
          setError({
            kind: "network",
            text: "The advisor connection was interrupted. Refresh and try again.",
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (!frame.startsWith("data: ")) continue;
            const payload = frame.slice(6);
            let event: { type?: string; text?: string; name?: string; message?: string };
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }

            if (event.type === "text" && typeof event.text === "string") {
              const delta = event.text;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: last.content + delta },
                  ];
                }
                return [...prev, { role: "assistant", content: delta }];
              });
            } else if (event.type === "tool_use" && typeof event.name === "string") {
              const name = event.name;
              setToolsInFlight((prev) =>
                prev.includes(name) ? prev : [...prev, name],
              );
            } else if (event.type === "done") {
              setToolsInFlight([]);
            } else if (event.type === "error") {
              setError({
                kind: "network",
                text: "The advisor connection was interrupted. Refresh and try again.",
              });
            }
          }
        }
      } catch (err) {
        if ((err as Error | null)?.name === "AbortError") return;
        setError({
          kind: "network",
          text: "The advisor connection was interrupted. Refresh and try again.",
        });
      } finally {
        setStreaming(false);
        setToolsInFlight([]);
        // Trim the empty assistant placeholder if nothing ever landed
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.content === "") {
            return prev.slice(0, -1);
          }
          return prev;
        });
        abortRef.current = null;
      }
    },
    [messages, streaming],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const onTextareaKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  const autoGrow = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 144)}px`;
  };

  return (
    <div
      className="flex flex-col h-[calc(100vh-4rem-env(safe-area-inset-bottom))] md:h-screen"
      data-tier={tierSlug}
    >
      <header className="shrink-0 px-4 md:px-8 py-4 border-b border-[#2A2A30]/40">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <Sparkles size={18} className="text-gold" />
          <h1 className="font-serif text-xl text-primary">AI Advisor</h1>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 md:px-8 py-6"
      >
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !error && (
            <div className="text-center pt-4 md:pt-16">
              <div className="text-burgundy text-4xl mb-4">◈</div>
              <h2 className="font-serif text-2xl md:text-3xl text-primary mb-3">
                Welcome, {firstName}.
              </h2>
              <p className="text-secondary text-sm md:text-base max-w-xl mx-auto mb-8">
                I&apos;m your Caveau AI Advisor — ask me anything about your
                collection, pricing, alerts, tier, pairings, or what to pour
                tonight.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void send(prompt)}
                    disabled={streaming}
                    className="px-4 py-3 rounded-xl bg-[#141416]/80 border border-[#2A2A30]/60 hover:border-gold/40 text-left text-sm text-secondary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isLastAssistant =
              m.role === "assistant" && i === messages.length - 1;
            const showToolPills =
              isLastAssistant && streaming && toolsInFlight.length > 0;
            return (
              <MessageBubble
                key={i}
                message={m}
                memberInitial={memberInitial}
                showToolPills={showToolPills}
                tools={toolsInFlight}
              />
            );
          })}

          {error && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-danger/30 bg-danger/10">
              <p className="flex-1 text-sm text-danger">{error.text}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss"
                className="shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center text-danger/70 hover:text-danger"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="shrink-0 px-4 md:px-8 py-3 border-t border-[#2A2A30]/40 bg-caveau-black/80 backdrop-blur">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoGrow();
              }}
              onKeyDown={onTextareaKeyDown}
              disabled={streaming}
              placeholder="Ask the advisor…"
              aria-label="Ask the advisor"
              rows={1}
              className="flex-1 resize-none px-4 py-3 rounded-xl bg-[#0F0F11] border border-[#2A2A30] text-sm text-primary placeholder-muted focus:border-gold/60 focus:outline-none disabled:opacity-50"
              style={{ maxHeight: "144px" }}
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="Send"
              className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-gold text-caveau-black hover:bg-gold-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
          <p className="text-[11px] italic text-muted mt-2 leading-snug">
            Estimates only — not financial, legal, or tax advice. The Caveau
            Advisor cites tool-grounded data but can be wrong. Consult your
            advisor for decisions.
          </p>
        </div>
      </footer>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  memberInitial: string;
  showToolPills: boolean;
  tools: string[];
}

function MessageBubble({
  message,
  memberInitial,
  showToolPills,
  tools,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="shrink-0">
        {isUser ? (
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gold/10 text-gold text-sm font-medium">
            {memberInitial}
          </div>
        ) : (
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-burgundy/10 text-burgundy text-base">
            ◈
          </div>
        )}
      </div>
      <div
        className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-[#1C1C20]/80 border border-[#2A2A30]/50 text-primary"
            : "bg-[#141416]/80 border border-[#2A2A30]/50 text-secondary"
        }`}
      >
        {message.content ? (
          isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div>{renderAdvisorText(message.content)}</div>
          )
        ) : null}
        {showToolPills && (
          <div
            className={`flex flex-wrap gap-2 ${message.content ? "mt-3" : ""}`}
          >
            {tools.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-burgundy/10 border border-burgundy/30 text-xs text-burgundy"
              >
                <span className="w-2.5 h-2.5 rounded-full border-2 border-burgundy/30 border-t-burgundy animate-spin" />
                {toolLabel(name)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
