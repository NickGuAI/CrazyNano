import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';
import { Button, Badge, Progress, LoadingRing } from '@/components/ui';
import { useGenerationStore } from '@/stores/generationStore';
import { useProjectStore } from '@/stores/projectStore';
import { getImageUrl } from '@/services/projects';
import type { Provider } from '@/types';

interface GenerationViewProps {
  projectId: string;
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'poe', label: 'POE' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'grok-2', label: 'Grok-2' },
];

interface QueueItem {
  id: string;
  title: string;
  similarity?: number;
  status: string;
}

function FaceScoresPanel({ queue, faceThreshold }: { queue: QueueItem[]; faceThreshold: number }) {
  const scores = queue.filter((item) => item.similarity !== undefined).map((item) => item.similarity!);

  if (scores.length === 0) return null;

  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const passCount = scores.filter((s) => s >= faceThreshold).length;
  const failCount = scores.filter((s) => s < faceThreshold).length;

  return (
    <div className="mt-3 space-y-2">
      {/* Summary */}
      <div className="text-xs text-text-secondary grid grid-cols-2 gap-1">
        <span>Avg: {(avgScore * 100).toFixed(0)}%</span>
        <span>Min: {(minScore * 100).toFixed(0)}%</span>
        <span>Max: {(maxScore * 100).toFixed(0)}%</span>
        <span>Pass: {passCount} / Fail: {failCount}</span>
      </div>

      {/* Individual scores */}
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {queue.map((item, idx) => (
          item.similarity !== undefined && (
            <div key={item.id} className="flex justify-between text-xs">
              <span className="text-text-secondary truncate flex-1">
                {idx > 0 ? `Step ${idx-1} → ${idx}` : 'Initial'}
              </span>
              <span className={item.similarity >= faceThreshold ? 'text-green-400' : 'text-red-400'}>
                {(item.similarity * 100).toFixed(0)}%
                {item.similarity >= faceThreshold ? ' ✓' : ' ✗'}
              </span>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

export function GenerationView({ projectId }: GenerationViewProps) {
  const queueRef = useRef<HTMLDivElement>(null);
  const [showFaceScores, setShowFaceScores] = useState(false);

  const {
    provider,
    enableFaceValidation,
    faceThreshold,
    maxRetries,
    queue,
    currentIndex,
    isGenerating,
    generationError,
    currentProgress,
    lastSimilarity,
    setProvider,
    setFaceValidation,
    setMaxRetries,
    startGeneration,
    retryItem,
    cancelGeneration,
  } = useGenerationStore();

  const { currentProject } = useProjectStore();

  // Animate queue items on mount
  useEffect(() => {
    if (queueRef.current && queue.length > 0) {
      const items = queueRef.current.querySelectorAll('.queue-item');
      anime({
        targets: items,
        opacity: [0, 1],
        scale: [0.95, 1],
        delay: anime.stagger(100),
        duration: 400,
        easing: 'easeOutCubic',
      });
    }
  }, [queue.length]);

  // Start generation when queue is populated and not already generating
  useEffect(() => {
    if (queue.length > 0 && !isGenerating && currentIndex === 0) {
      // Get all completed image IDs as context
      const contextIds = currentProject?.images.map((img) => img.id) || [];
      startGeneration(projectId, contextIds);
    }
  }, [queue.length, isGenerating, currentIndex, projectId, currentProject, startGeneration]);

  const currentItem = queue[currentIndex];
  const completedCount = queue.filter((item) => item.status === 'complete').length;
  const progressPercent = queue.length > 0 ? (completedCount / queue.length) * 100 : 0;

  // Get the current/latest completed image to display
  const displayImageId = currentItem?.imageId ||
    queue.slice().reverse().find((item) => item.imageId)?.imageId;

  return (
    <div className="flex-1 flex">
      {/* Sidebar - Queue */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
            Generation Queue
          </h3>
        </div>

        <div ref={queueRef} className="flex-1 overflow-y-auto p-3">
          {queue.map((item, index) => (
            <div
              key={item.id}
              className={`queue-item p-3 rounded-lg mb-2 transition-colors ${
                index === currentIndex
                  ? 'bg-bg-card border border-text-secondary'
                  : 'hover:bg-bg-card'
              }`}
            >
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-base font-medium">{item.title}</span>
                <div className="flex items-center gap-2">
                  <Badge status={item.status} />
                  {item.status === 'failed' && !isGenerating && (
                    <button
                      onClick={() => {
                        const contextIds = currentProject?.images.map((img) => img.id) || [];
                        retryItem(item.id, projectId, contextIds);
                      }}
                      className="px-2 py-0.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                      title="Retry this step"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
              <div className="text-sm text-text-secondary line-clamp-2">
                {item.prompt}
              </div>
              {item.provider && (
                <div className="text-xs text-text-secondary mt-1">
                  Provider: {item.provider}
                </div>
              )}
              {item.similarity !== undefined && (
                <div className="text-xs text-text-secondary">
                  Face: {(item.similarity * 100).toFixed(0)}%
                </div>
              )}
            </div>
          ))}

          {queue.length === 0 && (
            <div className="text-center text-text-secondary py-8">
              No items in queue
            </div>
          )}
        </div>

        {/* Face Scores Panel */}
        {queue.some((item) => item.similarity !== undefined) && (
          <div className="border-t border-border p-3">
            <button
              onClick={() => setShowFaceScores(!showFaceScores)}
              className="w-full text-left text-sm font-medium text-text-secondary hover:text-text-primary flex justify-between items-center"
            >
              <span>Face Scores</span>
              <span>{showFaceScores ? '▼' : '▶'}</span>
            </button>
            {showFaceScores && (
              <FaceScoresPanel queue={queue} faceThreshold={faceThreshold} />
            )}
          </div>
        )}
      </div>

      {/* Main - Preview & Controls */}
      <div className="flex-1 flex flex-col">
        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center p-10">
          <div className="max-w-full max-h-full w-[400px] aspect-square bg-bg-card rounded-lg flex items-center justify-center relative overflow-hidden">
            {isGenerating && !displayImageId ? (
              <LoadingRing size={60} />
            ) : displayImageId ? (
              <img
                src={getImageUrl(projectId, displayImageId)}
                alt="Generated"
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-text-secondary text-lg">
                {queue.length > 0 ? 'Ready to generate' : 'Add frames to generate'}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="p-5 border-t border-border">
          <div className="flex justify-between items-center mb-3">
            {/* Provider selection */}
            <div className="flex gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                    provider === p.value
                      ? 'border-text-secondary text-text-primary'
                      : 'border-border text-text-secondary hover:border-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => setProvider(p.value)}
                  disabled={isGenerating}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Status & Actions */}
            <div className="flex gap-3 items-center">
              {currentProgress && (
                <span className="text-sm text-text-secondary">{currentProgress}</span>
              )}
              {lastSimilarity !== null && (
                <span className="text-sm text-text-secondary">
                  Face: {(lastSimilarity * 100).toFixed(0)}%
                </span>
              )}
              {generationError && (
                <span className="text-sm text-red-400">{generationError}</span>
              )}
              {isGenerating ? (
                <Button variant="secondary" onClick={cancelGeneration}>
                  Cancel
                </Button>
              ) : queue.length > 0 && completedCount < queue.length ? (
                <Button onClick={() => {
                  const contextIds = currentProject?.images.map((img) => img.id) || [];
                  startGeneration(projectId, contextIds);
                }}>
                  {completedCount > 0 ? 'Continue' : 'Start'}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Face validation toggle */}
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableFaceValidation}
                onChange={(e) => setFaceValidation(e.target.checked)}
                disabled={isGenerating}
                className="w-4 h-4 accent-text-primary"
              />
              <span className="text-sm text-text-secondary">Face validation</span>
            </label>
            {enableFaceValidation && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-secondary">Threshold:</span>
                  <input
                    type="range"
                    min="0.5"
                    max="0.99"
                    step="0.01"
                    value={faceThreshold}
                    onChange={(e) => useGenerationStore.getState().setFaceThreshold(parseFloat(e.target.value))}
                    disabled={isGenerating}
                    className="w-24"
                  />
                  <span className="text-sm text-text-primary">{(faceThreshold * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-secondary">Max retries:</span>
                  <select
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                    disabled={isGenerating}
                    className="bg-bg-card border border-border rounded px-2 py-1 text-sm"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Progress bar */}
          {queue.length > 0 && (
            <div>
              <div className="flex justify-between text-sm text-text-secondary mb-1">
                <span>Progress</span>
                <span>{completedCount}/{queue.length}</span>
              </div>
              <Progress value={progressPercent} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
