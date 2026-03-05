import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';
import { Button, Card, IconButton, Input } from '@/components/ui';
import { EditIcon, TrashIcon, PlusIcon } from '@/components/Icons';
import { useStoryStore } from '@/stores/storyStore';
import { useGenerationStore } from '@/stores/generationStore';

interface FramesViewProps {
  onBack: () => void;
  onGenerate: () => void;
}

export function FramesView({ onBack, onGenerate }: FramesViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');

  const { frames, framesLoading, framesError, updateFrame, deleteFrame, addFrame } =
    useStoryStore();
  const { addToQueue } = useGenerationStore();

  // Animate frames on mount
  useEffect(() => {
    if (listRef.current && frames.length > 0) {
      const cards = listRef.current.querySelectorAll('.frame-card');
      anime({
        targets: cards,
        opacity: [0, 1],
        translateX: [-20, 0],
        delay: anime.stagger(80),
        duration: 400,
        easing: 'easeOutCubic',
      });
    }
  }, [frames.length, framesLoading]);

  const handleEdit = (index: number) => {
    const frame = frames.find((f) => f.index === index);
    if (frame) {
      setEditingIndex(index);
      setEditTitle(frame.title);
      setEditPrompt(frame.prompt);
    }
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null) {
      updateFrame(editingIndex, { title: editTitle, prompt: editPrompt });
      setEditingIndex(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditTitle('');
    setEditPrompt('');
  };

  const handleDelete = (index: number) => {
    deleteFrame(index);
  };

  const handleAddFrame = () => {
    const newIndex = frames.length;
    addFrame({
      index: newIndex,
      title: `Frame ${newIndex + 1}`,
      prompt: '',
    });
    handleEdit(newIndex);
  };

  const handleGenerateAll = () => {
    // Add all frames to generation queue
    addToQueue(frames.map((f) => ({ prompt: f.prompt, title: f.title })));
    onGenerate();
  };

  if (framesLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-text-secondary">Generating frames...</span>
      </div>
    );
  }

  if (framesError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <span className="text-red-400">{framesError}</span>
        <Button variant="secondary" onClick={onBack}>
          Back to Chat
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-medium">Story Frames</h2>
            <span className="text-base text-text-secondary">
              {frames.length} frame{frames.length !== 1 ? 's' : ''} generated
            </span>
          </div>
          <Button variant="secondary" onClick={handleAddFrame}>
            <PlusIcon size={16} />
            Add Frame
          </Button>
        </div>

        {/* Frames list */}
        <div ref={listRef} className="flex flex-col gap-3">
          {frames.map((frame) => (
            <Card
              key={frame.index}
              className="frame-card p-4 flex gap-4 hover:border-text-secondary transition-colors"
            >
              {/* Frame number */}
              <div className="w-8 h-8 bg-accent-dim rounded-lg flex items-center justify-center text-base font-semibold flex-shrink-0">
                {frame.index + 1}
              </div>

              {/* Content */}
              {editingIndex === frame.index ? (
                <div className="flex-1 flex flex-col gap-3">
                  <Input
                    placeholder="Frame title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                  />
                  <textarea
                    className="w-full px-4 py-3 bg-bg-card border border-border rounded-lg text-text-primary text-lg placeholder:text-text-secondary focus:outline-none focus:border-text-secondary resize-none min-h-[100px]"
                    placeholder="Frame prompt..."
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveEdit}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <div className="text-lg font-medium mb-1">{frame.title}</div>
                  <div className="text-base text-text-secondary leading-relaxed">
                    {frame.prompt}
                  </div>
                </div>
              )}

              {/* Actions */}
              {editingIndex !== frame.index && (
                <div className="flex gap-2 items-start">
                  <IconButton title="Edit" onClick={() => handleEdit(frame.index)}>
                    <EditIcon className="text-text-secondary" />
                  </IconButton>
                  <IconButton title="Delete" onClick={() => handleDelete(frame.index)}>
                    <TrashIcon className="text-text-secondary" />
                  </IconButton>
                </div>
              )}
            </Card>
          ))}

          {frames.length === 0 && (
            <div className="text-center text-text-secondary py-12">
              No frames yet. Add frames manually or go back to chat to generate them.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-border flex justify-between items-center">
        <Button variant="ghost" onClick={onBack}>
          Back to Chat
        </Button>
        <Button onClick={handleGenerateAll} disabled={frames.length === 0}>
          Generate All Images
        </Button>
      </div>
    </div>
  );
}
