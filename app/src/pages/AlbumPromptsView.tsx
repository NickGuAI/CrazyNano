import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';
import { Button, Card, IconButton, LoadingRing, Toast } from '@/components/ui';
import { EditIcon } from '@/components/Icons';
import { useAlbumStore } from '@/stores/albumStore';
import { getImageUrl } from '@/services/projects';
import { getTargetImageUrl } from '@/services/album';

interface AlbumPromptsViewProps {
  projectId: string;
  onRun: () => void;
  onBack: () => void;
}

export function AlbumPromptsView({ projectId, onRun, onBack }: AlbumPromptsViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    prompts,
    isGeneratingPrompts,
    promptsError,
    promptProgress,
    generatePrompts,
    loadPrompts,
    updatePrompt,
    savePrompts,
  } = useAlbumStore();

  // Load or generate prompts on mount
  useEffect(() => {
    if (prompts.length === 0 && !isGeneratingPrompts) {
      // Try to load existing prompts first
      loadPrompts(projectId).then(() => {
        // If no prompts loaded, generate new ones
        if (prompts.length === 0) {
          generatePrompts(projectId);
        }
      });
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animate prompts on load
  useEffect(() => {
    if (listRef.current && prompts.length > 0 && !isGeneratingPrompts) {
      const cards = listRef.current.querySelectorAll('.prompt-card');
      anime({
        targets: cards,
        opacity: [0, 1],
        translateX: [-20, 0],
        delay: anime.stagger(80),
        duration: 400,
        easing: 'easeOutCubic',
      });
    }
  }, [prompts.length, isGeneratingPrompts]);

  const handleEdit = (stepNum: number) => {
    const prompt = prompts.find((p) => p.step_num === stepNum);
    if (prompt) {
      setEditingStep(stepNum);
      setEditPrompt(prompt.prompt);
    }
  };

  const handleSaveEdit = () => {
    if (editingStep !== null) {
      updatePrompt(editingStep, editPrompt);
      setEditingStep(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingStep(null);
    setEditPrompt('');
  };

  const handleRegenerate = () => {
    generatePrompts(projectId);
  };

  const handleRunTransformation = async () => {
    // Save prompts first
    setIsSaving(true);
    try {
      await savePrompts(projectId);
      onRun();
    } catch {
      setToast('Failed to save prompts');
      setIsSaving(false);
    }
  };

  if (isGeneratingPrompts) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <LoadingRing size={48} />
        <span className="text-text-secondary">{promptProgress || 'Generating prompts...'}</span>
      </div>
    );
  }

  if (promptsError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <span className="text-red-400">{promptsError}</span>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleRegenerate}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {/* Header with images */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-bg-card">
              <img
                src={getImageUrl(projectId, 'IMAGE_0')}
                alt="Initial"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 h-0.5 bg-border relative">
              <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center">
                <span className="bg-bg px-2 text-text-secondary text-sm">
                  {prompts.length} steps
                </span>
              </div>
            </div>
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-bg-card">
              <img
                src={getTargetImageUrl(projectId)}
                alt="Target"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Title */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-medium">Transformation Steps</h2>
              <span className="text-base text-text-secondary">
                Review and edit the prompts before running
              </span>
            </div>
            <Button variant="secondary" onClick={handleRegenerate}>
              Regenerate
            </Button>
          </div>

          {/* Prompts list */}
          <div ref={listRef} className="flex flex-col gap-3">
            {prompts.map((prompt) => (
              <Card
                key={prompt.step_num}
                className="prompt-card p-4 flex gap-4 hover:border-text-secondary transition-colors"
              >
                {/* Step number */}
                <div className="w-8 h-8 bg-accent-dim rounded-lg flex items-center justify-center text-base font-semibold flex-shrink-0">
                  {prompt.step_num}
                </div>

                {/* Content */}
                {editingStep === prompt.step_num ? (
                  <div className="flex-1 flex flex-col gap-3">
                    <textarea
                      className="w-full px-4 py-3 bg-bg-card border border-border rounded-lg text-text-primary text-base placeholder:text-text-secondary focus:outline-none focus:border-text-secondary resize-none min-h-[120px]"
                      placeholder="Enter prompt..."
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveEdit}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 text-base leading-relaxed">{prompt.prompt}</div>
                )}

                {/* Actions */}
                {editingStep !== prompt.step_num && (
                  <IconButton title="Edit" onClick={() => handleEdit(prompt.step_num)}>
                    <EditIcon className="text-text-secondary" />
                  </IconButton>
                )}
              </Card>
            ))}

            {prompts.length === 0 && !isGeneratingPrompts && (
              <div className="text-center text-text-secondary py-12">
                No prompts generated yet.
                <Button variant="secondary" className="ml-3" onClick={handleRegenerate}>
                  Generate Prompts
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-border flex justify-between items-center">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleRunTransformation} disabled={prompts.length === 0 || isSaving}>
          {isSaving ? 'Saving...' : 'Run Transformation'}
        </Button>
      </div>

      <Toast message={toast || ''} isVisible={!!toast} onHide={() => setToast(null)} />
    </div>
  );
}
