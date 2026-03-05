import { useEffect, useRef } from 'react';
import anime from 'animejs';
import { Button, Card, Progress, LoadingRing } from '@/components/ui';
import { useAlbumStore } from '@/stores/albumStore';
import { useProjectStore } from '@/stores/projectStore';
import { getImageUrl } from '@/services/projects';
import { getTargetImageUrl } from '@/services/album';
import type { Provider } from '@/types';

interface AlbumProgressViewProps {
  projectId: string;
  onBack: () => void;
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'poe', label: 'POE' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'grok-2', label: 'Grok-2' },
];

interface AlbumStep {
  stepNum: number;
  status: string;
  similarity?: number | null;
}

function FaceScoresSummary({ steps, faceThreshold }: { steps: AlbumStep[]; faceThreshold: number }) {
  const scores = steps
    .filter((s) => s.status === 'complete' && s.similarity !== undefined && s.similarity !== null)
    .map((s) => s.similarity!);

  if (scores.length === 0) return null;

  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const passCount = scores.filter((s) => s >= faceThreshold).length;
  const failCount = scores.filter((s) => s < faceThreshold).length;

  return (
    <Card className="p-4 mb-6">
      <h4 className="text-sm font-medium mb-3">Face Similarity Summary</h4>
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold">{(avgScore * 100).toFixed(0)}%</div>
          <div className="text-xs text-text-secondary">Average</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-400">{(minScore * 100).toFixed(0)}%</div>
          <div className="text-xs text-text-secondary">Minimum</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-400">{(maxScore * 100).toFixed(0)}%</div>
          <div className="text-xs text-text-secondary">Maximum</div>
        </div>
        <div>
          <div className="text-2xl font-bold">
            <span className="text-green-400">{passCount}</span>
            <span className="text-text-secondary">/</span>
            <span className="text-red-400">{failCount}</span>
          </div>
          <div className="text-xs text-text-secondary">Pass/Fail</div>
        </div>
      </div>
    </Card>
  );
}

