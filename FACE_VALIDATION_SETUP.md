# Face Validation Setup

Face validation requires the `face_recognition` library, which has system dependencies.

## Prerequisites

### macOS
```bash
brew install cmake
pip install face-recognition
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install cmake libboost-all-dev
pip install face-recognition
```

### Windows
1. Install Visual Studio Build Tools 2019 or later
2. Install CMake from https://cmake.org/download/
3. Add CMake to PATH
4. pip install face-recognition

## Troubleshooting

If installation fails, face validation will be automatically disabled.
The app will continue to work normally without face validation.

## Performance

Face validation adds approximately 3-5 seconds per image generation.
You can toggle face validation on/off in the settings panel.
