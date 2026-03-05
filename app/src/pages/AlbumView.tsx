import { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Card } from '@/components/ui';
import { PlayIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/Icons';
import { getImageUrl } from '@/services/projects';
import { getAlbumPrompts, getAlbumStatus, getTargetImageUrl } from '@/services/album';
import type { AlbumStepPrompt, AlbumStatus } from '@/types';

interface AlbumViewProps {
  projectId: string;
  onBack: () => void;
  onEditPrompts: () => void;
  onTransform: () => void;
}

interface Frame {
  index: number;
  label: string;
  imageUrl: string;
  prompt?: string;
}

const SPEED_OPTIONS = [
  { value: 500, label: '0.5s' },
  { value: 1000, label: '1s' },
  { value: 1500, label: '1.5s' },
  { value: 2000, label: '2s' },
];

export function AlbumView({ projectId, onEditPrompts, onTransform }: AlbumViewProps) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1500);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AlbumStatus | null>(null);

  const playIntervalRef = useRef<number | null>(null);

  // Load album data on mount
  useEffect(() => {
    async function loadAlbum() {
      try {
        setLoading(true);
        setError(null);

        // Fetch status and prompts in parallel
        const [albumStatus, prompts] = await Promise.all([
          getAlbumStatus(projectId),
          getAlbumPrompts(projectId),
        ]);

        setStatus(albumStatus);

        // Build frames array
        const frameList: Frame[] = [];

        // Initial image (IMAGE_0)
        frameList.push({
          index: 0,
          label: 'Initial',
          imageUrl: getImageUrl(projectId, 'IMAGE_0'),
          prompt: undefined,
        });

        // Step images (IMAGE_1 to IMAGE_N)
        for (let i = 1; i <= albumStatus.images_generated; i++) {
          const prompt = prompts.find((p: AlbumStepPrompt) => p.step_num === i);
          frameList.push({
            index: i,
            label: `Step ${i}`,
            imageUrl: getImageUrl(projectId, `IMAGE_${i}`),
            prompt: prompt?.prompt,
          });
        }

        // Target image (last)
        frameList.push({
          index: frameList.length,
          label: 'Target',
          imageUrl: getTargetImageUrl(projectId),
          prompt: undefined,
        });

        setFrames(frameList);
      } catch (err) {
        console.error('[AlbumView] Error loading album:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadAlbum();
  }, [projectId]);

  // Auto-play logic
  useEffect(() => {
    if (isPlaying && frames.length > 1) {
      playIntervalRef.current = window.setInterval(() => {
        setSelectedIndex((prev) => (prev + 1) % frames.length);
      }, playSpeed);
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, playSpeed, frames.length]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        setIsPlaying(false);
      } else if (e.key === 'ArrowRight') {
        setSelectedIndex((prev) => Math.min(frames.length - 1, prev + 1));
        setIsPlaying(false);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [frames.length]);

  const handlePrev = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
    setIsPlaying(false);
  }, []);

  const handleNext = useCallback(() => {
    setSelectedIndex((prev) => Math.min(frames.length - 1, prev + 1));
    setIsPlaying(false);
  }, [frames.length]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const currentFrame = frames[selectedIndex];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-text-secondary">Loading album...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <span className="text-red-400">{error}</span>
        <Button variant="secondary" onClick={onTransform}>
          Run Transformation
        </Button>
      </div>
    );
  }

  // Check if album has generated images
  if (status && status.images_generated === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <span className="text-text-secondary">No images generated yet</span>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onEditPrompts}>
            Edit Prompts
          </Button>
          <Button onClick={onTransform}>Run Transformation</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Large Preview */}
          <div className="mb-6">
            <Card className="p-4">
              <div className="aspect-video bg-bg-card rounded-lg overflow-hidden flex items-center justify-center mb-4">
                {currentFrame && (
                  <img
                    src={currentFrame.imageUrl}
                    alt={currentFrame.label}
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </div>
              {/* Frame info */}
              <div className="text-center">
                <div className="text-lg font-medium mb-1">{currentFrame?.label}</div>
                {currentFrame?.prompt && (
                  <p className="text-text-secondary text-sm max-w-2xl mx-auto">
                    {currentFrame.prompt}
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Timeline Strip */}
          <div className="mb-6">
            <h3 className="text-base font-medium mb-3">Transformation Timeline</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {frames.map((frame, idx) => (
                <button
                  key={frame.index}
                  onClick={() => {
                    setSelectedIndex(idx);
                    setIsPlaying(false);
                  }}
                  className={`flex-shrink-0 w-20 group ${
                    idx === selectedIndex ? 'ring-2 ring-accent rounded-lg' : ''
                  }`}
                >
                  <div className="aspect-square bg-bg-card rounded-lg overflow-hidden mb-1">
                    <img
                      src={frame.imageUrl}
                      alt={frame.label}
                      className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                    />
                  </div>
                  <span className="text-xs text-text-secondary block text-center">
                    {frame.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <Button variant="ghost" onClick={handlePrev} disabled={selectedIndex === 0}>
              <ChevronLeftIcon />
            </Button>
            <Button onClick={togglePlay} className="w-24">
              {isPlaying ? (
                <>
                  <PauseIcon className="mr-2" size={16} />
                  Pause
                </>
              ) : (
                <>
                  <PlayIcon className="mr-2" size={16} />
                  Play
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={handleNext}
              disabled={selectedIndex === frames.length - 1}
            >
              <ChevronRightIcon />
            </Button>
            <div className="ml-4 flex items-center gap-2">
              <span className="text-sm text-text-secondary">Speed:</span>
              <select
                value={playSpeed}
                onChange={(e) => setPlaySpeed(Number(e.target.value))}
                className="bg-bg-card border border-border rounded px-2 py-1 text-sm"
              >
                {SPEED_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={onEditPrompts}>
              Edit Prompts
            </Button>
            <Button variant="secondary" onClick={onTransform}>
              Regenerate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