export function AlbumProgressView({ projectId, onBack }: AlbumProgressViewProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const {
    steps,
    isRunning,
    currentStep,
    runError,
    provider,
    enableFaceValidation,
    faceThreshold,
    maxRetries,
    runTransformation,
    retryStep,
    cancelRun,
    setProvider,
    setFaceValidation,
    setFaceThreshold,
    setMaxRetries,
    loadPrompts,
    initFromPrompts,
    prompts,
  } = useAlbumStore();

  const { fetchProject } = useProjectStore();

  // Load prompts if not loaded
  useEffect(() => {
    if (prompts.length === 0) {
      loadPrompts(projectId).then(() => {
        // Re-fetch to get updated prompts
        const { prompts: loadedPrompts } = useAlbumStore.getState();
        if (loadedPrompts.length > 0) {
          initFromPrompts(loadedPrompts);
        }
      });
    } else if (steps.length === 0) {
      initFromPrompts(prompts);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animate completed images
  useEffect(() => {
    if (gridRef.current) {
      const completedCards = gridRef.current.querySelectorAll('.step-complete');
      anime({
        targets: completedCards,
        scale: [0.9, 1],
        opacity: [0.5, 1],
        duration: 300,
        easing: 'easeOutCubic',
      });
    }
  }, [steps]);

  const handleStart = (startOver: boolean = false) => {
    console.log('[handleStart] Button clicked, projectId:', projectId, 'startOver:', startOver);
    console.log('[handleStart] Current steps:', steps.length, 'isRunning:', isRunning);
    runTransformation(projectId, startOver);
    console.log('[handleStart] runTransformation called');
  };

  const handleRefresh = () => {
    fetchProject(projectId);
  };

  const completedSteps = steps.filter((s) => s.status === 'complete').length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const isComplete = completedSteps === totalSteps && totalSteps > 0;

  return (
    <div className="flex-1 flex flex-col">
      {/* Controls Header */}
      <div className="p-4 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Provider Selection */}
            <div className="flex gap-1">
              {PROVIDERS.map((p) => (
                <Button
                  key={p.value}
                  variant={provider === p.value ? 'primary' : 'ghost'}
                  onClick={() => setProvider(p.value)}
                  disabled={isRunning}
                  className="text-sm px-3 py-1"
                >
                  {p.label}
                </Button>
              ))}
            </div>

            {/* Face Validation Toggle */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableFaceValidation}
                  onChange={(e) => setFaceValidation(e.target.checked)}
                  disabled={isRunning}
                  className="w-4 h-4"
                />
                <span className="text-sm">Face Validation</span>
              </label>
              {enableFaceValidation && (
                <>
                  <input
                    type="range"
                    min="0.5"
                    max="0.99"
                    step="0.01"
                    value={faceThreshold}
                    onChange={(e) => setFaceThreshold(parseFloat(e.target.value))}
                    disabled={isRunning}
                    className="w-20"
                    title={`Threshold: ${(faceThreshold * 100).toFixed(0)}%`}
                  />
                  <span className="text-xs text-text-secondary">{(faceThreshold * 100).toFixed(0)}%</span>
                  <select
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                    disabled={isRunning}
                    className="bg-bg-card border border-border rounded px-2 py-1 text-xs"
                    title="Max retries"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} retry</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {isRunning ? (
              <Button variant="secondary" onClick={cancelRun}>
                Cancel
              </Button>
            ) : isComplete ? (
              <>
                <Button variant="ghost" onClick={() => handleStart(true)}>
                  Start Over
                </Button>
                <Button variant="secondary" onClick={handleRefresh}>
                  View in Gallery
                </Button>
              </>
            ) : completedSteps > 0 ? (
              <>
                <Button variant="ghost" onClick={() => handleStart(true)}>
                  Start Over
                </Button>
                <Button onClick={() => handleStart(false)} disabled={steps.length === 0}>
                  Continue
                </Button>
              </>
            ) : (
              <Button onClick={() => handleStart(false)} disabled={steps.length === 0}>
                Start Transformation
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {(isRunning || completedSteps > 0) && (
        <div className="px-6 py-3 bg-bg-card border-b border-border">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">
                {isRunning ? `Step ${currentStep} of ${totalSteps}` : `${completedSteps}/${totalSteps} complete`}
              </span>
              <span className="text-sm font-medium">{progress.toFixed(0)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        </div>
      )}

      {/* Error Display */}
      {runError && (
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/30">
          <div className="max-w-4xl mx-auto text-red-400">{runError}</div>
        </div>
      )}

      {/* Main Content - Image Grid */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Source Images */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1">
              <span className="text-sm text-text-secondary block mb-2">Initial</span>
              <div className="aspect-square rounded-lg overflow-hidden bg-bg-card">
                <img
                  src={getImageUrl(projectId, 'IMAGE_0')}
                  alt="Initial"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="flex-1">
              <span className="text-sm text-text-secondary block mb-2">Target</span>
              <div className="aspect-square rounded-lg overflow-hidden bg-bg-card">
                <img
                  src={getTargetImageUrl(projectId)}
                  alt="Target"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Face Scores Summary */}
          <FaceScoresSummary steps={steps} faceThreshold={faceThreshold} />

          {/* Transformation Steps */}
          <h3 className="text-lg font-medium mb-4">Transformation Steps</h3>
          <div ref={gridRef} className="grid grid-cols-3 gap-4">
            {steps.map((step) => (
              <Card
                key={step.stepNum}
                className={`p-3 ${step.status === 'complete' ? 'step-complete' : ''}`}
              >
                {/* Image Preview */}
                <div className="aspect-square rounded-lg overflow-hidden bg-bg-card mb-3 relative">
                  {step.status === 'complete' && step.imageId ? (
                    <img
                      src={getImageUrl(projectId, step.imageId)}
                      alt={`Step ${step.stepNum}`}
                      className="w-full h-full object-cover"
                    />
                  ) : step.status === 'generating' ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <LoadingRing size={32} />
                    </div>
                  ) : step.status === 'error' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-red-400 text-sm text-center p-2">
                      <span>{step.error || 'Error'}</span>
                      {!isRunning && (
                        <button
                          onClick={() => retryStep(projectId, step.stepNum)}
                          className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs transition-colors"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-secondary">
                      Step {step.stepNum}
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-2 left-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      step.status === 'complete' ? 'bg-green-500/20 text-green-400'
                        : step.status === 'generating' ? 'bg-yellow-500/20 text-yellow-400'
                        : step.status === 'error' ? 'bg-red-500/20 text-red-400'
                        : 'bg-accent-dim text-text-primary'
                    }`}>
                      Step {step.stepNum}
                    </span>
                  </div>
                </div>

                {/* Step Info */}
                <div className="text-sm">
                  {step.status === 'complete' && (
                    <div className="flex justify-between text-text-secondary">
                      <span>{step.provider}</span>
                      {step.similarity !== null && step.similarity !== undefined && (
                        <span>{(step.similarity * 100).toFixed(0)}% match</span>
                      )}
                    </div>
                  )}
                  {step.status === 'pending' && (
                    <span className="text-text-secondary">Waiting...</span>
                  )}
                  {step.status === 'generating' && (
                    <span className="text-accent">Generating...</span>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {steps.length === 0 && (
            <div className="text-center text-text-secondary py-12">
              No transformation steps defined. Go back to generate prompts first.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-border flex justify-between items-center">
        <Button variant="ghost" onClick={onBack} disabled={isRunning}>
          Back to Prompts
        </Button>
        {isComplete && (
          <span className="text-green-400 font-medium">Transformation Complete!</span>
        )}
      </div>
    </div>
  );
}
