import { useRef, useState, useCallback } from 'react';
import { Button, Card, Input, Toast } from '@/components/ui';
import { ImageIcon, PlusIcon } from '@/components/Icons';
import { useAlbumStore } from '@/stores/albumStore';

interface AlbumSetupViewProps {
  onComplete: (projectId: string) => void;
  onBack: () => void;
}

export function AlbumSetupView({ onComplete, onBack }: AlbumSetupViewProps) {
  const {
    albumName,
    initialImage,
    targetImage,
    numSteps,
    setInitialImage,
    setTargetImage,
    setNumSteps,
    createAlbumProject,
  } = useAlbumStore();

  const initialInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);
  const [projectName, setProjectName] = useState(albumName);
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (type: 'initial' | 'target') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (type === 'initial') {
          setInitialImage(dataUrl);
        } else {
          setTargetImage(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    },
    [setInitialImage, setTargetImage]
  );

  const handleDrop = useCallback(
    (type: 'initial' | 'target') => (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (type === 'initial') {
          setInitialImage(dataUrl);
        } else {
          setTargetImage(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    },
    [setInitialImage, setTargetImage]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCreate = async () => {
    if (!projectName.trim() || !initialImage || !targetImage) {
      setToast('Please fill in all fields');
      return;
    }

    setIsCreating(true);
    try {
      const projectId = await createAlbumProject(projectName.trim());
      onComplete(projectId);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Failed to create album');
      setIsCreating(false);
    }
  };

  const canCreate = projectName.trim() && initialImage && targetImage;

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-medium mb-2">Create Album</h2>
            <p className="text-text-secondary">
              Upload an initial image and a target image. The AI will generate a step-by-step
              transformation between them.
            </p>
          </div>

          {/* Project Name */}
          <div className="mb-6">
            <label className="block text-base font-medium mb-2">Album Name</label>
            <Input
              placeholder="Enter album name..."
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>

          {/* Image Upload Section */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Initial Image */}
            <div>
              <label className="block text-base font-medium mb-2">Initial Image</label>
              <Card
                variant="dashed"
                className="aspect-square flex flex-col items-center justify-center cursor-pointer hover:border-text-secondary transition-colors overflow-hidden"
                onClick={() => initialInputRef.current?.click()}
                onDrop={handleDrop('initial')}
                onDragOver={handleDragOver}
              >
                {initialImage ? (
                  <img
                    src={initialImage}
                    alt="Initial"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <PlusIcon className="text-text-secondary mb-2" size={32} />
                    <span className="text-text-secondary text-sm">
                      Click or drag to upload
                    </span>
                  </>
                )}
              </Card>
              <input
                ref={initialInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect('initial')}
              />
              {initialImage && (
                <Button
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => setInitialImage(null)}
                >
                  Remove
                </Button>
              )}
            </div>

            {/* Target Image */}
            <div>
              <label className="block text-base font-medium mb-2">Target Image</label>
              <Card
                variant="dashed"
                className="aspect-square flex flex-col items-center justify-center cursor-pointer hover:border-text-secondary transition-colors overflow-hidden"
                onClick={() => targetInputRef.current?.click()}
                onDrop={handleDrop('target')}
                onDragOver={handleDragOver}
              >
                {targetImage ? (
                  <img
                    src={targetImage}
                    alt="Target"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <ImageIcon className="text-text-secondary mb-2" size={32} />
                    <span className="text-text-secondary text-sm">
                      Click or drag to upload
                    </span>
                  </>
                )}
              </Card>
              <input
                ref={targetInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect('target')}
              />
              {targetImage && (
                <Button
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => setTargetImage(null)}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          {/* Number of Steps */}
          <div className="mb-6">
            <label className="block text-base font-medium mb-2">
              Transformation Steps: {numSteps}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={numSteps}
              onChange={(e) => setNumSteps(parseInt(e.target.value, 10))}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-text-secondary mt-1">
              <span>1 step</span>
              <span>10 steps</span>
            </div>
          </div>

          {/* Preview Arrow */}
          {initialImage && targetImage && (
            <div className="flex items-center justify-center gap-4 py-6">
              <div className="w-20 h-20 rounded-lg overflow-hidden">
                <img src={initialImage} alt="From" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col items-center text-text-secondary">
                <span className="text-2xl">→</span>
                <span className="text-sm">{numSteps} steps</span>
              </div>
              <div className="w-20 h-20 rounded-lg overflow-hidden">
                <img src={targetImage} alt="To" className="w-full h-full object-cover" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-border flex justify-between items-center">
        <Button variant="ghost" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!canCreate || isCreating}>
          {isCreating ? 'Creating...' : 'Create & Generate Prompts'}
        </Button>
      </div>

      <Toast message={toast || ''} isVisible={!!toast} onHide={() => setToast(null)} />
    </div>
  );
}
