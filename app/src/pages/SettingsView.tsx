import { useState, useEffect } from 'react';
import { Button, Card, Toast } from '@/components/ui';
import { request } from '@/services/api';
import { useGenerationStore } from '@/stores/generationStore';
import { useAlbumStore } from '@/stores/albumStore';

interface SettingsViewProps {
  onBack: () => void;
}

interface HealthResponse {
  status: string;
  version: string;
  face_recognition_available: boolean;
  providers: string[];
  current_provider: string;
  fallback_provider: string;
}

const PROVIDER_OPTIONS = [
  { value: 'poe', label: 'Poe (nano-banana-pro)' },
  { value: 'grok-2', label: 'Grok 2' },
  { value: 'gemini', label: 'Gemini Flash' },
  { value: 'gemini-pro', label: 'Gemini 3 Pro' },
];

// Fallback options exclude 'auto' since fallback must be explicit
const FALLBACK_OPTIONS = [
  { value: 'grok-2', label: 'Grok 2' },
  { value: 'poe', label: 'Poe (nano-banana-pro)' },
  { value: 'gemini', label: 'Gemini Flash' },
  { value: 'gemini-pro', label: 'Gemini 3 Pro' },
];

export function SettingsView({ onBack }: SettingsViewProps) {
  const generationStore = useGenerationStore();
  const albumStore = useAlbumStore();

  const [faceThreshold, setFaceThreshold] = useState(generationStore.faceThreshold);
  const [maxRetries, setMaxRetries] = useState(generationStore.maxRetries);
  const [preferredProvider, setPreferredProvider] = useState<string>('poe');
  const [fallbackProvider, setFallbackProvider] = useState<string>('grok-2');
  const [toast, setToast] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch health info to show available providers and current settings
    request<HealthResponse>('/health')
      .then((data) => {
        setHealth(data);
        // Initialize from server defaults if no localStorage
        if (!localStorage.getItem('preferredProvider')) {
          setPreferredProvider(data.current_provider);
        }
        if (!localStorage.getItem('fallbackProvider')) {
          setFallbackProvider(data.fallback_provider);
        }
      })
      .catch(() => setToast('Failed to load settings'))
      .finally(() => setLoading(false));

    // Load saved settings from localStorage (if any, override store defaults)
    const savedThreshold = localStorage.getItem('faceThreshold');
    const savedProvider = localStorage.getItem('preferredProvider');
    const savedFallback = localStorage.getItem('fallbackProvider');
    const savedMaxRetries = localStorage.getItem('maxRetries');
    if (savedThreshold) setFaceThreshold(parseFloat(savedThreshold));
    if (savedProvider) setPreferredProvider(savedProvider);
    if (savedFallback) setFallbackProvider(savedFallback);
    if (savedMaxRetries) setMaxRetries(parseInt(savedMaxRetries));
  }, []);

  const handleSave = () => {
    // Validate: primary and fallback should be different
    if (preferredProvider === fallbackProvider) {
      setToast('Primary and fallback providers must be different');
      return;
    }

    // Save to localStorage
    localStorage.setItem('faceThreshold', faceThreshold.toString());
    localStorage.setItem('preferredProvider', preferredProvider);
    localStorage.setItem('fallbackProvider', fallbackProvider);
    localStorage.setItem('maxRetries', maxRetries.toString());

    // Sync to stores
    generationStore.setFaceThreshold(faceThreshold);
    generationStore.setMaxRetries(maxRetries);
    generationStore.setProvider(preferredProvider as typeof generationStore.provider);
    generationStore.setFallbackProvider(fallbackProvider as typeof generationStore.fallbackProvider);
    albumStore.setFaceThreshold(faceThreshold);
    albumStore.setProvider(preferredProvider as typeof albumStore.provider);
    albumStore.setFallbackProvider(fallbackProvider as typeof albumStore.fallbackProvider);

    setToast('Settings saved');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-text-secondary">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-medium mb-2">Settings</h2>
            <p className="text-text-secondary">
              Configure default generation settings.
            </p>
          </div>

          {/* Face Validation */}
          <Card className="p-5 mb-6">
            <h3 className="text-lg font-medium mb-4">Face Validation</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Similarity Threshold: {(faceThreshold * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.05"
                value={faceThreshold}
                onChange={(e) => setFaceThreshold(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-text-secondary mt-1">
                <span>50% (lenient)</span>
                <span>100% (strict)</span>
              </div>
              <p className="text-sm text-text-secondary mt-2">
                Higher values require more face similarity between consecutive images.
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Max Retries: {maxRetries}
              </label>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={maxRetries}
                onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-text-secondary mt-1">
                <span>1 (fast)</span>
                <span>5 (thorough)</span>
              </div>
              <p className="text-sm text-text-secondary mt-2">
                How many times to retry if face validation fails.
              </p>
            </div>
            {health && (
              <div className="text-sm">
                <span className="text-text-secondary">Face recognition: </span>
                <span className={health.face_recognition_available ? 'text-green-400' : 'text-red-400'}>
                  {health.face_recognition_available ? 'Available' : 'Not installed'}
                </span>
              </div>
            )}
          </Card>

          {/* Provider Preference */}
          <Card className="p-5 mb-6">
            <h3 className="text-lg font-medium mb-4">Provider Settings</h3>

            {/* Primary Provider */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Primary Provider
              </label>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_OPTIONS.map(({ value, label }) => {
                  const isAvailable = health?.providers.includes(value);
                  const isSelected = preferredProvider === value;
                  return (
                    <Button
                      key={value}
                      variant={isSelected ? 'primary' : 'ghost'}
                      onClick={() => setPreferredProvider(value)}
                      disabled={!isAvailable}
                      className={!isAvailable ? 'opacity-50 cursor-not-allowed' : ''}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-sm text-text-secondary mt-2">
                The first provider to try for image generation.
              </p>
            </div>

            {/* Fallback Provider */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Fallback Provider
              </label>
              <div className="flex flex-wrap gap-2">
                {FALLBACK_OPTIONS.map(({ value, label }) => {
                  const isAvailable = health?.providers.includes(value);
                  const isSelected = fallbackProvider === value;
                  const isSameAsPrimary = value === preferredProvider;
                  return (
                    <Button
                      key={value}
                      variant={isSelected ? 'secondary' : 'ghost'}
                      onClick={() => setFallbackProvider(value)}
                      disabled={!isAvailable || isSameAsPrimary}
                      className={(!isAvailable || isSameAsPrimary) ? 'opacity-50 cursor-not-allowed' : ''}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-sm text-text-secondary mt-2">
                Used when the primary provider fails. Note: Grok-2 only supports text prompts (no image context).
              </p>
            </div>

            {health && (
              <div className="text-sm space-y-1 pt-2 border-t border-border">
                <div>
                  <span className="text-text-secondary">Available providers: </span>
                  <span className="text-text-primary">
                    {health.providers.length > 0 ? health.providers.join(', ') : 'None configured'}
                  </span>
                </div>
                <div>
                  <span className="text-text-secondary">Current: </span>
                  <span className="text-text-primary">{preferredProvider}</span>
                  <span className="text-text-secondary"> → Fallback: </span>
                  <span className="text-text-primary">{fallbackProvider}</span>
                </div>
              </div>
            )}
          </Card>

          {/* API Status */}
          <Card className="p-5">
            <h3 className="text-lg font-medium mb-4">API Status</h3>
            {health && (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-text-secondary">Status: </span>
                  <span className="text-green-400">{health.status}</span>
                </div>
                <div>
                  <span className="text-text-secondary">Version: </span>
                  <span className="text-text-primary">{health.version}</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-border flex justify-between items-center">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSave}>
          Save Settings
        </Button>
      </div>

      <Toast message={toast || ''} isVisible={!!toast} onHide={() => setToast(null)} />
    </div>
  );
}
