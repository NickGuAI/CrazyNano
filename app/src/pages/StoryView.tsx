import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import anime from 'animejs';
import { Button, TypingIndicator } from '@/components/ui';
import { SendIcon } from '@/components/Icons';
import { useStoryStore } from '@/stores/storyStore';
import { useProjectStore } from '@/stores/projectStore';
import { request } from '@/services/api';

interface StoryViewProps {
  projectId: string;
  onGenerateFrames: () => void;
}

export function StoryView({ projectId, onGenerateFrames }: StoryViewProps) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [storyProviderName, setStoryProviderName] = useState('AI');

  const { currentProject } = useProjectStore();

  useEffect(() => {
    request<{ provider: string }>('/settings/story-provider')
      .then((data) => {
        const name = data.provider === 'gemini' ? 'Gemini' : data.provider === 'grok' ? 'Grok' : data.provider;
        setStoryProviderName(name);
      })
      .catch(() => {});
  }, []);

  const {
    messages,
    isStreaming,
    currentResponse,
    chatError,
    sendMessage,
    cancelStream,
  } = useStoryStore();

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, currentResponse]);

  // Animate new messages
  useEffect(() => {
    if (messagesRef.current && messages.length > 0) {
      const lastMessage = messagesRef.current.querySelector('.message:last-child');
      if (lastMessage) {
        anime({
          targets: lastMessage,
          opacity: [0, 1],
          translateY: [10, 0],
          duration: 300,
          easing: 'easeOutCubic',
        });
      }
    }
  }, [messages.length]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;
    sendMessage(text, projectId);
    setInputValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  // Get full conversation for plot generation
  const getPlotFromConversation = () => {
    return messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .join('\n\n');
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col max-w-[800px] w-full mx-auto p-6">
        {/* Messages */}
        <div ref={messagesRef} className="flex-1 overflow-y-auto flex flex-col gap-5 pb-5">
          {/* Initial AI greeting */}
          {messages.length === 0 && !isStreaming && (
            <div className="message flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-text-primary text-bg flex items-center justify-center text-lg flex-shrink-0">
                G
              </div>
              <div className="flex-1">
                <div className="text-base font-medium mb-1">{storyProviderName}</div>
                <div className="text-lg text-text-secondary leading-relaxed">
                  Hello! I'm here to help you brainstorm your story. Tell me about the
                  world, characters, or plot you have in mind. What kind of story do you
                  want to create?
                </div>
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <div key={i} className="message flex gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
                  msg.role === 'assistant'
                    ? 'bg-text-primary text-bg'
                    : 'bg-bg-card text-text-primary'
                }`}
              >
                {msg.role === 'assistant' ? 'G' : 'Y'}
              </div>
              <div className="flex-1">
                <div className="text-base font-medium mb-1">
                  {msg.role === 'assistant' ? storyProviderName : 'You'}
                </div>
                <div className="text-lg text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {isStreaming && (
            <div className="message flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-text-primary text-bg flex items-center justify-center text-lg flex-shrink-0">
                G
              </div>
              <div className="flex-1">
                <div className="text-base font-medium mb-1">{storyProviderName}</div>
                {currentResponse ? (
                  <div className="text-lg text-text-secondary leading-relaxed whitespace-pre-wrap">
                    {currentResponse}
                    <span className="animate-pulse">▌</span>
                  </div>
                ) : (
                  <TypingIndicator />
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {chatError && (
            <div className="text-red-400 text-base p-3 bg-red-400/10 rounded-lg">
              Error: {chatError}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="pt-5 border-t border-border">
          {messages.length >= 2 && !isStreaming && (
            <div className="mb-3 flex justify-end">
              <Button onClick={() => {
                const plot = getPlotFromConversation();
                if (plot) {
                  useStoryStore.getState().generateFramesFromPlot(plot, 5, currentProject?.book_style);
                  onGenerateFrames();
                }
              }}>
                Generate Frames
              </Button>
            </div>
          )}

          <div className="flex gap-3 bg-bg-card border border-border rounded-lg p-3 focus-within:border-text-secondary transition-colors">
            <textarea
              ref={inputRef}
              className="flex-1 bg-transparent border-none outline-none text-text-primary text-lg resize-none min-h-[24px] max-h-[120px] placeholder:text-text-secondary"
              placeholder="Describe your story idea..."
              rows={1}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button
                className="w-9 h-9 rounded-lg bg-text-secondary flex items-center justify-center transition-transform hover:scale-105"
                onClick={cancelStream}
              >
                <span className="w-4 h-4 bg-bg rounded-sm" />
              </button>
            ) : (
              <button
                className="w-9 h-9 rounded-lg bg-text-primary flex items-center justify-center transition-transform hover:scale-105 disabled:opacity-50"
                onClick={handleSend}
                disabled={!inputValue.trim()}
              >
                <SendIcon className="text-bg" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
