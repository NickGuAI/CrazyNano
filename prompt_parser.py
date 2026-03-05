"""Parse multi-step prompts into individual steps."""
import re
from typing import List, Tuple


def parse_steps(prompt: str) -> List[Tuple[int, str]]:
    """
    Parse a multi-step prompt into individual steps.
    
    Args:
        prompt: Text containing "Step N:" patterns
        
    Returns:
        List of (step_number, prompt_text) tuples
    """
    # Pattern to match "Step N:" followed by content until next step or end
    pattern = r'Step\s*(\d+)\s*:\s*(.*?)(?=Step\s*\d+\s*:|$)'
    matches = re.findall(pattern, prompt, re.DOTALL | re.IGNORECASE)
    
    steps = []
    for step_num, content in matches:
        cleaned = content.strip()
        if cleaned:
            steps.append((int(step_num), cleaned))
    
    # Sort by step number
    steps.sort(key=lambda x: x[0])
    return steps


def format_steps(steps: List[Tuple[int, str]]) -> str:
    """Format steps back into a multi-step prompt string."""
    lines = []
    for num, content in steps:
        lines.append(f"Step {num}: {content}")
    return "\n\n".join(lines)
